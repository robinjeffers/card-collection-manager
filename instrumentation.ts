// Runs once when the Next.js server starts (Node runtime only). Used to seed
// the initial admin account from environment variables on a fresh deployment.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  try {
    const { seedInitialAdmin } = await import("@/lib/seed-admin")
    await seedInitialAdmin()
  } catch (error) {
    // Never let seeding crash server startup — log and continue.
    console.log("[v0] instrumentation: seedInitialAdmin failed:", error instanceof Error ? error.message : error)
  }
}
