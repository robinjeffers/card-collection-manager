import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getCollection } from "@/app/actions/collection"
import { CollectionManager } from "@/components/collection-manager"

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const collection = await getCollection()

  return (
    <main className="min-h-svh bg-background">
      <CollectionManager initialCollection={collection} userName={session.user.name || session.user.email} />
    </main>
  )
}
