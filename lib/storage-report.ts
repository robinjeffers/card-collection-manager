import "server-only"
import { readdir, rmdir, stat, unlink } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { user } from "@/lib/db/schema"
import { EXTENSION_MIME, PREVIEW_SUFFIX, TEMPLATE_EXTENSION_MIME, THUMBNAIL_SUFFIX, UPLOAD_DIR } from "@/lib/uploads"
import type { Collection } from "@/lib/types"

const UPLOAD_PREFIX = "/api/uploads/"

/**
 * Files modified within this window are never treated as orphans. A freshly
 * uploaded image that the user hasn't attached to a saved card yet looks
 * unreferenced, so the grace period keeps cleanup from racing an in-progress
 * edit and deleting a file that's about to be used.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000 // 1 hour

export type StorageCategory = "image" | "preview" | "thumbnail" | "template" | "other"

export interface StorageReport {
  totalBytes: number
  totalFiles: number
  categories: Record<StorageCategory, { bytes: number; files: number }>
  orphanBytes: number
  orphanFiles: number
  /** Files skipped from orphan cleanup because they are within the grace window. */
  recentlyModifiedSkipped: number
  perUser: { userId: string; name: string | null; email: string | null; bytes: number; files: number }[]
  generatedAt: string
}

/** Resolve an `/api/uploads/...` reference to an absolute path inside UPLOAD_DIR, or null. */
function resolveRef(ref: string, root: string): string | null {
  if (!ref.startsWith(UPLOAD_PREFIX)) return null
  const rel = ref.slice(UPLOAD_PREFIX.length).split("?")[0]
  const segments = rel.split("/").filter(Boolean).map(decodeURIComponent)
  const abs = path.resolve(root, ...segments)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  return abs
}

function isCollection(value: unknown): value is Collection {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Collection).columns) &&
    Array.isArray((value as Collection).rows)
  )
}

/**
 * Every on-disk file referenced by any collection. Because collections are
 * shared, this spans all users. For each referenced image we also mark its
 * derived `.thumb.webp` sibling as referenced so thumbnails of live images are
 * never mistaken for orphans.
 */
export async function collectReferencedPaths(): Promise<Set<string>> {
  const root = path.resolve(UPLOAD_DIR)
  const rows = await db.select({ data: collectionTable.data }).from(collectionTable)
  const refs = new Set<string>()

  // Mark a `/api/uploads/...` reference (and, for images, its derived
  // `.thumb.webp`/`.preview.webp` siblings) as live so cleanup never deletes it
  // and backups always include it.
  const addRef = (value: unknown, withDerived: boolean) => {
    if (typeof value !== "string" || !value) return
    const abs = resolveRef(value, root)
    if (!abs) return
    refs.add(abs)
    if (!withDerived) return
    const dot = abs.lastIndexOf(".")
    if (dot > abs.lastIndexOf(path.sep)) {
      refs.add(abs.slice(0, dot) + THUMBNAIL_SUFFIX)
      refs.add(abs.slice(0, dot) + PREVIEW_SUFFIX)
    }
  }

  for (const { data } of rows) {
    if (!isCollection(data)) continue
    const imageCols = new Set(data.columns.filter((c) => c.type === "image").map((c) => c.id))
    const fileCols = new Set(data.columns.filter((c) => c.type === "file").map((c) => c.id))

    // Collection banner: an uploaded image referenced from `data.banner` (not a
    // column), so it must be tracked explicitly or it looks unreferenced and
    // gets deleted by orphan cleanup / omitted from backups.
    addRef(data.banner, true)

    for (const row of data.rows) {
      // Image cells: mark the image and its derived `.thumb`/`.preview` siblings
      // so live images' optimizations are never treated as orphans.
      for (const colId of imageCols) addRef(row.values?.[colId], true)
      // File/template cells: just the file itself (no derived siblings).
      for (const colId of fileCols) addRef(row.values?.[colId], false)
    }
  }

  return refs
}

/** Recursively list every file under `dir` with its size and last-modified time. */
async function walkFiles(dir: string): Promise<{ path: string; size: number; mtimeMs: number }[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: { path: string; size: number; mtimeMs: number }[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)))
    } else if (entry.isFile()) {
      try {
        const s = await stat(full)
        out.push({ path: full, size: s.size, mtimeMs: s.mtimeMs })
      } catch {
        // File vanished mid-scan — ignore.
      }
    }
  }
  return out
}

function categoryOf(file: string): StorageCategory {
  const base = path.basename(file).toLowerCase()
  // Check preview before thumbnail: both end in `.webp`, so match the full
  // derived suffix first.
  if (base.endsWith(PREVIEW_SUFFIX)) return "preview"
  if (base.endsWith(THUMBNAIL_SUFFIX)) return "thumbnail"
  const ext = path.extname(base).slice(1)
  if (EXTENSION_MIME[ext]) return "image"
  if (TEMPLATE_EXTENSION_MIME[ext]) return "template"
  return "other"
}

/** The user-id namespace (first path segment under UPLOAD_DIR) that owns a file. */
function ownerSegment(abs: string, root: string): string {
  const rel = path.relative(root, abs)
  return rel.split(path.sep)[0] || "unknown"
}

/**
 * Scan the DB + disk once and produce the storage report plus the concrete list
 * of orphan paths (kept server-side; never sent to the client). An orphan is a
 * file on disk that no collection references and that is older than the grace
 * window.
 */
export async function buildStorageReport(): Promise<{ report: StorageReport; orphanPaths: string[] }> {
  const root = path.resolve(UPLOAD_DIR)
  const [refs, files] = await Promise.all([collectReferencedPaths(), walkFiles(root)])
  const now = Date.now()

  const categories: Record<StorageCategory, { bytes: number; files: number }> = {
    image: { bytes: 0, files: 0 },
    preview: { bytes: 0, files: 0 },
    thumbnail: { bytes: 0, files: 0 },
    template: { bytes: 0, files: 0 },
    other: { bytes: 0, files: 0 },
  }
  const perUserMap = new Map<string, { bytes: number; files: number }>()
  const orphanPaths: string[] = []
  let totalBytes = 0
  let totalFiles = 0
  let orphanBytes = 0
  let orphanFiles = 0
  let recentlyModifiedSkipped = 0

  for (const file of files) {
    totalBytes += file.size
    totalFiles += 1

    const cat = categoryOf(file.path)
    categories[cat].bytes += file.size
    categories[cat].files += 1

    const owner = ownerSegment(file.path, root)
    const pu = perUserMap.get(owner) ?? { bytes: 0, files: 0 }
    pu.bytes += file.size
    pu.files += 1
    perUserMap.set(owner, pu)

    if (!refs.has(file.path)) {
      if (now - file.mtimeMs < ORPHAN_GRACE_MS) {
        recentlyModifiedSkipped += 1
      } else {
        orphanBytes += file.size
        orphanFiles += 1
        orphanPaths.push(file.path)
      }
    }
  }

  // Resolve owner namespaces to human-readable names.
  const userRows = perUserMap.size
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user)
    : []
  const infoById = new Map(userRows.map((u) => [u.id, { name: u.name, email: u.email }]))
  const perUser = [...perUserMap.entries()]
    .map(([userId, v]) => ({
      userId,
      name: infoById.get(userId)?.name ?? null,
      email: infoById.get(userId)?.email ?? null,
      bytes: v.bytes,
      files: v.files,
    }))
    .sort((a, b) => b.bytes - a.bytes)

  return {
    report: {
      totalBytes,
      totalFiles,
      categories,
      orphanBytes,
      orphanFiles,
      recentlyModifiedSkipped,
      perUser,
      generatedAt: new Date().toISOString(),
    },
    orphanPaths,
  }
}

/** Remove now-empty directories under `root` (but never `root` itself). */
async function removeEmptyDirs(dir: string, root: string): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }
  let empty = true
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childEmpty = await removeEmptyDirs(path.join(dir, entry.name), root)
      if (!childEmpty) empty = false
    } else {
      empty = false
    }
  }
  if (empty && dir !== root) {
    try {
      await rmdir(dir)
    } catch {
      return false
    }
  }
  return empty
}

/**
 * Delete every current orphan file (recomputed fresh for safety) and prune any
 * directories left empty. Returns how much was reclaimed. Path containment is
 * re-checked per file before unlinking.
 */
export async function deleteOrphanFiles(): Promise<{ deleted: number; bytes: number }> {
  const root = path.resolve(UPLOAD_DIR)
  const { orphanPaths } = await buildStorageReport()
  let deleted = 0
  let bytes = 0

  for (const p of orphanPaths) {
    if (p !== root && !p.startsWith(root + path.sep)) continue
    try {
      const s = await stat(p)
      await unlink(p)
      deleted += 1
      bytes += s.size
    } catch {
      // Already gone / unreadable — skip.
    }
  }

  await removeEmptyDirs(root, root)
  return { deleted, bytes }
}
