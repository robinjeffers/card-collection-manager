"use server"

import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { emptyCollection } from "@/lib/default-data"
import type { Collection, CollectionSummary } from "@/lib/types"

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
 * Repairs collections saved by earlier versions of the app: the artwork column
 * used to be labelled "Artwork Path" and could have been persisted before the
 * upload feature existed. Ensure it is named "Artwork" and typed as an image
 * column so it renders the upload control. Returns the (possibly) corrected
 * collection plus whether anything changed.
 */
function normalizeCollection(data: Collection): { data: Collection; changed: boolean } {
  let changed = false
  const columns = data.columns.map((col) => {
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
  return { data: changed ? { ...data, columns } : data, changed }
}

/** All of the signed-in user's collections, oldest first, with a card count. */
export async function listCollections(): Promise<CollectionSummary[]> {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.userId, userId))
    .orderBy(asc(collectionTable.createdAt))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardCount: isCollection(r.data) ? r.data.rows.length : 0,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  }))
}

/** A single collection owned by the user, or null if missing / not theirs. */
export async function getCollectionById(
  id: string,
): Promise<{ id: string; name: string; data: Collection } | null> {
  const userId = await getUserId()

  const [existing] = await db
    .select()
    .from(collectionTable)
    .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))
    .limit(1)

  if (!existing || !isCollection(existing.data)) return null

  const { data: normalized, changed } = normalizeCollection(existing.data)
  if (changed) {
    await db
      .update(collectionTable)
      .set({ data: normalized, updatedAt: new Date() })
      .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))
  }

  return { id: existing.id, name: existing.name, data: normalized }
}

export async function createCollection(name: string): Promise<{ id: string }> {
  const userId = await getUserId()
  const trimmed = name.trim() || "Untitled collection"
  const id = crypto.randomUUID()

  await db.insert(collectionTable).values({
    id,
    userId,
    name: trimmed,
    data: emptyCollection(),
  })

  revalidatePath("/")
  return { id }
}

export async function renameCollection(id: string, name: string): Promise<{ ok: true }> {
  const userId = await getUserId()
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Name is required")

  await db
    .update(collectionTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))

  revalidatePath("/")
  return { ok: true }
}

export async function deleteCollection(id: string): Promise<{ ok: true }> {
  const userId = await getUserId()

  await db
    .delete(collectionTable)
    .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))

  revalidatePath("/")
  return { ok: true }
}

/** Persists the contents of one collection. Scoped so a user can only write their own. */
export async function saveCollectionData(id: string, data: Collection): Promise<{ ok: true }> {
  const userId = await getUserId()
  if (!isCollection(data)) throw new Error("Invalid collection payload")

  await db
    .update(collectionTable)
    .set({ data, updatedAt: new Date() })
    .where(and(eq(collectionTable.id, id), eq(collectionTable.userId, userId)))

  return { ok: true }
}
