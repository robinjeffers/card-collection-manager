"use server"

import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { collection, user } from "@/lib/db/schema"
import { isAdminEmail, requireAdmin, type Role } from "@/lib/admin"

export type AdminUser = {
  id: string
  name: string
  email: string
  role: Role
  createdAt: Date
  isConfiguredAdmin: boolean
}

export async function listUsers(): Promise<AdminUser[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))

  return rows.map((r) => ({
    ...r,
    role: r.role === "admin" ? "admin" : "user",
    isConfiguredAdmin: isAdminEmail(r.email),
  }))
}

export async function setUserRole(userId: string, role: Role) {
  const admin = await requireAdmin()

  if (role !== "admin" && role !== "user") {
    throw new Error("Invalid role")
  }
  // An admin cannot demote themselves — prevents locking yourself out.
  if (userId === admin.id && role !== "admin") {
    throw new Error("You cannot change your own admin role")
  }

  await db.update(user).set({ role }).where(eq(user.id, userId))
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin()

  if (userId === admin.id) {
    throw new Error("You cannot delete your own account")
  }

  // The collection table has no FK cascade, so remove it explicitly first.
  // Sessions and accounts cascade automatically when the user row is deleted.
  await db.delete(collection).where(eq(collection.userId, userId))
  await db.delete(user).where(eq(user.id, userId))
  revalidatePath("/admin")
  return { ok: true }
}
