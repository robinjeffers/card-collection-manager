"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { collection as collectionTable, shareLibraryLink, shareLink } from "@/lib/db/schema"
import { LIBRARY_SCOPE, ensureShareTable, newShareToken } from "@/lib/share"

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** Creates a share link, replacing (and invalidating) any existing one. */
export async function createShareLink(collectionId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  await ensureShareTable()

  const [exists] = await db
    .select({ id: collectionTable.id })
    .from(collectionTable)
    .where(eq(collectionTable.id, collectionId))
    .limit(1)
  if (!exists) throw new Error("Collection not found")

  const token = newShareToken()
  await db.transaction(async (tx) => {
    await tx.delete(shareLink).where(eq(shareLink.collectionId, collectionId))
    await tx.insert(shareLink).values({ token, collectionId, createdBy: userId })
  })
  return { token }
}

export async function revokeShareLink(collectionId: string): Promise<{ ok: true }> {
  await requireUserId()
  await ensureShareTable()
  await db.delete(shareLink).where(eq(shareLink.collectionId, collectionId))
  return { ok: true }
}

/** Creates the all-collections link, replacing (and invalidating) any existing one. */
export async function createLibraryShareLink(): Promise<{ token: string }> {
  const userId = await requireUserId()
  await ensureShareTable()
  const token = newShareToken()
  await db.transaction(async (tx) => {
    await tx.delete(shareLibraryLink).where(eq(shareLibraryLink.scope, LIBRARY_SCOPE))
    await tx.insert(shareLibraryLink).values({ token, scope: LIBRARY_SCOPE, createdBy: userId })
  })
  return { token }
}

export async function revokeLibraryShareLink(): Promise<{ ok: true }> {
  await requireUserId()
  await ensureShareTable()
  await db.delete(shareLibraryLink).where(eq(shareLibraryLink.scope, LIBRARY_SCOPE))
  return { ok: true }
}
