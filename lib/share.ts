import "server-only"
import { randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { collection as collectionTable, shareLink } from "@/lib/db/schema"
import { BLEED_COLUMN_ID } from "@/lib/default-data"
import { previewUrl, thumbnailUrl } from "@/lib/uploads"
import type { Collection } from "@/lib/types"

const UPLOADS_PREFIX = "/api/uploads/"

// init-db.sql only runs against a brand-new data volume, so existing
// deployments create the share table lazily the first time it's needed.
let ensured: Promise<void> | null = null
export function ensureShareTable(): Promise<void> {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS "share_link" (
        "token" text PRIMARY KEY,
        "collectionId" text NOT NULL UNIQUE,
        "createdBy" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )`,
    )
    .then(() => undefined)
    .catch((error) => {
      ensured = null
      throw error
    })
  return ensured
}

export function newShareToken(): string {
  return randomBytes(24).toString("base64url")
}

export async function getShareTokenFor(collectionId: string): Promise<string | null> {
  await ensureShareTable()
  const [row] = await db
    .select({ token: shareLink.token })
    .from(shareLink)
    .where(eq(shareLink.collectionId, collectionId))
    .limit(1)
  return row?.token ?? null
}

export interface SharedCollection {
  name: string
  data: Collection
  /** Original `/api/uploads/...` paths (plus derived previews) the link may serve. */
  allowedFiles: Set<string>
}

/**
 * Resolves a share token to a read-only view of its collection. Template files
 * and bleed artwork are production assets, so they're stripped; remaining
 * upload URLs are rewritten to the token-scoped file route.
 */
export async function getSharedCollection(token: string): Promise<SharedCollection | null> {
  if (!token || token.length > 128) return null
  await ensureShareTable()

  const [found] = await db
    .select({ name: collectionTable.name, data: collectionTable.data })
    .from(shareLink)
    .innerJoin(collectionTable, eq(collectionTable.id, shareLink.collectionId))
    .where(eq(shareLink.token, token))
    .limit(1)

  const data = found?.data as Collection | undefined
  if (!found || !data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null

  const columns = data.columns.filter((c) => c.type !== "file" && c.id !== BLEED_COLUMN_ID)
  const imageColumnIds = columns.filter((c) => c.type === "image").map((c) => c.id)
  const visibleIds = new Set(columns.map((c) => c.id))
  const sharedPrefix = `/api/share/${token}/files/`
  const allowedFiles = new Set<string>()

  const rows = data.rows.map((row) => {
    const values: Collection["rows"][number]["values"] = {}
    for (const [key, value] of Object.entries(row.values)) {
      if (!visibleIds.has(key)) continue
      if (imageColumnIds.includes(key) && typeof value === "string" && value.startsWith(UPLOADS_PREFIX)) {
        allowedFiles.add(value)
        const preview = previewUrl(value)
        const thumb = thumbnailUrl(value)
        if (preview) allowedFiles.add(preview)
        if (thumb) allowedFiles.add(thumb)
        values[key] = sharedPrefix + value.slice(UPLOADS_PREFIX.length)
      } else {
        values[key] = value
      }
    }
    return { id: row.id, values }
  })

  const cardGame = typeof data.cardGame === "string" && data.cardGame ? data.cardGame : undefined
  return { name: found.name, data: { columns, rows, cardGame }, allowedFiles }
}
