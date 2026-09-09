import path from "path"

/**
 * Where uploaded artwork is stored on disk. In Docker this is a mounted
 * volume (see docker-compose.yml); in local dev it falls back to a folder
 * in the project root. Never inside `public/`, which is baked into the
 * standalone build at image-build time and is not writable at runtime.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads-data")

/** Size cap for image (artwork) uploads. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB

/**
 * Size cap for template/source-file uploads (Affinity, PSD, etc.). These are
 * design source files and are routinely much larger than rendered artwork.
 */
export const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024 // 100 MB

/** Allowed image upload MIME types mapped to the extension we store them under. */
export const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

/** Reverse lookup used when serving a stored image back to the browser inline. */
export const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
}

/**
 * Template/source design files. Affinity's `.afdesign`/`.afpub` (and several
 * of the others) have no registered browser MIME type — the browser sends
 * `application/octet-stream` or an empty type — so these uploads are validated
 * by file extension rather than MIME. The mapped value is the Content-Type we
 * serve them back with; they are always served as an attachment (download).
 */
export const TEMPLATE_EXTENSION_MIME: Record<string, string> = {
  afdesign: "application/octet-stream",
  afpub: "application/octet-stream",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/illustrator",
  eps: "application/postscript",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  pdf: "application/pdf",
}

export const ACCEPT_ATTRIBUTE = Object.keys(MIME_EXTENSIONS).join(",")

export const TEMPLATE_ACCEPT_ATTRIBUTE = Object.keys(TEMPLATE_EXTENSION_MIME)
  .map((e) => `.${e}`)
  .join(",")

/** Lowercased extension (without the dot) from a filename, or "" if none. */
export function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".")
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : ""
}

/**
 * Reduce an uploaded file's name to a safe on-disk base name that preserves
 * the original name (and extension) for a meaningful download later.
 */
export function sanitizeUploadName(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "file"
  const cleaned = base
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120)
  return cleaned || "file"
}
