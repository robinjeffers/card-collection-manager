import { NextResponse } from "next/server"
import { serveUpload } from "@/lib/serve-upload"
import { getSharedView } from "@/lib/share"

// Public, token-scoped file access: only artwork referenced by the shared
// collection(s) (and derived previews/thumbnails) can be served.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; path: string[] }> },
) {
  const { token, path: segments = [] } = await params
  const shared = await getSharedView(token)
  if (!shared) return new NextResponse("Not found", { status: 404 })

  const requested = `/api/uploads/${segments.join("/")}`
  if (!shared.allowedFiles.has(requested)) {
    return new NextResponse("Not found", { status: 404 })
  }
  return serveUpload(request, segments)
}
