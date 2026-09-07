"use server"

import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { user } from "@/lib/db/schema"
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

export async function createAccount(input: {
  name: string
  email: string
  password: string
  role: Role
}) {
  await requireAdmin()

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const role: Role = input.role === "admin" ? "admin" : "user"

  if (!name) throw new Error("Name is required")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address")
  if (password.length < 8) throw new Error("Password must be at least 8 characters")

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  if (existing[0]) throw new Error("An account with that email already exists")

  // Create the user + credential account using Better Auth's own primitives so
  // the password hash matches what sign-in expects. This works even when the
  // public sign-up endpoint is disabled.
  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)
  const created = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: false },
    { method: "email-password" },
  )
  if (!created) throw new Error("Could not create the account")

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  })

  if (role === "admin") {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, created.id))
  }

  revalidatePath("/admin")
  return { ok: true }
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

  // Collections are shared and intentionally outlive their creator, so we do
  // NOT delete them here (the collection table has no FK to the user). Only the
  // user is removed; sessions and accounts cascade automatically.
  await db.delete(user).where(eq(user.id, userId))
  revalidatePath("/admin")
  return { ok: true }
}
