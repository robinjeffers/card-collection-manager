/** Longest edge (px) of the small grid thumbnail we generate at upload time. */
export const THUMBNAIL_MAX_DIM = 256
/** WebP quality for the generated thumbnail (0–1). */
export const THUMBNAIL_QUALITY = 0.8

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Image decode failed"))
    img.src = url
  })
}

/**
 * Downscale an uploaded image entirely in the browser and return a small WebP
 * blob suitable for the grid. Returns null when generation isn't possible
 * (non-image file, no canvas, decode failure) — callers should simply upload
 * without a thumbnail and let the grid fall back to the full image.
 *
 * This keeps thumbnail work off the server: no native modules, nothing added
 * to the Docker image.
 */
export async function createThumbnailBlob(file: File): Promise<Blob | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  if (!file.type.startsWith("image/")) return null

  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null
  try {
    let width: number
    let height: number
    let source: CanvasImageSource

    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      source = bitmap
    } else {
      objectUrl = URL.createObjectURL(file)
      const img = await loadHtmlImage(objectUrl)
      width = img.naturalWidth
      height = img.naturalHeight
      source = img
    }

    if (!width || !height) return null

    const scale = Math.min(1, THUMBNAIL_MAX_DIM / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY))
  } catch {
    return null
  } finally {
    if (bitmap) bitmap.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
