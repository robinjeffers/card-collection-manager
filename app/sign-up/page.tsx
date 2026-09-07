import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/")

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <AuthForm mode="sign-up" />
    </main>
  )
}
