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
    return existing.data
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
