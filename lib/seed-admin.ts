import "server-only"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"

/**
 * Creates the initial administrator from environment variables the first time
 * the server boots against a database that has no matching account. This lets
 * a self-hosted deployment keep public signup disabled from the very first run
 * — there is no need to temporarily open signup just to create one admin.
 *
 * Controlled by:
 *   INITIAL_ADMIN_EMAIL     — the admin's email address
 *   INITIAL_ADMIN_PASSWORD  — the admin's password (min 8 characters)
 *   INITIAL_ADMIN_NAME      — optional display name (defaults to "Admin")
 *
 * It is idempotent: if the account already exists it only ensures the role is
 * "admin", and if the variables are unset it does nothing.
 */
export async function seedInitialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.INITIAL_ADMIN_PASSWORD
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Admin"

  if (!email || !password) return // feature not configured — nothing to do

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.log("[v0] seedInitialAdmin: INITIAL_ADMIN_EMAIL is not a valid email, skipping")
    return
  }
  if (password.length < 8) {
    console.log("[v0] seedInitialAdmin: INITIAL_ADMIN_PASSWORD must be at least 8 characters, skipping")
    return
  }

  const existing = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email)).limit(1)

  if (existing[0]) {
    // Account already present — make sure it has admin rights, then stop.
    if (existing[0].role !== "admin") {
      await db.update(user).set({ role: "admin" }).where(eq(user.id, existing[0].id))
      console.log("[v0] seedInitialAdmin: promoted existing account to admin")
    }
    return
  }

  // Create the user + credential account with Better Auth's own primitives so
  // the stored password hash matches what sign-in expects.
  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)
  const created = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "email-password" })
  if (!created) {
    console.log("[v0] seedInitialAdmin: failed to create the initial admin user")
    return
  }

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  })
  await db.update(user).set({ role: "admin" }).where(eq(user.id, created.id))

  console.log(`[v0] seedInitialAdmin: created initial admin account for ${email}`)
}
