/**
 * Public (self-service) signup is opt-in. When ALLOW_PUBLIC_SIGNUP is not
 * exactly "true", the sign-up link is hidden, /sign-up redirects away, and the
 * Better Auth sign-up endpoint is disabled — accounts are created by an admin
 * from the /admin page instead.
 */
export function isPublicSignupEnabled(): boolean {
  return process.env.ALLOW_PUBLIC_SIGNUP === "true"
}
