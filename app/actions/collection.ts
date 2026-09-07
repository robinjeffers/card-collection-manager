"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { collection as collectionTable } from "@/lib/db/schema"
import { defaultCollection } from "@/lib/default-data"
import type { Collection } from "@/lib/types"

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
 * the artwork column used to be labelled "Artwork Path" and could have been
 * persisted before the upload feature existed. Ensure it is named "Artwork"
 * and typed as an image column so it renders the upload control.
 * Returns the (possibly) corrected collection plus whether anything changed.
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

/**
 * Returns the signed-in user's collection, seeding the default collection
 * on first access so every account starts with the sample cards.
 */
export async function getCollection(): Promise<Collection> {
  const userId = await getUserId()

  const [existing] = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.userId, userId))
    .limit(1)

  if (existing && isCollection(existing.data)) {
    const { data: normalized, changed } = normalizeCollection(existing.data)
    if (changed) {
      await db
        .update(collectionTable)
        .set({ data: normalized, updatedAt: new Date() })
        .where(eq(collectionTable.userId, userId))
    }
    return normalized
  }

  await db
    .insert(collectionTable)
    .values({ userId, data: defaultCollection })
    .onConflictDoNothing({ target: collectionTable.userId })

  return defaultCollection
}

export async function saveCollection(data: Collection): Promise<{ ok: true }> {
  const userId = await getUserId()
  if (!isCollection(data)) throw new Error("Invalid collection payload")

  await db
    .insert(collectionTable)
    .values({ userId, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: collectionTable.userId,
      set: { data, updatedAt: new Date() },
    })

  return { ok: true }
}
