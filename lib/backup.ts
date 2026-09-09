import "server-only"
import { readFile } from "fs/promises"
import path from "path"
import { zipSync, strToU8 } from "fflate"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { collectReferencedPaths } from "@/lib/storage-report"
import { UPLOAD_DIR } from "@/lib/uploads"
import type { CardRow, CellValue, Collection } from "@/lib/types"

function isCollection(value: unknown): value is Collection {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Collection).columns) &&
    Array.isArray((value as Collection).rows)
  )
}

/** Escape a single CSV field per RFC 4180 (quote if it contains , " or newline). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.join("; ")
  return String(value)
}

/** Build a human-readable CSV (header row = column names) for a collection. */
function buildCsv(columns: Collection["columns"], rows: CardRow[]): string {
  const header = columns.map((c) => csvField(c.name)).join(",")
  const lines = rows.map((r) => columns.map((c) => csvField(cellToText(r.values[c.id]))).join(","))
  return "\uFEFF" + [header, ...lines].join("\r\n")
}

/** Make a collection name safe to use as a file/folder base name. */
function safeName(name: string): string {
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 100) || "collection"
  )
}

/**
 * Build a complete, restore-ready backup of every collection and its uploaded
 * files as a single zip. The archive preserves raw DB records (`collections.json`)
 * and copies each referenced file verbatim under `uploads/<userId>/...` so a
 * future restore can put everything back exactly where it was. Per-collection
 * CSVs are included for human readability. Admin-only; enforce that in callers.
 */
export async function buildFullBackup(): Promise<{ bytes: Uint8Array; filename: string }> {
  const root = path.resolve(UPLOAD_DIR)
  const [rows, referenced] = await Promise.all([
    db.select().from(collectionTable),
    collectReferencedPaths(),
  ])

  const zipEntries: Record<string, Uint8Array> = {}

  // 1. Raw DB records — the source of truth for an exact restore.
  const records = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    data: r.data,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
  zipEntries["collections.json"] = strToU8(JSON.stringify(records, null, 2))

  // 2. Human-readable CSV per collection (de-duplicated file names).
  const usedCsvNames = new Set<string>()
  for (const r of rows) {
    if (!isCollection(r.data)) continue
    let base = safeName(r.name)
    let candidate = base
    let n = 2
    while (usedCsvNames.has(candidate.toLowerCase())) {
      candidate = `${base}-${n}`
      n += 1
    }
    usedCsvNames.add(candidate.toLowerCase())
    zipEntries[`csv/${candidate}.csv`] = strToU8(buildCsv(r.data.columns, r.data.rows))
  }

  // 3. Every referenced upload file, copied verbatim preserving its path so
  //    restore is a direct write back into UPLOAD_DIR.
  let fileCount = 0
  let fileBytes = 0
  for (const abs of referenced) {
    try {
      const data = await readFile(abs)
      const rel = path.relative(root, abs)
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue
      const key = "uploads/" + rel.split(path.sep).join("/")
      zipEntries[key] = new Uint8Array(data)
      fileCount += 1
      fileBytes += data.byteLength
    } catch {
      // Missing/unreadable (e.g. a derived thumbnail that was never created) — skip.
    }
  }

  const manifest = {
    format: "card-collection-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: records.length,
    files: fileCount,
    fileBytes,
  }
  zipEntries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2))

  const zipped = zipSync(zipEntries, { level: 6 })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return { bytes: new Uint8Array(zipped), filename: `ccm-backup-${stamp}.zip` }
}
