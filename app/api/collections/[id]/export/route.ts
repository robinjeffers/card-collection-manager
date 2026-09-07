import { readFile } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { zipSync, strToU8 } from "fflate"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { UPLOAD_DIR } from "@/lib/uploads"
import type { CardRow, CellValue, Collection } from "@/lib/types"

const UPLOAD_PREFIX = "/api/uploads/"

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
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Render a cell value to a flat string for the spreadsheet. */
function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.join("; ")
  return String(value)
}

/** Build a CSV (header row = column names) from the collection's columns/rows. */
function buildCsv(columns: Collection["columns"], rows: CardRow[]): string {
  const header = columns.map((c) => csvField(c.name)).join(",")
  const lines = rows.map((r) => columns.map((c) => csvField(cellToText(r.values[c.id]))).join(","))
  // Prepend a UTF-8 BOM so Excel detects the encoding correctly.
  return "\uFEFF" + [header, ...lines].join("\r\n")
}

/** Turn a Card Name into a safe filesystem base name (no extension). */
function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-") // strip characters illegal in filenames
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "") // no leading dots (hidden files)
    .slice(0, 100)
    .trim()
}

/** Safely resolve an /api/uploads/<userId>/<file> reference to a disk path. */
function resolveUpload(ref: string, userId: string): { abs: string; base: string } | null {
  if (!ref.startsWith(UPLOAD_PREFIX)) return null
  const rel = ref.slice(UPLOAD_PREFIX.length).split("?")[0]
  const segments = rel.split("/").filter(Boolean).map(decodeURIComponent)
  // Must live under the requesting user's namespace.
  if (segments[0] !== userId) return null

  const root = path.resolve(UPLOAD_DIR)
  const abs = path.resolve(root, ...segments)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null

  return { abs, base: path.basename(abs) }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const userId = session.user.id
  const { id } = await params

  const [row] = await db
    .select()
    .from(collectionTable)
    .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))
    .limit(1)

  if (!row || !isCollection(row.data)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const source = row.data
  const imageColumnIds = new Set(source.columns.filter((c) => c.type === "image").map((c) => c.id))

  // The column holding each card's name — used to name the exported image files.
  const nameColId =
    source.columns.find((c) => c.id === "name")?.id ??
    source.columns.find((c) => c.type === "text")?.id ??
    source.columns[0]?.id

  // Walk the rows once: rewrite each in-app image reference to a relative
  // `images/<Card Name>.<ext>` path and collect the disk paths to read.
  // Exported filenames are derived from the card name and de-duplicated so
  // repeated or empty names never collide.
  const toRead: { filename: string; abs: string }[] = []
  const usedNames = new Set<string>()

  const uniqueImageName = (cardName: string, ext: string) => {
    const base = sanitizeFileName(cardName) || "card"
    let candidate = `${base}${ext}`
    let n = 2
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${base}-${n}${ext}`
      n += 1
    }
    usedNames.add(candidate.toLowerCase())
    return candidate
  }

  const rows: CardRow[] = source.rows.map((r) => {
    const values = { ...r.values }
    const cardName = nameColId ? cellToText(r.values[nameColId]) : ""
    for (const colId of imageColumnIds) {
      const ref = values[colId]
      if (typeof ref !== "string" || !ref) continue
      const resolved = resolveUpload(ref, userId)
      if (!resolved) continue // external URL or invalid — leave untouched
      const filename = uniqueImageName(cardName, path.extname(resolved.base))
      values[colId] = `images/${filename}`
      toRead.push({ filename, abs: resolved.abs })
    }
    return { ...r, values }
  })

  // Read the actual bytes for each referenced image.
  const zipEntries: Record<string, Uint8Array> = {}
  for (const { filename, abs } of toRead) {
    try {
      const data = await readFile(abs)
      zipEntries[`images/${filename}`] = new Uint8Array(data)
    } catch {
      // Skip missing files rather than failing the whole export.
    }
  }

  const manifest = {
    format: "card-collection-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: row.name,
    collection: { columns: source.columns, rows } satisfies Collection,
  }

  zipEntries["collection.json"] = strToU8(JSON.stringify(manifest, null, 2))
  zipEntries["collection.csv"] = strToU8(buildCsv(source.columns, rows))

  const zipped = zipSync(zipEntries, { level: 6 })
  const safeName = row.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "collection"

  return new NextResponse(new Uint8Array(zipped), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
