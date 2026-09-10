import { readdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"
import sharp from "sharp"
import { EXTENSION_MIME, PREVIEW_SUFFIX, THUMBNAIL_SUFFIX } from "@/lib/uploads"

/**
 * Server-side, on-demand generation of the derived images that sit beside an
 * original upload (`<uuid>.preview.webp` and `<uuid>.thumb.webp`).
 *
 * This runs in the serve route: the first time a derived file is requested and
 * isn't on disk yet, we resize the original with sharp, cache the result to
 * disk, and return the bytes. Every later request is served straight from the
 * cached file. This is what makes optimization work uniformly for both new and
 * pre-existing images — no client-side work and no per-view double download.
 */

const SIZES: Record<string, { maxDim: number; quality: number }> = {
  // Generous resolution so the detail panel stays crisp (even enlarged/hi-DPI),
  // while WebP compression keeps it to a few hundred KB instead of multi-MB.
  [PREVIEW_SUFFIX]: { maxDim: 1600, quality: 82 },
  // Tiny grid thumbnail.
  [THUMBNAIL_SUFFIX]: { maxDim: 256, quality: 72 },
}

/** If `filename` is a derived image we know how to generate, return its suffix. */
export function derivedSuffix(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith(PREVIEW_SUFFIX)) return PREVIEW_SUFFIX
  if (lower.endsWith(THUMBNAIL_SUFFIX)) return THUMBNAIL_SUFFIX
  return null
}

/**
 * Given the absolute path of a requested derived file that isn't on disk,
 * locate its source original in the same directory, resize it, cache the result
 * atomically, and return the encoded WebP bytes. Returns null when there's no
 * matching original or generation fails (caller should then 404).
 */
export async function generateDerived(absDerivedPath: string): Promise<Buffer | null> {
  const dir = path.dirname(absDerivedPath)
  const filename = path.basename(absDerivedPath)
  const suffix = derivedSuffix(filename)
  if (!suffix) return null

  const stem = filename.slice(0, filename.length - suffix.length) // the "<uuid>"
  const size = SIZES[suffix]

  // Find the original image `<stem>.<imgext>` (e.g. `<uuid>.png`). A plain
  // `<uuid>.webp` original is allowed; the derived `<uuid>.preview.webp` never
  // matches because its stem (`<uuid>.preview`) differs.
  let originalPath: string | null = null
  try {
    for (const entry of await readdir(dir)) {
      const dot = entry.lastIndexOf(".")
      if (dot <= 0) continue
      const entryStem = entry.slice(0, dot)
      const entryExt = entry.slice(dot + 1).toLowerCase()
      if (entryStem === stem && EXTENSION_MIME[entryExt] && !derivedSuffix(entry)) {
        originalPath = path.join(dir, entry)
        break
      }
    }
  } catch {
    return null
  }
  if (!originalPath) return null

  try {
    const input = await readFile(originalPath)
    const output = await sharp(input, { failOn: "none", animated: false })
      .rotate() // honor EXIF orientation before stripping metadata
      .resize({ width: size.maxDim, height: size.maxDim, fit: "inside", withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toBuffer()

    // Cache atomically so concurrent requests never observe a partial file.
    const tmp = `${absDerivedPath}.tmp-${process.pid}-${Date.now()}`
    try {
      await writeFile(tmp, output)
      await rename(tmp, absDerivedPath)
    } catch {
      // A cache-write failure is non-fatal — still return the bytes we made.
    }
    return output
  } catch {
    return null
  }
}
