"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn, signUp } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/field"

export function AuthForm({
  mode,
  allowSignup = false,
}: {
  mode: "sign-in" | "sign-up"
  allowSignup?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = isSignUp
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password })

      if (result.error) {
        const code = result.error.code
        // A genuine bad-credentials / duplicate-email result gets a friendly
        // message; anything else (e.g. a rejected Origin when BETTER_AUTH_URL
        // does not match the domain you're visiting) shows the real reason so
        // it's actually diagnosable instead of masked as a password problem.
        const isCredentialError =
          code === "INVALID_EMAIL_OR_PASSWORD" ||
          code === "USER_ALREADY_EXISTS" ||
          result.error.status === 401
        if (isCredentialError) {
          setError(isSignUp ? "Could not create account. Try a different email." : "Invalid email or password.")
        } else {
          setError(result.error.message || result.error.statusText || "Sign-in failed. Please try again.")
        }
        return
      }
      router.push("/")
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground text-balance">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSignUp ? "Start cataloguing your card collection." : "Sign in to open your collection."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignUp && (
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Ada Lovelace"
            />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      {isSignUp ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {"Already have an account? "}
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      ) : allowSignup ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {"Need an account? "}
          <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      ) : null}
    </div>
  )
}
