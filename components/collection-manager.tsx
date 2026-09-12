"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Columns3, ImagePlus, Layers, Loader2, LogOut, Pencil, Plus, Search, ShieldCheck, Sheet, Trash2, X } from "lucide-react"
import { useCollection } from "@/hooks/use-collection"
import { signOut } from "@/lib/auth-client"
import { DataGrid } from "@/components/data-grid"
import { ImagePreview } from "@/components/image-preview"
import { AddColumnDialog } from "@/components/add-column-dialog"
import { CardFormDialog } from "@/components/card-form-dialog"
import { ImportImagesDialog } from "@/components/import-images-dialog"
import { ImportPairsDialog } from "@/components/import-pairs-dialog"
import { ImportFieldsDialog } from "@/components/import-fields-dialog"
import { BulkEditDialog } from "@/components/bulk-edit-dialog"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { fieldClass } from "@/components/ui/field"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { CardRow, Collection } from "@/lib/types"

export function CollectionManager({
  collectionId,
  collectionName,
  initialCollection,
  userName,
  isAdmin = false,
}: {
  collectionId: string
  collectionName: string
  initialCollection: Collection
  userName: string
  isAdmin?: boolean
}) {
  const router = useRouter()
  const {
    collection,
    saving,
    addColumn,
    removeColumn,
    reorderColumns,
    addTagOption,
    removeTagOption,
    addRow,
    addRows,
    updateRow,
    updateRows,
    updateCell,
    removeRow,
    removeRows,
    restore,
  } = useCollection(initialCollection, collectionId)

  const { toast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [columnDialog, setColumnDialog] = useState(false)
  const [cardDialog, setCardDialog] = useState(false)
  const [importDialog, setImportDialog] = useState(false)
  const [pairsDialog, setPairsDialog] = useState(false)
  const [fieldsDialog, setFieldsDialog] = useState(false)
  const [editingRow, setEditingRow] = useState<CardRow | null>(null)

  const hasFieldColumns = collection.columns.some(
    (c) => (c.type === "text" && c.id !== "name") || c.type === "number" || c.type === "tag",
  )

  const tagCols = useMemo(
    () => collection.columns.filter((c) => c.type === "tag"),
    [collection.columns],
  )
  // Filter chips draw from every tag column, not just the first. Options are
  // deduped by name (first occurrence wins) and each chip keeps its source
  // column's option list so its color matches the grid cell it came from.
  const tagChips = useMemo(() => {
    const seen = new Set<string>()
    const chips: { tag: string; options: string[] }[] = []
    for (const col of tagCols) {
      const options = col.options ?? []
      for (const opt of options) {
        if (seen.has(opt)) continue
        seen.add(opt)
        chips.push({ tag: opt, options })
      }
    }
    return chips
  }, [tagCols])
  const artworkCol = collection.columns.find((c) => c.isArtwork) ?? collection.columns.find((c) => c.type === "image")
  const templateCol = collection.columns.find((c) => c.type === "file")

  const filteredRows = useMemo(() => {
    return collection.rows
      .filter((row) => {
        const name = String(row.values.name ?? "").toLowerCase()
        if (search && !name.includes(search.toLowerCase())) return false
        if (activeTags.length > 0) {
          // Gather the row's tags across every tag column so a chip matches
          // whichever column actually holds it.
          const rowTags: string[] = []
          for (const col of tagCols) {
            const v = row.values[col.id]
            if (Array.isArray(v)) rowTags.push(...(v as string[]))
          }
          if (!activeTags.every((t) => rowTags.includes(t))) return false
        }
        return true
      })
      .sort((a, b) =>
        String(a.values.name ?? "").localeCompare(String(b.values.name ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      )
  }, [collection.rows, search, activeTags, tagCols])

  const selectedRow = collection.rows.find((r) => r.id === selectedId) ?? null

  // Bulk selection is keyed off row ids; deriving the rows from the live
  // collection means deleted ids fall out automatically.
  const checkedRows = collection.rows.filter((r) => checkedIds.has(r.id))
  const allFilteredChecked = filteredRows.length > 0 && filteredRows.every((r) => checkedIds.has(r.id))

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCheckedAll = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredChecked) filteredRows.forEach((r) => next.delete(r.id))
      else filteredRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const clearChecked = () => setCheckedIds(new Set())

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
    <div className="flex min-h-svh w-full flex-col px-4 py-6 lg:px-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to collections"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-balance">{collectionName}</h1>
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
          {/* Import / editing tools are desktop-only — mobile is a trimmed,
              search-first view for quickly looking up cards. */}
          <div className="hidden items-center gap-2 lg:flex">
          <Button variant="outline" onClick={() => setColumnDialog(true)}>
            <Columns3 />
            Add Column
          </Button>
          {artworkCol ? (
            <Button variant="outline" onClick={() => setImportDialog(true)}>
              <ImagePlus />
              Import Artwork
            </Button>
          ) : null}
          {artworkCol && templateCol ? (
            <Button variant="outline" onClick={() => setPairsDialog(true)}>
              <Layers />
              Import Artwork + Templates
            </Button>
          ) : null}
          {hasFieldColumns ? (
            <Button variant="outline" onClick={() => setFieldsDialog(true)}>
              <Sheet />
              Import Fields
            </Button>
          ) : null}
          <Button onClick={openNewCard}>
            <Plus />
            New Card
          </Button>
          {isAdmin ? (
            <Button variant="outline" onClick={() => router.push("/admin")}>
              <ShieldCheck />
              Admin
            </Button>
          ) : null}
          </div>
          <div className="ml-1 hidden items-center gap-2 border-l border-border pl-3 lg:flex">
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

      {/* Mobile: trimmed, search-first view. No grid or import tools — type a
          name and press Enter (or tap a match) to preview a card. Tag info
          shows underneath via the shared ImagePreview. */}
      <div className="flex flex-1 flex-col gap-4 lg:hidden">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                if (filteredRows[0]) setSelectedId(filteredRows[0].id)
              }
            }}
            placeholder="Search cards by name…"
            className={cn(fieldClass, "pl-9")}
            inputMode="search"
            enterKeyHint="search"
          />
        </div>
        {search.trim() && filteredRows.length > 0 ? (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-border">
            {filteredRows.slice(0, 50).map((row) => {
              const rowName = String(row.values.name ?? "") || "Untitled card"
              const active = row.id === selectedId
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "flex w-full items-center border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-0",
                      active
                        ? "bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {rowName}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : search.trim() ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No cards match your search.
          </p>
        ) : null}
        <ImagePreview row={selectedRow} columns={collection.columns} />
      </div>

      {/* Desktop: full editable grid + sticky preview, unchanged. */}
      <div className="hidden flex-1 gap-6 lg:grid lg:grid-cols-[1fr_440px]">
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
            {tagChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tagChips.map(({ tag, options }) => {
                  const active = activeTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagFilter(tag)}
                      style={active ? tagStyle(tag, options) : undefined}
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

          {checkedRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">
                {checkedRows.length} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={clearChecked}>
                  <X className="size-4" />
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          <DataGrid
            columns={collection.columns}
            rows={filteredRows}
            selectedId={selectedId}
            checkedIds={checkedIds}
            onSelect={setSelectedId}
            onToggleChecked={toggleChecked}
            onToggleCheckedAll={toggleCheckedAll}
            onEdit={openEditCard}
            onDeleteRow={(id) => {
              const snapshot = collection
              const name = String(collection.rows.find((r) => r.id === id)?.values.name ?? "card")
              removeRow(id)
              if (selectedId === id) setSelectedId(null)
              toast({
                message: `Deleted "${name}"`,
                actionLabel: "Undo",
                onAction: () => restore(snapshot),
              })
            }}
            onDeleteColumn={(id) => {
              const snapshot = collection
              const name = collection.columns.find((c) => c.id === id)?.name ?? "column"
              removeColumn(id)
              toast({
                message: `Deleted column "${name}"`,
                actionLabel: "Undo",
                onAction: () => restore(snapshot),
              })
            }}
            onReorderColumns={reorderColumns}
            onUpdateCell={updateCell}
            onCreateTagOption={addTagOption}
            onDeleteTagOption={(columnId, option) => {
              const snapshot = collection
              removeTagOption(columnId, option)
              toast({
                message: `Deleted tag "${option}"`,
                actionLabel: "Undo",
                onAction: () => restore(snapshot),
              })
            }}
          />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ImagePreview row={selectedRow} columns={collection.columns} />
        </aside>
      </div>

      <AddColumnDialog open={columnDialog} onClose={() => setColumnDialog(false)} onAdd={addColumn} />
      {artworkCol ? (
        <ImportImagesDialog
          open={importDialog}
          onClose={() => setImportDialog(false)}
          onImport={(imported) => {
            const ids = addRows(
              imported.map((item) => ({ name: item.name, [artworkCol.id]: item.url })),
            )
            if (ids[0]) setSelectedId(ids[0])
          }}
        />
      ) : null}
      {artworkCol && templateCol ? (
        <ImportPairsDialog
          open={pairsDialog}
          onClose={() => setPairsDialog(false)}
          onImport={(imported) => {
            const ids = addRows(
              imported.map((item) => {
                const values: Record<string, string> = { name: item.name }
                if (item.artworkUrl) values[artworkCol.id] = item.artworkUrl
                if (item.templateUrl) values[templateCol.id] = item.templateUrl
                return values
              }),
            )
            if (ids[0]) setSelectedId(ids[0])
          }}
        />
      ) : null}
      <ImportFieldsDialog
        open={fieldsDialog}
        onClose={() => setFieldsDialog(false)}
        columns={collection.columns}
        rows={collection.rows}
        onApply={(updates, newTagOptions) => {
          newTagOptions.forEach(({ columnId, options }) =>
            options.forEach((option) => addTagOption(columnId, option)),
          )
          updates.forEach((u) => updateRow(u.rowId, u.values))
          if (updates[0]) setSelectedId(updates[0].rowId)
        }}
      />
      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        columns={collection.columns}
        rows={checkedRows}
        onApply={(updates, newTagOptions) => {
          newTagOptions.forEach(({ columnId, options }) =>
            options.forEach((option) => addTagOption(columnId, option)),
          )
          updateRows(updates)
          clearChecked()
        }}
      />

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={`Delete ${checkedRows.length} card${checkedRows.length === 1 ? "" : "s"}?`}
        description="This permanently removes the selected cards from this collection. This can't be undone."
      >
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const snapshot = collection
              const ids = checkedRows.map((r) => r.id)
              const count = ids.length
              removeRows(ids)
              if (selectedId && ids.includes(selectedId)) setSelectedId(null)
              clearChecked()
              setBulkDeleteOpen(false)
              toast({
                message: `Deleted ${count} card${count === 1 ? "" : "s"}`,
                actionLabel: "Undo",
                onAction: () => restore(snapshot),
              })
            }}
          >
            Delete {checkedRows.length} card{checkedRows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </Modal>

      <CardFormDialog
        open={cardDialog}
        onClose={() => setCardDialog(false)}
        columns={collection.columns}
        row={editingRow}
        onCreateTagOption={addTagOption}
        onDeleteTagOption={removeTagOption}
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
