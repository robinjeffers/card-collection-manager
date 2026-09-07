import "server-only"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"

export type Role = "admin" | "user"

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: Role
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** True when the email is configured as an administrator via ADMIN_EMAILS. */
export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase())
}

/**
 * Resolves the signed-in user and their effective role. If their email is
 * listed in ADMIN_EMAILS but the stored role is not yet "admin", it is
 * promoted here so the bootstrap survives database resets. Returns null when
 * there is no session.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  const record = rows[0]
  let role: Role = record?.role === "admin" ? "admin" : "user"

  if (role !== "admin" && isAdminEmail(session.user.email)) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, session.user.id))
    role = "admin"
  }

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    role,
  }
}

/** Throws unless the current user is an admin. Returns the admin on success. */
export async function requireAdmin(): Promise<CurrentUser> {
  const current = await getCurrentUser()
  if (!current || current.role !== "admin") {
    throw new Error("Forbidden")
  }
  return current
}
