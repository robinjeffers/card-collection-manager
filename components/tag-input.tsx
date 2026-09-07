"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Plus, Trash2, X } from "lucide-react"
import { tagStyle } from "@/lib/tag-color"
import { fieldClass } from "@/components/ui/field"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  onCreateOption?: (option: string) => void
  /** When provided, each option can be permanently removed from the column. */
  onDeleteOption?: (option: string) => void
}

export function TagInput({ value, options, onChange, onCreateOption, onDeleteOption }: TagInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const toggle = (tag: string) => {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag])
  }

  const deleteOption = (tag: string) => {
    // Drop it from this cell first (keeps local form state consistent), then
    // remove the option from the column everywhere.
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag))
    onDeleteOption?.(tag)
  }

  const trimmed = query.trim()
  const filtered = options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
  const canCreate =
    !!onCreateOption && trimmed.length > 0 && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase())

  const create = () => {
    if (!canCreate) return
    onCreateOption?.(trimmed)
    onChange([...value, trimmed])
    setQuery("")
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(fieldClass, "flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5 text-left")}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">Select tags…</span>
        ) : (
          value.map((tag) => (
            <span
              key={tag}
              style={tagStyle(tag, options)}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium"
            >
              {tag}
              <X
                className="size-3 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(tag)
                }}
              />
            </span>
          ))
        )}
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          {onCreateOption ? (
            <div className="border-b border-border p-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    create()
                  }
                }}
                placeholder="Search or create…"
                className="h-7 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
          <ul className="max-h-52 overflow-y-auto p-1" role="listbox">
            {filtered.map((tag) => {
              const active = value.includes(tag)
              return (
                <li key={tag} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(tag)}
                    className="flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span
                      style={tagStyle(tag, options)}
                      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium"
                    >
                      {tag}
                    </span>
                    {active ? <Check className="size-4 text-primary" /> : null}
                  </button>
                  {onDeleteOption ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteOption(tag)
                      }}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive"
                      aria-label={`Delete tag "${tag}" from this column`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              )
            })}
            {canCreate ? (
              <li>
                <button
                  type="button"
                  onClick={create}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Plus className="size-4" />
                  Create {'"'}
                  {trimmed}
                  {'"'}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 && !canCreate ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">No tags found</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
