import { readFile, stat } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { derivedSuffix, generateDerived } from "@/lib/image-derive"
import { EXTENSION_MIME, TEMPLATE_EXTENSION_MIME, UPLOAD_DIR } from "@/lib/uploads"

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
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

  const isDerived = Boolean(imageType && derivedSuffix(path.basename(resolved)))
  // Derived thumbnails/previews are tiny and content-stable, so cache them hard
  // with stale-while-revalidate: repeat views are instant, and a re-optimize
  // (new mtime -> new ETag) is picked up on the next background revalidation.
  // Originals get a shorter window since they're only ever the download target.
  const cacheControl = isDerived
    ? "private, max-age=86400, stale-while-revalidate=2592000"
    : "private, max-age=3600, stale-while-revalidate=86400"

  try {
    // ETag from size+mtime lets the browser revalidate with a cheap 304 instead
    // of resending the bytes, which keeps scrolling back through the grid snappy.
    const st = await stat(resolved)
    const etag = `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } })
    }

    const data = await readFile(resolved)
    const responseHeaders: Record<string, string> = {
      "Content-Type": imageType ?? templateType,
      "Cache-Control": cacheControl,
      ETag: etag,
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
            "Cache-Control": cacheControl,
          },
        })
      }
    }
    return new NextResponse("Not found", { status: 404 })
  }
}
