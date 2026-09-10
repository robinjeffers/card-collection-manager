import "server-only"
import { readdir, readFile, rename, stat, writeFile } from "fs/promises"
import path from "path"
import sharp from "sharp"
import { EXTENSION_MIME, PREVIEW_SUFFIX, THUMBNAIL_SUFFIX, UPLOAD_DIR } from "@/lib/uploads"

/**
 * Server-side generation of the derived images that sit beside an original
 * upload (`<uuid>.preview.webp` and `<uuid>.thumb.webp`).
 *
 * These are produced two ways:
 *  - eagerly at upload time and by the admin "Optimize artwork" action, via
 *    {@link writeDerivedForOriginal} / {@link regenerateAllDerived}; and
 *  - lazily on first request, via {@link generateDerived} (a safety net for any
 *    original whose derivatives don't exist yet).
 *
 * Generating eagerly is what makes the detail preview reliably fast: the small
 * WebP already exists when the panel asks for it, so it never has to fall back
 * to the tiny grid thumbnail or the multi-MB original while a lazy build races.
 */

const SIZES: Record<string, { maxDim: number; quality: number; effort: number }> = {
  // Generous resolution so the detail panel stays crisp (even enlarged/hi-DPI),
  // while WebP compression keeps it to a few hundred KB instead of multi-MB.
  // `effort: 6` spends more CPU for a smaller file — worth it since we cache.
  [PREVIEW_SUFFIX]: { maxDim: 1600, quality: 82, effort: 6 },
  // Tiny grid thumbnail.
  [THUMBNAIL_SUFFIX]: { maxDim: 256, quality: 72, effort: 6 },
}

const DERIVED_SUFFIXES = [PREVIEW_SUFFIX, THUMBNAIL_SUFFIX]

/** If `filename` is a derived image we know how to generate, return its suffix. */
export function derivedSuffix(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith(PREVIEW_SUFFIX)) return PREVIEW_SUFFIX
  if (lower.endsWith(THUMBNAIL_SUFFIX)) return THUMBNAIL_SUFFIX
  return null
}

/** Resize + re-encode an original image's bytes to a derived WebP for `suffix`. */
async function encodeDerived(input: Buffer, suffix: string): Promise<Buffer> {
  const size = SIZES[suffix]
  return sharp(input, { failOn: "none", animated: false })
    .rotate() // honor EXIF orientation before stripping metadata
    .resize({ width: size.maxDim, height: size.maxDim, fit: "inside", withoutEnlargement: true })
    .webp({ quality: size.quality, effort: size.effort })
    .toBuffer()
}

/** Write `bytes` to `dest` atomically so concurrent readers never see a partial file. */
async function writeAtomic(dest: string, bytes: Buffer): Promise<void> {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, bytes)
  await rename(tmp, dest)
}

/** True when the entry is an image original (not one of our derived siblings). */
function isOriginalImage(filename: string): boolean {
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return false
  const ext = filename.slice(dot + 1).toLowerCase()
  return !!EXTENSION_MIME[ext] && !derivedSuffix(filename)
}

/**
 * Generate the requested derived files for an original image, overwriting any
 * that already exist (so stale/low-quality ones are replaced). Returns the byte
 * size of each derived file written, keyed by suffix.
 */
export async function writeDerivedForOriginal(
  originalAbsPath: string,
  suffixes: string[] = DERIVED_SUFFIXES,
): Promise<Record<string, number>> {
  const input = await readFile(originalAbsPath)
  const ext = path.extname(originalAbsPath)
  const stem = originalAbsPath.slice(0, originalAbsPath.length - ext.length)
  const written: Record<string, number> = {}
  for (const suffix of suffixes) {
    const out = await encodeDerived(input, suffix)
    await writeAtomic(stem + suffix, out)
    written[suffix] = out.length
  }
  return written
}

/**
 * Given the absolute path of a requested derived file that isn't on disk,
 * locate its source original in the same directory, resize it, cache the result
 * atomically, and return the encoded WebP bytes. Returns null when there's no
 * matching original or generation fails (caller should then 404). This is the
 * lazy safety net; eager generation at upload/optimize time normally beats it.
 */
export async function generateDerived(absDerivedPath: string): Promise<Buffer | null> {
  const dir = path.dirname(absDerivedPath)
  const filename = path.basename(absDerivedPath)
  const suffix = derivedSuffix(filename)
  if (!suffix) return null

  const stem = filename.slice(0, filename.length - suffix.length) // the "<uuid>"

  // Find the original image `<stem>.<imgext>` (e.g. `<uuid>.png`). A plain
  // `<uuid>.webp` original is allowed; the derived `<uuid>.preview.webp` never
  // matches because its stem (`<uuid>.preview`) differs.
  let originalPath: string | null = null
  try {
    for (const entry of await readdir(dir)) {
      const dot = entry.lastIndexOf(".")
      if (dot <= 0) continue
      const entryStem = entry.slice(0, dot)
      if (entryStem === stem && isOriginalImage(entry)) {
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
    const output = await encodeDerived(input, suffix)
    // Cache (non-fatal if the write fails — we still return the bytes).
    try {
      await writeAtomic(absDerivedPath, output)
    } catch {
      // ignore
    }
    return output
  } catch {
    return null
  }
}

/** Recursively collect every original image path under `dir`. */
async function collectOriginals(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectOriginals(full)))
    } else if (entry.isFile() && isOriginalImage(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export interface OptimizeSummary {
  /** Number of original images whose derivatives were (re)generated. */
  processed: number
  /** Number of originals that could not be processed (corrupt/unreadable). */
  failed: number
  /** Total bytes of the (kept, untouched) originals that were processed. */
  originalBytes: number
  /** Total bytes of the regenerated preview files. */
  previewBytes: number
  /** Total bytes of the regenerated thumbnail files. */
  thumbBytes: number
}

/**
 * Regenerate `.preview.webp` + `.thumb.webp` for every original image on disk,
 * overwriting existing derivatives at the current settings. This optimizes
 * pre-existing artwork in bulk and replaces any stale, lower-quality derivatives
 * from earlier client-side generation. Originals are never modified.
 */
export async function regenerateAllDerived(): Promise<OptimizeSummary> {
  const root = path.resolve(UPLOAD_DIR)
  const originals = await collectOriginals(root)
  const summary: OptimizeSummary = {
    processed: 0,
    failed: 0,
    originalBytes: 0,
    previewBytes: 0,
    thumbBytes: 0,
  }
  for (const original of originals) {
    try {
      const [s, written] = await Promise.all([stat(original), writeDerivedForOriginal(original)])
      summary.processed += 1
      summary.originalBytes += s.size
      summary.previewBytes += written[PREVIEW_SUFFIX] ?? 0
      summary.thumbBytes += written[THUMBNAIL_SUFFIX] ?? 0
    } catch {
      summary.failed += 1
    }
  }
  return summary
}
