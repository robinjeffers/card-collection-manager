"use client"

import { useMemo, useState } from "react"
import { Eye, Search } from "lucide-react"
import { ImagePreview } from "@/components/image-preview"
import { fieldClass } from "@/components/ui/field"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { Collection } from "@/lib/types"

const LIST_LIMIT = 200

export function SharedCollectionView({ name, collection }: { name: string; collection: Collection }) {
  const [search, setSearch] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])

  const tagCols = useMemo(() => collection.columns.filter((c) => c.type === "tag"), [collection.columns])
  const detailCols = useMemo(
    () => collection.columns.filter((c) => (c.type === "text" || c.type === "number") && c.id !== "name"),
    [collection.columns],
  )

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

  const sortedRows = useMemo(
    () =>
      [...collection.rows].sort((a, b) =>
        String(a.values.name ?? "").localeCompare(String(b.values.name ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [collection.rows],
  )

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sortedRows.filter((row) => {
      if (query && !String(row.values.name ?? "").toLowerCase().includes(query)) return false
      if (activeTags.length > 0) {
        const rowTags = tagCols.flatMap((col) => {
          const v = row.values[col.id]
          return Array.isArray(v) ? (v as string[]) : []
        })
        if (!activeTags.every((t) => rowTags.includes(t))) return false
      }
      return true
    })
  }, [sortedRows, search, activeTags, tagCols])

  const [selectedId, setSelectedId] = useState<string | null>(sortedRows[0]?.id ?? null)
  const selectedRow = collection.rows.find((r) => r.id === selectedId) ?? null

  const details = selectedRow
    ? detailCols
        .map((col) => ({ col, value: selectedRow.values[col.id] }))
        .filter(({ value }) => value !== null && value !== undefined && String(value).trim() !== "")
    : []

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" />
          Shared collection · read only
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{name}</h1>
        {collection.cardGame ? (
          <p className="text-sm font-medium text-primary">{collection.cardGame}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {collection.rows.length} card{collection.rows.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[1fr_420px] lg:items-start">
        <section aria-label="Cards" className="flex min-w-0 flex-col gap-3">
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
              aria-label="Search cards by name"
              className={cn(fieldClass, "pl-9")}
              inputMode="search"
              enterKeyHint="search"
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
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
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

          {filteredRows.length > 0 ? (
            <ul className="flex max-h-[28rem] flex-col overflow-y-auto rounded-xl border border-border lg:max-h-[calc(100svh-14rem)]">
              {filteredRows.slice(0, LIST_LIMIT).map((row) => {
                const active = row.id === selectedId
                return (
                  <li key={row.id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors",
                        active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {String(row.values.name ?? "") || "Untitled card"}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No cards match your search.
            </p>
          )}
          {filteredRows.length > LIST_LIMIT ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {LIST_LIMIT} of {filteredRows.length} matches. Refine your search to narrow it down.
            </p>
          ) : null}
        </section>

        <aside aria-label="Card details" className="flex flex-col gap-4 lg:sticky lg:top-6">
          <ImagePreview row={selectedRow} columns={collection.columns} />
          {details.length > 0 ? (
            <dl className="flex flex-col rounded-xl border border-border">
              {details.map(({ col, value }) => (
                <div key={col.id} className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-0">
                  <dt className="text-xs font-medium text-muted-foreground">{col.name}</dt>
                  <dd className="text-sm leading-relaxed whitespace-pre-wrap text-pretty">{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
