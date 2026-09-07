import { readFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { EXTENSION_MIME, UPLOAD_DIR } from "@/lib/uploads"

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const segments = (await params).path ?? []

  // Collections (and their artwork) are shared, so any signed-in user may read
  // any uploaded image. The first path segment is just the uploader's user id
  // namespace; we no longer restrict reads to the caller's own namespace.

  // Resolve the target and confirm it stays inside UPLOAD_DIR (block `..`).
  const root = path.resolve(UPLOAD_DIR)
  const resolved = path.resolve(root, ...segments)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return new NextResponse("Bad request", { status: 400 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const contentType = EXTENSION_MIME[ext]
  if (!contentType) {
    return new NextResponse("Unsupported", { status: 415 })
  }

  try {
    const data = await readFile(resolved)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
