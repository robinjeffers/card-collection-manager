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
import type { CardRow, Collection } from "@/lib/types"

const UPLOAD_PREFIX = "/api/uploads/"

function isCollection(value: unknown): value is Collection {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Collection).columns) &&
    Array.isArray((value as Collection).rows)
  )
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

  // Bundle referenced images and rewrite cell values to relative paths so the
  // export is self-contained and portable to another instance.
  const files: Record<string, Uint8Array> = {}
  const seen = new Set<string>()

  const rows: CardRow[] = source.rows.map((r) => {
    const values = { ...r.values }
    for (const colId of imageColumnIds) {
      const ref = values[colId]
      if (typeof ref !== "string" || !ref) continue
      const resolved = resolveUpload(ref, userId)
      if (!resolved) continue // external URL or invalid — leave untouched
      values[colId] = `images/${resolved.base}`
      seen.add(resolved.base)
      // Mark for reading; dedupe by basename.
      if (!(resolved.base in files)) {
        files[resolved.base] = new Uint8Array() // placeholder, filled below
        ;(files as Record<string, Uint8Array>)[resolved.base] = resolved.abs as unknown as Uint8Array
      }
    }
    return { ...r, values }
  })

  // Read the actual bytes for each unique referenced image.
  const zipEntries: Record<string, Uint8Array> = {}
  for (const base of seen) {
    // Find the absolute path we stashed while walking rows.
    const abs = filePathFor(source, userId, base)
    if (!abs) continue
    try {
      const data = await readFile(abs)
      zipEntries[`images/${base}`] = new Uint8Array(data)
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

/** Re-resolve a stored basename back to its absolute upload path for reading. */
function filePathFor(source: Collection, userId: string, base: string): string | null {
  const imageColumnIds = new Set(source.columns.filter((c) => c.type === "image").map((c) => c.id))
  for (const r of source.rows) {
    for (const colId of imageColumnIds) {
      const ref = r.values[colId]
      if (typeof ref !== "string") continue
      const resolved = resolveUpload(ref, userId)
      if (resolved && resolved.base === base) return resolved.abs
    }
  }
  return null
}
