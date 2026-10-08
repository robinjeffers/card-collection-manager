import "server-only"
import { randomBytes } from "crypto"
import { asc, eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { collection as collectionTable, shareLink, shareLibraryLink } from "@/lib/db/schema"
import { BLEED_COLUMN_ID } from "@/lib/default-data"
import { previewUrl, thumbnailUrl } from "@/lib/uploads"
import type { Collection } from "@/lib/types"

const UPLOADS_PREFIX = "/api/uploads/"

/** Singleton key: there is one "all collections" link per installation. */
export const LIBRARY_SCOPE = "all"

// init-db.sql only runs against a brand-new data volume, so existing
// deployments create the share tables lazily the first time they're needed.
let ensured: Promise<void> | null = null
export function ensureShareTable(): Promise<void> {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS "share_link" (
        "token" text PRIMARY KEY,
        "collectionId" text NOT NULL UNIQUE,
        "createdBy" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "share_library_link" (
        "token" text PRIMARY KEY,
        "scope" text NOT NULL UNIQUE,
        "createdBy" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );`,
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

export async function getLibraryShareToken(): Promise<string | null> {
  await ensureShareTable()
  const [row] = await db
    .select({ token: shareLibraryLink.token })
    .from(shareLibraryLink)
    .where(eq(shareLibraryLink.scope, LIBRARY_SCOPE))
    .limit(1)
  return row?.token ?? null
}

export interface SharedDeck {
  id: string
  name: string
  data: Collection
}

export interface SharedView {
  kind: "collection" | "library"
  decks: SharedDeck[]
  /** Original `/api/uploads/...` paths (plus derived previews) the link may serve. */
  allowedFiles: Set<string>
}

function isValidData(data: unknown): data is Collection {
  const d = data as Collection | undefined
  return !!d && Array.isArray(d.columns) && Array.isArray(d.rows)
}

/**
 * Builds a read-only copy of a collection. Template files and bleed artwork are
 * production assets, so they're stripped; remaining upload URLs are rewritten
 * to the token-scoped file route and recorded in `allowedFiles`.
 */
function sanitize(data: Collection, token: string, allowedFiles: Set<string>): Collection {
  const columns = data.columns.filter((c) => c.type !== "file" && c.id !== BLEED_COLUMN_ID)
  const imageColumnIds = new Set(columns.filter((c) => c.type === "image").map((c) => c.id))
  const visibleIds = new Set(columns.map((c) => c.id))
  const sharedPrefix = `/api/share/${token}/files/`

  const rows = data.rows.map((row) => {
    const values: Collection["rows"][number]["values"] = {}
    for (const [key, value] of Object.entries(row.values)) {
      if (!visibleIds.has(key)) continue
      if (imageColumnIds.has(key) && typeof value === "string" && value.startsWith(UPLOADS_PREFIX)) {
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
  return { columns, rows, cardGame }
}

async function getSingleCollectionView(token: string): Promise<SharedView | null> {
  const [found] = await db
    .select({ id: collectionTable.id, name: collectionTable.name, data: collectionTable.data })
    .from(shareLink)
    .innerJoin(collectionTable, eq(collectionTable.id, shareLink.collectionId))
    .where(eq(shareLink.token, token))
    .limit(1)
  if (!found || !isValidData(found.data)) return null

  const allowedFiles = new Set<string>()
  return {
    kind: "collection",
    decks: [{ id: found.id, name: found.name, data: sanitize(found.data, token, allowedFiles) }],
    allowedFiles,
  }
}

async function getLibraryView(token: string): Promise<SharedView | null> {
  const [link] = await db
    .select({ token: shareLibraryLink.token })
    .from(shareLibraryLink)
    .where(eq(shareLibraryLink.token, token))
    .limit(1)
  if (!link) return null

  const rows = await db
    .select({ id: collectionTable.id, name: collectionTable.name, data: collectionTable.data })
    .from(collectionTable)
    .orderBy(asc(collectionTable.createdAt))

  const allowedFiles = new Set<string>()
  const decks = rows
    .filter((r) => isValidData(r.data))
    .map((r) => ({ id: r.id, name: r.name, data: sanitize(r.data as Collection, token, allowedFiles) }))
  return { kind: "library", decks, allowedFiles }
}

/** Resolves either a single-collection token or the all-collections token. */
export async function getSharedView(token: string): Promise<SharedView | null> {
  if (!token || token.length > 128) return null
  await ensureShareTable()
  return (await getSingleCollectionView(token)) ?? (await getLibraryView(token))
}
