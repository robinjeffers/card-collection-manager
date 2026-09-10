import { randomUUID } from "crypto"
import { mkdir, stat, writeFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  EXTENSION_MIME,
  MAX_IMAGE_BYTES,
  MAX_PREVIEW_BYTES,
  MAX_TEMPLATE_BYTES,
  MAX_THUMBNAIL_BYTES,
  MIME_EXTENSIONS,
  PREVIEW_SUFFIX,
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
  const mode = form.get("kind")

  // Backfill mode: store a browser-generated preview beside an existing image.
  // Used to optimize images uploaded before previews existed. The target must
  // resolve to an existing image inside UPLOAD_DIR; writing a derived preview
  // beside it is harmless (collections — and their artwork — are shared).
  if (mode === "preview") {
    const target = form.get("target")
    const preview = form.get("preview")
    if (typeof target !== "string" || !(preview instanceof File)) {
      return NextResponse.json({ error: "Invalid preview request" }, { status: 400 })
    }
    if (preview.type !== "image/webp" || preview.size <= 0 || preview.size > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ error: "Invalid preview file" }, { status: 400 })
    }
    const root = path.resolve(UPLOAD_DIR)
    const rel = target.startsWith("/api/uploads/") ? target.slice("/api/uploads/".length).split("?")[0] : ""
    const segments = rel.split("/").filter(Boolean).map(decodeURIComponent)
    const abs = path.resolve(root, ...segments)
    if (abs === root || !abs.startsWith(root + path.sep)) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 })
    }
    const targetExt = path.extname(abs).slice(1).toLowerCase()
    if (!EXTENSION_MIME[targetExt]) {
      return NextResponse.json({ error: "Target is not an image" }, { status: 400 })
    }
    try {
      await stat(abs) // the original must exist before we write a sibling
    } catch {
      return NextResponse.json({ error: "Target not found" }, { status: 404 })
    }
    const previewPath = abs.slice(0, abs.length - path.extname(abs).length) + PREVIEW_SUFFIX
    try {
      await writeFile(previewPath, Buffer.from(await preview.arrayBuffer()))
    } catch {
      return NextResponse.json({ error: "Could not store preview" }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  // "file" uploads are design/source templates (validated by extension, larger
  // cap, served as a download). Everything else is treated as artwork imagery.
  const kind = mode === "file" ? "file" : "image"
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

  // Optional client-generated medium preview, stored beside the original as
  // `<id>.preview.webp`. The detail panel uses it for a fast first paint; a
  // missing one is non-fatal (the panel backfills it or falls back to the full).
  const preview = form.get("preview")
  if (preview instanceof File && preview.type === "image/webp" && preview.size > 0 && preview.size <= MAX_PREVIEW_BYTES) {
    try {
      const previewBytes = Buffer.from(await preview.arrayBuffer())
      await writeFile(path.join(userRoot, `${id}${PREVIEW_SUFFIX}`), previewBytes)
    } catch {
      // ignore — preview is a pure optimization
    }
  }

  return NextResponse.json({ url: `/api/uploads/${session.user.id}/${filename}` })
}
