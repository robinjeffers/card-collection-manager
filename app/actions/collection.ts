"use server"

import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { BLEED_COLUMN_ID, BLEED_COLUMN_NAME, LEGACY_BLEED_COLUMN_NAME, emptyCollection } from "@/lib/default-data"
import type { Collection, CollectionSummary } from "@/lib/types"

// Collections are shared: any signed-in user may view and edit every
// collection. We only require a valid session (and stamp the creator on
// create); we never scope queries by user id.
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
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
 * Repairs collections saved by earlier versions of the app:
 *  - the artwork column used to be labelled "Artwork Path" and could have been
 *    persisted before the upload feature existed, so ensure it is named
 *    "Artwork" and typed as an image column;
 *  - every collection should have the locked "Template" file column, so
 *    back-fill it (just after Artwork) when it's missing.
 * Returns the (possibly) corrected collection plus whether anything changed.
 */
function normalizeCollection(data: Collection): { data: Collection; changed: boolean } {
  let changed = false
  let columns = data.columns.map((col) => {
    if (col.isArtwork || col.id === "artwork") {
      const fixed = { ...col }
      if (fixed.name === "Artwork Path") {
        fixed.name = "Artwork"
        changed = true
      }
      if (fixed.type !== "image") {
        fixed.type = "image"
        changed = true
      }
      if (!fixed.isArtwork) {
        fixed.isArtwork = true
        changed = true
      }
      return fixed
    }
    return col
  })

  if (!columns.some((c) => c.id === "template")) {
    const templateCol: Collection["columns"][number] = {
      id: "template",
      name: "Template",
      type: "file",
      locked: true,
    }
    const artIdx = columns.findIndex((c) => c.isArtwork || c.id === "artwork")
    columns = artIdx >= 0 ? [...columns.slice(0, artIdx + 1), templateCol, ...columns.slice(artIdx + 1)] : [...columns, templateCol]
    changed = true
  }

  // Every collection also gets the locked "Artwork w/ Bleed" image column,
  // placed right after Artwork. It never drives the preview (no isArtwork).
  if (!columns.some((c) => c.id === BLEED_COLUMN_ID)) {
    const bleedCol: Collection["columns"][number] = {
      id: BLEED_COLUMN_ID,
      name: BLEED_COLUMN_NAME,
      type: "image",
      locked: true,
    }
    const artIdx = columns.findIndex((c) => c.isArtwork || c.id === "artwork")
    columns = artIdx >= 0 ? [...columns.slice(0, artIdx + 1), bleedCol, ...columns.slice(artIdx + 1)] : [...columns, bleedCol]
    changed = true
  }

  if (columns.some((c) => c.id === BLEED_COLUMN_ID && c.name === LEGACY_BLEED_COLUMN_NAME)) {
    columns = columns.map((c) =>
      c.id === BLEED_COLUMN_ID && c.name === LEGACY_BLEED_COLUMN_NAME ? { ...c, name: BLEED_COLUMN_NAME } : c,
    )
    changed = true
  }

  return { data: changed ? { ...data, columns } : data, changed }
}

/** Every collection (shared across all users), alphabetized by name, with a card count. */
export async function listCollections(): Promise<CollectionSummary[]> {
  await getUserId()
  const rows = await db.select().from(collectionTable).orderBy(asc(collectionTable.createdAt))

  return rows
    .map((r) => {
      const data = isCollection(r.data) ? r.data : null
      return {
        id: r.id,
        name: r.name,
        cardCount: data ? data.rows.length : 0,
        bannerUrl: data && typeof data.banner === "string" && data.banner ? data.banner : null,
        cardGame: data && typeof data.cardGame === "string" && data.cardGame ? data.cardGame : null,
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
}

/** A single collection by id (shared across users), or null if it's missing. */
export async function getCollectionById(
  id: string,
): Promise<{ id: string; name: string; data: Collection } | null> {
  await getUserId()

  const [existing] = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.id, id))
    .limit(1)

  if (!existing || !isCollection(existing.data)) return null

  const { data: normalized, changed } = normalizeCollection(existing.data)
  if (changed) {
    await db
      .update(collectionTable)
      .set({ data: normalized, updatedAt: new Date() })
      .where(eq(collectionTable.id, id))
  }

  return { id: existing.id, name: existing.name, data: normalized }
}

const MAX_CARD_GAME_LENGTH = 80

function cleanCardGame(value: string | undefined): string {
  return (value ?? "").trim().slice(0, MAX_CARD_GAME_LENGTH)
}

export async function createCollection(name: string, cardGame?: string): Promise<{ id: string }> {
  const userId = await getUserId()
  const trimmed = name.trim() || "Untitled collection"
  const id = crypto.randomUUID()
  const data: Collection = emptyCollection()
  const game = cleanCardGame(cardGame)
  if (game) data.cardGame = game

  await db.insert(collectionTable).values({
    id,
    userId,
    name: trimmed,
    data,
  })

  revalidatePath("/")
  return { id }
}

/**
 * Updates a collection's name and card game. The card game lives inside the
 * `data` blob (like the banner), so it needs no schema change and is included
 * in backups. An empty card game clears it.
 */
export async function renameCollection(id: string, name: string, cardGame?: string): Promise<{ ok: true }> {
  await getUserId()
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Name is required")

  const [existing] = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.id, id))
    .limit(1)
  if (!existing || !isCollection(existing.data)) throw new Error("Collection not found")

  const nextData: Collection = { ...existing.data }
  if (cardGame !== undefined) {
    const game = cleanCardGame(cardGame)
    if (game) nextData.cardGame = game
    else delete nextData.cardGame
  }

  await db
    .update(collectionTable)
    .set({ name: trimmed, data: nextData, updatedAt: new Date() })
    .where(eq(collectionTable.id, id))

  revalidatePath("/")
  revalidatePath(`/collections/${id}`)
  return { ok: true }
}

/**
 * Sets or clears a collection's banner image. The URL lives inside the
 * collection's `data` blob, so it is included in backups and restores for free
 * and needs no schema change. Passing an empty string removes the banner.
 */
export async function setCollectionBanner(id: string, bannerUrl: string): Promise<{ ok: true }> {
  await getUserId()

  const [existing] = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.id, id))
    .limit(1)

  if (!existing || !isCollection(existing.data)) throw new Error("Collection not found")

  const trimmed = bannerUrl.trim()
  const nextData: Collection = { ...existing.data }
  if (trimmed) nextData.banner = trimmed
  else delete nextData.banner

  await db
    .update(collectionTable)
    .set({ data: nextData, updatedAt: new Date() })
    .where(eq(collectionTable.id, id))

  revalidatePath("/")
  return { ok: true }
}

export async function deleteCollection(id: string): Promise<{ ok: true }> {
  await getUserId()

  await db.delete(collectionTable).where(eq(collectionTable.id, id))

  revalidatePath("/")
  return { ok: true }
}

/** Persists the contents of one collection. Any signed-in user may write. */
export async function saveCollectionData(id: string, data: Collection): Promise<{ ok: true }> {
  await getUserId()
  if (!isCollection(data)) throw new Error("Invalid collection payload")

  await db
    .update(collectionTable)
    .set({ data, updatedAt: new Date() })
    .where(eq(collectionTable.id, id))

  return { ok: true }
}
