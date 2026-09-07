"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Columns3, Loader2, LogOut, Plus, Search, Sparkles } from "lucide-react"
import { useCollection } from "@/hooks/use-collection"
import { signOut } from "@/lib/auth-client"
import { DataGrid } from "@/components/data-grid"
import { ImagePreview } from "@/components/image-preview"
import { AddColumnDialog } from "@/components/add-column-dialog"
import { CardFormDialog } from "@/components/card-form-dialog"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/ui/field"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { CardRow, Collection } from "@/lib/types"

export function CollectionManager({
  initialCollection,
  userName,
}: {
  initialCollection: Collection
  userName: string
}) {
  const router = useRouter()
  const {
    collection,
    saving,
    addColumn,
    removeColumn,
    addTagOption,
    addRow,
    updateRow,
    updateCell,
    removeRow,
  } = useCollection(initialCollection)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [columnDialog, setColumnDialog] = useState(false)
  const [cardDialog, setCardDialog] = useState(false)
  const [editingRow, setEditingRow] = useState<CardRow | null>(null)

  const tagCol = collection.columns.find((c) => c.type === "tag")
  const allTagOptions = tagCol?.options ?? []

  const filteredRows = useMemo(() => {
    return collection.rows.filter((row) => {
      const name = String(row.values.name ?? "").toLowerCase()
      if (search && !name.includes(search.toLowerCase())) return false
      if (activeTags.length > 0) {
        const rowTags = tagCol && Array.isArray(row.values[tagCol.id]) ? (row.values[tagCol.id] as string[]) : []
        if (!activeTags.every((t) => rowTags.includes(t))) return false
      }
      return true
    })
  }, [collection.rows, search, activeTags, tagCol])

  const selectedRow = collection.rows.find((r) => r.id === selectedId) ?? null

  const openNewCard = () => {
    setEditingRow(null)
    setCardDialog(true)
  }

  const openEditCard = (row: CardRow) => {
    setEditingRow(row)
    setCardDialog(true)
  }

  const toggleTagFilter = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col px-4 py-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-balance">Card Collection</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>
                {collection.rows.length} card{collection.rows.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              {saving ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Saving
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="size-3" />
                  Saved
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setColumnDialog(true)}>
            <Columns3 />
            Add column
          </Button>
          <Button onClick={openNewCard}>
            <Plus />
            New card
          </Button>
          <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
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
        </div>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cards by name…"
                className={cn(fieldClass, "pl-9")}
              />
            </div>
            {allTagOptions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {allTagOptions.map((tag) => {
                  const active = activeTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagFilter(tag)}
                      style={active ? tagStyle(tag) : undefined}
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                        active ? "" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <DataGrid
            columns={collection.columns}
            rows={filteredRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={openEditCard}
            onDeleteRow={(id) => {
              removeRow(id)
              if (selectedId === id) setSelectedId(null)
            }}
            onDeleteColumn={removeColumn}
            onUpdateCell={updateCell}
            onCreateTagOption={addTagOption}
          />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ImagePreview row={selectedRow} columns={collection.columns} />
        </aside>
      </div>

      <AddColumnDialog open={columnDialog} onClose={() => setColumnDialog(false)} onAdd={addColumn} />
      <CardFormDialog
        open={cardDialog}
        onClose={() => setCardDialog(false)}
        columns={collection.columns}
        row={editingRow}
        onCreateTagOption={addTagOption}
        onSubmit={(values) => {
          if (editingRow) {
            updateRow(editingRow.id, values)
          } else {
            const id = addRow(values)
            setSelectedId(id)
          }
        }}
      />
    </div>
  )
}
