"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Layers, LogOut, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react"
import { signOut } from "@/lib/auth-client"
import {
  createCollection,
  deleteCollection,
  renameCollection,
} from "@/app/actions/collection"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Input, Label } from "@/components/ui/field"
import type { CollectionSummary } from "@/lib/types"

export function CollectionsHome({
  collections,
  userName,
  isAdmin = false,
}: {
  collections: CollectionSummary[]
  userName: string
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState<CollectionSummary | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null)

  const submitCreate = () => {
    startTransition(async () => {
      const { id } = await createCollection(newName)
      setCreateOpen(false)
      setNewName("")
      router.push(`/collections/${id}`)
    })
  }

  const submitRename = () => {
    if (!renaming) return
    const target = renaming
    startTransition(async () => {
      await renameCollection(target.id, renameValue)
      setRenaming(null)
      router.refresh()
    })
  }

  const submitDelete = () => {
    if (!deleting) return
    const target = deleting
    startTransition(async () => {
      await deleteCollection(target.id)
      setDeleting(null)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-8 lg:px-8">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Your Collections</h1>
            <p className="text-sm text-muted-foreground">Signed in as {userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button variant="outline" onClick={() => router.push("/admin")}>
              <ShieldCheck />
              Admin
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={async () => {
              await signOut()
              router.push("/sign-in")
              router.refresh()
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setNewName("")
            setCreateOpen(true)
          }}
          className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="size-5" />
          </span>
          <span className="text-sm font-medium">New collection</span>
        </button>

        {collections.map((c) => (
          <div
            key={c.id}
            className="group relative flex min-h-40 flex-col justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60"
          >
            <button
              type="button"
              onClick={() => router.push(`/collections/${c.id}`)}
              className="flex flex-1 flex-col items-start gap-3 text-left"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Layers className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-balance">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.cardCount} card{c.cardCount === 1 ? "" : "s"}
                </span>
              </span>
            </button>
            <div className="mt-3 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Rename ${c.name}`}
                onClick={() => {
                  setRenaming(c)
                  setRenameValue(c.name)
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c.name}`}
                onClick={() => setDeleting(c)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New collection">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="new-name">Collection name</Label>
            <Input
              id="new-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitCreate()
              }}
              placeholder="e.g. Fire Deck"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={pending}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename collection">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="rename">Collection name</Label>
            <Input
              id="rename"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRename()
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={pending}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete collection">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">{deleting?.name}</span> and all of its
            cards? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDelete} disabled={pending}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
