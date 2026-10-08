"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Eye, Layers, List, Search } from "lucide-react"
import { ImagePreview } from "@/components/image-preview"
import { fieldClass } from "@/components/ui/field"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { Collection, Column } from "@/lib/types"

const LIST_LIMIT = 200
const MATCH_LIMIT = 50
const ALL_DECKS = "__all__"

interface Deck {
  id: string
  name: string
  collection: Collection
}

interface Entry {
  key: string
  deck: Deck
  row: Collection["rows"][number]
  name: string
}

function rowTags(entry: Entry): string[] {
  return entry.deck.collection.columns
    .filter((c) => c.type === "tag")
    .flatMap((col) => {
      const v = entry.row.values[col.id]
      return Array.isArray(v) ? (v as string[]) : []
    })
}

export function SharedCollectionView({ kind, decks }: { kind: "collection" | "library"; decks: Deck[] }) {
  const isLibrary = kind === "library"
  const [search, setSearch] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [deckFilter, setDeckFilter] = useState<string>(ALL_DECKS)
  // Mobile only: the full card list, deck switcher and tag filters start
  // collapsed so the artwork sits right under the search box. Desktop
  // always shows them via lg: classes.
  const [browseOpen, setBrowseOpen] = useState(false)

  const entries = useMemo<Entry[]>(
    () =>
      decks
        .flatMap((deck) =>
          deck.collection.rows.map((row) => ({
            key: `${deck.id}:${row.id}`,
            deck,
            row,
            name: String(row.values.name ?? ""),
          })),
        )
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })),
    [decks],
  )

  const scopedDecks = useMemo(
    () => (deckFilter === ALL_DECKS ? decks : decks.filter((d) => d.id === deckFilter)),
    [decks, deckFilter],
  )

  const tagChips = useMemo(() => {
    const seen = new Set<string>()
    const chips: { tag: string; options: string[] }[] = []
    for (const deck of scopedDecks) {
      for (const col of deck.collection.columns) {
        if (col.type !== "tag") continue
        const options = col.options ?? []
        for (const opt of options) {
          if (seen.has(opt)) continue
          seen.add(opt)
          chips.push({ tag: opt, options })
        }
      }
    }
    return chips
  }, [scopedDecks])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (deckFilter !== ALL_DECKS && entry.deck.id !== deckFilter) return false
      if (query && !entry.name.toLowerCase().includes(query)) return false
      if (activeTags.length > 0) {
        const tags = rowTags(entry)
        if (!activeTags.every((t) => tags.includes(t))) return false
      }
      return true
    })
  }, [entries, search, activeTags, deckFilter])

  const [selectedKey, setSelectedKey] = useState<string | null>(entries[0]?.key ?? null)
  const selected = entries.find((e) => e.key === selectedKey) ?? null

  const details = selected
    ? selected.deck.collection.columns
        .filter((col: Column) => (col.type === "text" || col.type === "number") && col.id !== "name")
        .map((col) => ({ col, value: selected.row.values[col.id] }))
        .filter(({ value }) => value !== null && value !== undefined && String(value).trim() !== "")
    : []

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const changeDeck = (id: string) => {
    setDeckFilter(id)
    setActiveTags([])
  }

  const gameNames = Array.from(new Set(decks.map((d) => d.collection.cardGame).filter(Boolean)))
  const sharedGame = gameNames.length === 1 && decks.every((d) => d.collection.cardGame) ? gameNames[0] : undefined
  const singleDeck = decks[0]
  const title = isLibrary ? (sharedGame ?? "All decks") : (singleDeck?.name ?? "Shared collection")
  const subtitle = isLibrary ? undefined : singleDeck?.collection.cardGame
  const showDeckLabels = isLibrary && deckFilter === ALL_DECKS
  const showDeckSwitcher = isLibrary && decks.length > 1
  const activeFilterCount = activeTags.length + (deckFilter !== ALL_DECKS ? 1 : 0)
  const hasQuery = search.trim() !== ""

  const selectCard = (key: string) => {
    setSelectedKey(key)
    setBrowseOpen(false)
  }

  const deckSwitcher = (
    <nav aria-label="Decks" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
        {[
          { id: ALL_DECKS, name: "All decks", count: entries.length },
          ...decks.map((d) => ({ id: d.id, name: d.name, count: d.collection.rows.length })),
        ].map((option) => {
          const active = deckFilter === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => changeDeck(option.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {option.id === ALL_DECKS ? <Layers className="size-3.5" /> : null}
              {option.name}
              <span className={cn("text-xs", active ? "opacity-80" : "opacity-60")}>{option.count}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )

  const renderCardButton = (entry: Entry) => {
    const active = entry.key === selectedKey
    return (
      <li key={entry.key} className="border-b border-border last:border-0">
        <button
          type="button"
          onClick={() => selectCard(entry.key)}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors",
            active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <span className="min-w-0 truncate">{entry.name || "Untitled card"}</span>
          {showDeckLabels ? (
            <span className="shrink-0 truncate text-xs font-normal text-muted-foreground">{entry.deck.name}</span>
          ) : null}
        </button>
      </li>
    )
  }

  const noMatches = (
    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      No cards match your search.
    </p>
  )

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 lg:gap-6 lg:px-6 lg:py-6">
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" />
          {isLibrary ? "Shared decks" : "Shared collection"} · read only
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-balance lg:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm font-medium text-primary">{subtitle}</p> : null}
        <p className="text-sm text-muted-foreground">
          {isLibrary ? `${decks.length} deck${decks.length === 1 ? "" : "s"} · ` : ""}
          {entries.length} card{entries.length === 1 ? "" : "s"}
        </p>
      </header>

      {showDeckSwitcher ? <div className="hidden lg:block">{deckSwitcher}</div> : null}

      <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[1fr_420px] lg:items-start lg:gap-6">
        <section aria-label="Cards" className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    if (filtered[0]) setSelectedKey(filtered[0].key)
                  }
                }}
                placeholder="Search cards by name…"
                aria-label="Search cards by name"
                className={cn(fieldClass, "pl-9")}
                inputMode="search"
                enterKeyHint="search"
              />
            </div>
            <button
              type="button"
              onClick={() => setBrowseOpen((open) => !open)}
              aria-expanded={browseOpen}
              aria-controls="shared-browse-panel"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors lg:hidden",
                browseOpen
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <List className="size-4" />
              Browse
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
                  {activeFilterCount}
                  <span className="sr-only"> active filters</span>
                </span>
              ) : null}
              <ChevronDown className={cn("size-4 transition-transform", browseOpen && "rotate-180")} />
            </button>
          </div>

          {/* Mobile, collapsed: matches only appear while typing, same as the account mobile view. */}
          {!browseOpen && hasQuery ? (
            <div className="lg:hidden">
              {filtered.length > 0 ? (
                <ul className="flex max-h-60 flex-col overflow-y-auto rounded-xl border border-border">
                  {filtered.slice(0, MATCH_LIMIT).map(renderCardButton)}
                </ul>
              ) : (
                noMatches
              )}
            </div>
          ) : null}

          <div id="shared-browse-panel" className={cn("flex-col gap-3 lg:flex", browseOpen ? "flex" : "hidden")}>
            {showDeckSwitcher ? <div className="lg:hidden">{deckSwitcher}</div> : null}

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

            {filtered.length > 0 ? (
              <ul className="flex max-h-[28rem] flex-col overflow-y-auto rounded-xl border border-border lg:max-h-[calc(100svh-16rem)]">
                {filtered.slice(0, LIST_LIMIT).map(renderCardButton)}
              </ul>
            ) : (
              noMatches
            )}
            {filtered.length > LIST_LIMIT ? (
              <p className="text-xs text-muted-foreground">
                Showing the first {LIST_LIMIT} of {filtered.length} matches. Refine your search to narrow it down.
              </p>
            ) : null}
          </div>
        </section>

        <aside aria-label="Card details" className="flex flex-col gap-4 lg:sticky lg:top-6">
          <ImagePreview row={selected?.row ?? null} columns={selected?.deck.collection.columns ?? []} />
          {(isLibrary && selected) || details.length > 0 ? (
            <dl className="flex flex-col rounded-xl border border-border">
              {isLibrary && selected ? (
                <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-0">
                  <dt className="text-xs font-medium text-muted-foreground">Deck</dt>
                  <dd className="text-sm leading-relaxed">{selected.deck.name}</dd>
                </div>
              ) : null}
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
