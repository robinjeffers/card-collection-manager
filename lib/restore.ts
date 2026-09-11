import "server-only"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { unzipSync, strFromU8 } from "fflate"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { UPLOAD_DIR } from "@/lib/uploads"
import type { Collection } from "@/lib/types"

interface BackupRecord {
  id: string
  userId: string
  name: string
  data: unknown
  createdAt?: string
  updatedAt?: string
}

function isCollectionData(value: unknown): value is Collection {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Collection).columns) &&
    Array.isArray((value as Collection).rows)
  )
}

export interface RestoreResult {
  collectionsRestored: number
  filesRestored: number
  fileBytes: number
  skipped: string[]
}

/**
 * Restore a backup produced by {@link streamFullBackup}. This is a MERGE, not a
 * wipe: collections are upserted by id (added or overwritten) and files are
 * written back into UPLOAD_DIR, but nothing already present that isn't in the
 * backup is deleted. Safe to run against an empty instance (disaster recovery)
 * or a live one (restoring a specific collection). Admin-only; enforce in caller.
 */
export async function restoreFromBackup(zipBytes: Uint8Array): Promise<RestoreResult> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBytes)
  } catch {
    throw new Error("That file isn't a valid zip archive.")
  }

  // Validate this is one of our backups before touching anything.
  const manifestRaw = files["manifest.json"]
  if (!manifestRaw) {
    throw new Error("Missing manifest.json — this doesn't look like a Card Collection Manager backup.")
  }
  let manifest: { format?: string } | null = null
  try {
    manifest = JSON.parse(strFromU8(manifestRaw))
  } catch {
    throw new Error("The backup's manifest.json is corrupt.")
  }
  if (manifest?.format !== "card-collection-backup") {
    throw new Error("Unrecognized backup format.")
  }

  const collectionsRaw = files["collections.json"]
  if (!collectionsRaw) throw new Error("The backup is missing collections.json.")
  let records: BackupRecord[]
  try {
    const parsed = JSON.parse(strFromU8(collectionsRaw))
    if (!Array.isArray(parsed)) throw new Error()
    records = parsed
  } catch {
    throw new Error("The backup's collections.json is corrupt.")
  }

  const skipped: string[] = []
  const root = path.resolve(UPLOAD_DIR)

  // 1. Write files back first, so artwork resolves the moment collections return.
  let filesRestored = 0
  let fileBytes = 0
  for (const [key, bytes] of Object.entries(files)) {
    if (!key.startsWith("uploads/")) continue
    const rel = key.slice("uploads/".length)
    if (!rel) continue
    const abs = path.resolve(root, rel)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      skipped.push(key) // path traversal attempt — refuse.
      continue
    }
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, bytes)
    filesRestored += 1
    fileBytes += bytes.byteLength
  }

  // 2. Upsert collections by id (add or overwrite; never delete others).
  let collectionsRestored = 0
  for (const rec of records) {
    if (
      !rec ||
      typeof rec.id !== "string" ||
      typeof rec.userId !== "string" ||
      typeof rec.name !== "string" ||
      !isCollectionData(rec.data)
    ) {
      skipped.push(`collection ${rec?.id ?? "(unknown)"}`)
      continue
    }
    const createdAt = rec.createdAt ? new Date(rec.createdAt) : new Date()
    const updatedAt = rec.updatedAt ? new Date(rec.updatedAt) : new Date()
    await db
      .insert(collectionTable)
      .values({ id: rec.id, userId: rec.userId, name: rec.name, data: rec.data, createdAt, updatedAt })
      .onConflictDoUpdate({
        target: collectionTable.id,
        set: { userId: rec.userId, name: rec.name, data: rec.data, updatedAt },
      })
    collectionsRestored += 1
  }

  return { collectionsRestored, filesRestored, fileBytes, skipped }
}
