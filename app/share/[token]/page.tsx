import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SharedCollectionView } from "@/components/shared-collection-view"
import { getSharedCollection } from "@/lib/share"

export const metadata: Metadata = {
  title: "Shared collection",
  robots: { index: false, follow: false },
}

export default async function SharedCollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await getSharedCollection(token)
  if (!shared) notFound()

  return (
    <main className="min-h-svh bg-background">
      <SharedCollectionView name={shared.name} collection={shared.data} />
    </main>
  )
}
