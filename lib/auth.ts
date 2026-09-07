import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import { isPublicSignupEnabled } from "@/lib/signup"

/** Drop a trailing slash so a URL matches the browser Origin header exactly. */
function normalizeOrigin(url: string | undefined | null) {
  return url ? url.trim().replace(/\/+$/, "") : undefined
}

function resolveBaseURL() {
  if (process.env.BETTER_AUTH_URL) return normalizeOrigin(process.env.BETTER_AUTH_URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return normalizeOrigin(process.env.V0_RUNTIME_URL)
}

function resolveTrustedOrigins() {
  const origins = new Set<string>()
  // Always trust local access on any port. For a self-hosted app, reaching it
  // at localhost/127.0.0.1 is inherently the operator's own machine, so this is
  // safe and means signing in at http://localhost:3000 works without any extra
  // configuration — even when BETTER_AUTH_URL points at a public tunnel domain.
  // (Better Auth supports "*" wildcard patterns in trustedOrigins.)
  origins.add("http://localhost:*")
  origins.add("http://127.0.0.1:*")
  if (process.env.NODE_ENV === "development") {
    for (const key of ["V0_RUNTIME_URL", "V0_DEV_APP_URL", "V0_BUILD_URL", "V0_SANDBOX_URL"]) {
      const value = normalizeOrigin(process.env[key])
      if (value) origins.add(value)
    }
  } else {
    if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`)
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    // Self-hosted (Docker + Cloudflare Tunnel): the public origin comes from
    // BETTER_AUTH_URL, not the Vercel-provided variables.
    const baseOrigin = normalizeOrigin(process.env.BETTER_AUTH_URL)
    if (baseOrigin) origins.add(baseOrigin)
  }
  // Optional extra origins (comma-separated) for setups that serve the app on
  // more than one hostname, e.g. a tunnel domain plus a LAN address.
  for (const extra of (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
    const value = normalizeOrigin(extra)
    if (value) origins.add(value)
  }
  return [...origins]
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL: resolveBaseURL(),
  trustedOrigins: resolveTrustedOrigins(),
  emailAndPassword: {
    enabled: true,
    // When public signup is closed, block the sign-up endpoint entirely so it
    // cannot be reached by a direct request. Admins create accounts via the
    // server action in app/actions/admin.ts, which bypasses this.
    disableSignUp: !isPublicSignupEnabled(),
  },
  plugins: [nextCookies()],
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe. Without these
          // attributes, login succeeds but the next request appears signed out.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
