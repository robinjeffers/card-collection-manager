import "server-only"
import { readFile } from "fs/promises"
import path from "path"
import { Zip, ZipPassThrough, strToU8 } from "fflate"
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

/** A small precomputed text entry (JSON/CSV) to store verbatim in the zip. */
interface TextEntry {
  name: string
  data: Uint8Array
}

/**
 * Assemble the raw DB records, per-collection CSVs, and the list of referenced
 * upload paths for a full backup. Kept separate from the streaming so the
 * (fast, small) DB work happens up front before we start emitting bytes.
 */
async function collectBackupInputs(): Promise<{ texts: TextEntry[]; files: string[]; collections: number }> {
  const [rows, referenced] = await Promise.all([
    db.select().from(collectionTable),
    collectReferencedPaths(),
  ])

  const texts: TextEntry[] = []

  // Raw DB records — the source of truth for an exact restore.
  const records = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    data: r.data,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
  texts.push({ name: "collections.json", data: strToU8(JSON.stringify(records, null, 2)) })

  // Human-readable CSV per collection (de-duplicated file names).
  const usedCsvNames = new Set<string>()
  for (const r of rows) {
    if (!isCollection(r.data)) continue
    const base = safeName(r.name)
    let candidate = base
    let n = 2
    while (usedCsvNames.has(candidate.toLowerCase())) {
      candidate = `${base}-${n}`
      n += 1
    }
    usedCsvNames.add(candidate.toLowerCase())
    texts.push({ name: `csv/${candidate}.csv`, data: strToU8(buildCsv(r.data.columns, r.data.rows)) })
  }

  return { texts, files: [...referenced], collections: records.length }
}

/** Timestamped backup filename, e.g. `ccm-backup-2026-09-11-14-30-00.zip`. */
export function backupFilename(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return `ccm-backup-${stamp}.zip`
}

/**
 * Stream a complete, restore-ready backup of every collection and its uploaded
 * files as a zip, WITHOUT ever holding the whole archive in memory. Files are
 * read and emitted one at a time (stored, not recompressed — the media is
 * already compressed), so a multi-GB library backs up with bounded memory.
 *
 * The archive preserves raw DB records (`collections.json`) for an exact
 * restore, a CSV per collection for readability, and every referenced upload
 * under `uploads/<userId>/...`. Admin-only; enforce that in callers.
 */
export async function streamFullBackup(): Promise<ReadableStream<Uint8Array>> {
  const root = path.resolve(UPLOAD_DIR)
  const { texts, files, collections } = await collectBackupInputs()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          try {
            controller.error(err)
          } catch {
            // controller may already be torn down (client aborted) — ignore.
          }
          return
        }
        if (chunk && chunk.length) {
          try {
            controller.enqueue(chunk)
          } catch {
            // client aborted — ignore
          }
        }
        if (final) {
          try {
            controller.close()
          } catch {
            // already closed — ignore
          }
        }
      })

      const addStored = (name: string, data: Uint8Array) => {
        const entry = new ZipPassThrough(name)
        zip.add(entry)
        entry.push(data, true)
      }

      // Coarse backpressure: pause reading the next file while the consumer's
      // queue is full, so queued bytes stay bounded to ~one file at a time.
      const waitForDrain = async () => {
        while (controller.desiredSize !== null && controller.desiredSize <= 0) {
          await new Promise((r) => setTimeout(r, 20))
        }
      }

      void (async () => {
        try {
          for (const t of texts) addStored(t.name, t.data)

          let fileCount = 0
          let fileBytes = 0
          for (const abs of files) {
            const rel = path.relative(root, abs)
            if (rel.startsWith("..") || path.isAbsolute(rel)) continue
            let data: Buffer
            try {
              data = await readFile(abs)
            } catch {
              // Missing/unreadable (e.g. a derived file that was never created) — skip.
              continue
            }
            await waitForDrain()
            const key = "uploads/" + rel.split(path.sep).join("/")
            const entry = new ZipPassThrough(key)
            zip.add(entry)
            entry.push(new Uint8Array(data), true)
            fileCount += 1
            fileBytes += data.byteLength
          }

          const manifest = {
            format: "card-collection-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            collections,
            files: fileCount,
            fileBytes,
          }
          addStored("manifest.json", strToU8(JSON.stringify(manifest, null, 2)))
          zip.end()
        } catch (e) {
          try {
            controller.error(e)
          } catch {
            // ignore
          }
        }
      })()
    },
  })
}
