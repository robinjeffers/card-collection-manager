import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SharedCollectionView } from "@/components/shared-collection-view"
import { getSharedView } from "@/lib/share"

export const metadata: Metadata = {
  title: "Shared collection",
  robots: { index: false, follow: false },
}

export default async function SharedCollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await getSharedView(token)
  if (!shared) notFound()

  const decks = shared.decks.map(({ id, name, data }) => ({ id, name, collection: data }))
  return (
    <main className="min-h-svh bg-background">
      <SharedCollectionView kind={shared.kind} decks={decks} />
    </main>
  )
}
