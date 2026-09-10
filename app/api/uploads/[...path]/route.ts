import { readFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { derivedSuffix, generateDerived } from "@/lib/image-derive"
import { EXTENSION_MIME, TEMPLATE_EXTENSION_MIME, UPLOAD_DIR } from "@/lib/uploads"

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const segments = (await params).path ?? []

  // Collections (and their artwork/templates) are shared, so any signed-in user
  // may read any uploaded file. The first path segment is just the uploader's
  // user id namespace; we no longer restrict reads to the caller's own namespace.

  // Resolve the target and confirm it stays inside UPLOAD_DIR (block `..`).
  const root = path.resolve(UPLOAD_DIR)
  const resolved = path.resolve(root, ...segments)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return new NextResponse("Bad request", { status: 400 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const imageType = EXTENSION_MIME[ext]
  const templateType = TEMPLATE_EXTENSION_MIME[ext]
  if (!imageType && !templateType) {
    return new NextResponse("Unsupported", { status: 415 })
  }

  try {
    const data = await readFile(resolved)
    const responseHeaders: Record<string, string> = {
      "Content-Type": imageType ?? templateType,
      "Cache-Control": "private, max-age=3600",
    }
    // Template/source files are always sent as a download, never rendered
    // inline (this also neutralizes any SVG script content).
    if (!imageType && templateType) {
      const base = path.basename(resolved)
      responseHeaders["Content-Disposition"] = `attachment; filename="${base.replace(/"/g, "")}"`
    }
    return new NextResponse(new Uint8Array(data), { headers: responseHeaders })
  } catch {
    // Not on disk. If this is a derived image (`.preview.webp`/`.thumb.webp`),
    // generate it from the original on demand, cache it, and serve it. This is
    // what optimizes pre-existing artwork the first time it's viewed, with no
    // client-side work.
    if (imageType && derivedSuffix(path.basename(resolved))) {
      const generated = await generateDerived(resolved)
      if (generated) {
        return new NextResponse(new Uint8Array(generated), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "private, max-age=3600",
          },
        })
      }
    }
    return new NextResponse("Not found", { status: 404 })
  }
}
