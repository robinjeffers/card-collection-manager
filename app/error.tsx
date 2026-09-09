"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Unhandled application error:", error)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Something went wrong</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          An unexpected error occurred. This can happen if the app can&apos;t reach its database.
          Try again in a moment, and check that the database container is running if it keeps
          happening.
        </p>
        {error.digest ? (
          <p className="pt-1 font-mono text-xs text-muted-foreground/70">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to your collections
        </Link>
      </div>
    </main>
  )
}
