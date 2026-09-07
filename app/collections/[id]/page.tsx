import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/admin"
import { getCollectionById } from "@/app/actions/collection"
import { CollectionManager } from "@/components/collection-manager"

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const current = await getCurrentUser()
  if (!current) redirect("/sign-in")

  const { id } = await params
  const found = await getCollectionById(id)
  // Collection doesn't exist — send them back to the shared list.
  if (!found) redirect("/")

  return (
    <main className="min-h-svh bg-background">
      <CollectionManager
        collectionId={found.id}
        collectionName={found.name}
        initialCollection={found.data}
        userName={current.name}
        isAdmin={current.role === "admin"}
      />
    </main>
  )
}
