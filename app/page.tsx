import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/admin"
import { getCollection } from "@/app/actions/collection"
import { CollectionManager } from "@/components/collection-manager"

export default async function Page() {
  const current = await getCurrentUser()
  if (!current) redirect("/sign-in")

  const collection = await getCollection()

  return (
    <main className="min-h-svh bg-background">
      <CollectionManager
        initialCollection={collection}
        userName={current.name}
        isAdmin={current.role === "admin"}
      />
    </main>
  )
}
