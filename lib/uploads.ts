import path from "path"

/**
 * Where uploaded artwork is stored on disk. In Docker this is a mounted
 * volume (see docker-compose.yml); in local dev it falls back to a folder
 * in the project root. Never inside `public/`, which is baked into the
 * standalone build at image-build time and is not writable at runtime.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads-data")

/** Reject anything larger than this to keep the volume from filling up. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8 MB

/** Allowed upload MIME types mapped to the extension we store them under. */
export const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

/** Reverse lookup used when serving a stored file back to the browser. */
export const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
}

export const ACCEPT_ATTRIBUTE = Object.keys(MIME_EXTENSIONS).join(",")
