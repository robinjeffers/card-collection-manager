import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serveUpload } from "@/lib/serve-upload"

// Collections (and their artwork/templates) are shared, so any signed-in user
// may read any uploaded file. The first path segment is just the uploader's
// user id namespace; reads are not restricted to the caller's own namespace.
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  return serveUpload(request, (await params).path ?? [])
}
