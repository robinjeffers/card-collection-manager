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
 * Downscale an image entirely in the browser and return a WebP blob no larger
 * than `maxDim` on its longest edge. Returns null when generation isn't
 * possible (non-image input, no canvas, decode failure, or the source is
 * already smaller than the target) — callers should fall back to the original.
 *
 * This keeps all image resizing off the server: no native modules, nothing
 * added to the Docker image.
 */
export async function createResizedWebpBlob(
  source: Blob,
  maxDim: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  if (!source.type.startsWith("image/")) return null

  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null
  try {
    let width: number
    let height: number
    let drawSource: CanvasImageSource

    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(source)
      width = bitmap.width
      height = bitmap.height
      drawSource = bitmap
    } else {
      objectUrl = URL.createObjectURL(source)
      const img = await loadHtmlImage(objectUrl)
      width = img.naturalWidth
      height = img.naturalHeight
      drawSource = img
    }

    if (!width || !height) return null

    const scale = Math.min(1, maxDim / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(drawSource, 0, 0, w, h)

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality))
  } catch {
    return null
  } finally {
    if (bitmap) bitmap.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Small WebP thumbnail for the grid. Returns null on any failure — callers
 * should upload without a thumbnail and let the grid fall back to the full image.
 */
export function createThumbnailBlob(file: Blob): Promise<Blob | null> {
  return createResizedWebpBlob(file, THUMBNAIL_MAX_DIM, THUMBNAIL_QUALITY)
}
