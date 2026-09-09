import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  MAX_IMAGE_BYTES,
  MAX_TEMPLATE_BYTES,
  MAX_THUMBNAIL_BYTES,
  MIME_EXTENSIONS,
  TEMPLATE_EXTENSION_MIME,
  THUMBNAIL_SUFFIX,
  UPLOAD_DIR,
  fileExtension,
  sanitizeUploadName,
} from "@/lib/uploads"

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

  // "file" uploads are design/source templates (validated by extension, larger
  // cap, served as a download). Everything else is treated as artwork imagery.
  const kind = form.get("kind") === "file" ? "file" : "image"
  const userRoot = path.join(UPLOAD_DIR, session.user.id)

  if (kind === "file") {
    const ext = fileExtension(file.name)
    if (!TEMPLATE_EXTENSION_MIME[ext]) {
      return NextResponse.json({ error: "Unsupported template file type" }, { status: 415 })
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      return NextResponse.json({ error: "File is larger than 100 MB" }, { status: 413 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // Store under a per-upload UUID folder so the original filename is kept
    // intact (and can't collide) — it becomes the download name when served.
    const id = randomUUID()
    const dir = path.join(userRoot, id)
    await mkdir(dir, { recursive: true })
    const safeName = sanitizeUploadName(file.name)
    await writeFile(path.join(dir, safeName), bytes)

    return NextResponse.json({
      url: `/api/uploads/${session.user.id}/${id}/${encodeURIComponent(safeName)}`,
      name: safeName,
    })
  }

  const ext = MIME_EXTENSIONS[file.type]
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // Files are namespaced by the owner's user id so the serving route can
  // enforce ownership just from the URL path.
  await mkdir(userRoot, { recursive: true })

  const id = randomUUID()
  const filename = `${id}.${ext}`
  await writeFile(path.join(userRoot, filename), bytes)

  // Optional client-generated thumbnail, stored beside the original as
  // `<id>.thumb.webp`. The grid uses it for fast, low-memory rendering; a
  // missing/invalid one is non-fatal since the grid falls back to the full image.
  const thumb = form.get("thumbnail")
  if (thumb instanceof File && thumb.type === "image/webp" && thumb.size > 0 && thumb.size <= MAX_THUMBNAIL_BYTES) {
    try {
      const thumbBytes = Buffer.from(await thumb.arrayBuffer())
      await writeFile(path.join(userRoot, `${id}${THUMBNAIL_SUFFIX}`), thumbBytes)
    } catch {
      // ignore — thumbnail is a pure optimization
    }
  }

  return NextResponse.json({ url: `/api/uploads/${session.user.id}/${filename}` })
}
