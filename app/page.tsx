import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/admin"
import { listCollections } from "@/app/actions/collection"
import { CollectionsHome } from "@/components/collections-home"

export default async function Page() {
  const current = await getCurrentUser()
  if (!current) redirect("/sign-in")

  const collections = await listCollections()

  return (
    <main className="min-h-svh bg-background">
      <CollectionsHome
        collections={collections}
        userName={current.name}
        isAdmin={current.role === "admin"}
      />
    </main>
  )
}
