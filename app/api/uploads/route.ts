import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { MAX_UPLOAD_BYTES, MIME_EXTENSIONS, UPLOAD_DIR } from "@/lib/uploads"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const ext = MIME_EXTENSIONS[file.type]
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // Files are namespaced by the owner's user id so the serving route can
  // enforce ownership just from the URL path.
  const userDir = path.join(UPLOAD_DIR, session.user.id)
  await mkdir(userDir, { recursive: true })

  const filename = `${randomUUID()}.${ext}`
  await writeFile(path.join(userDir, filename), bytes)

  return NextResponse.json({ url: `/api/uploads/${session.user.id}/${filename}` })
}
