"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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

const DROPDOWN_MAX_HEIGHT = 288 // matches the list (max-h-52 ≈ 208px) + search row

export function TagInput({ value, options, onChange, onCreateOption, onDeleteOption }: TagInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [mounted, setMounted] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<{
    left: number
    top: number
    width: number
    openUp: boolean
    maxHeight: number
  }>({
    left: 0,
    top: 0,
    width: 0,
    openUp: false,
    maxHeight: DROPDOWN_MAX_HEIGHT,
  })

  useEffect(() => setMounted(true), [])

  // Position the portalled menu relative to the trigger, flipping upward when
  // there isn't enough space below (so it's never clipped by the table's
  // overflow container or the viewport edge).
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow
    // Let the menu grow to fill the space in whichever direction it opens, so
    // as many tags as possible are visible without scrolling.
    const maxHeight = Math.min(480, Math.max(180, openUp ? spaceAbove : spaceBelow))
    // Give the menu room for chips to wrap side-by-side (wider than a narrow
    // cell), while keeping it on-screen.
    const width = Math.min(320, Math.max(rect.width, 256), window.innerWidth - rect.left - margin)
    setMenuStyle({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      width,
      openUp,
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  // Clear any pending delete confirmation whenever the menu closes.
  useEffect(() => {
    if (!open) setPendingDelete(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onReflow = () => reposition()
    document.addEventListener("mousedown", onDown)
    window.addEventListener("resize", onReflow)
    // Capture-phase scroll so we track any scrolling ancestor (the table).
    window.addEventListener("scroll", onReflow, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("resize", onReflow)
      window.removeEventListener("scroll", onReflow, true)
    }
  }, [open, reposition])

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
        ref={triggerRef}
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

      {open && mounted
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                left: menuStyle.left,
                top: menuStyle.top,
                width: menuStyle.width,
                transform: menuStyle.openUp ? "translateY(-100%)" : undefined,
              }}
              className={cn(
                "z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl",
                menuStyle.openUp ? "mb-1 -translate-y-1" : "mt-1",
              )}
            >
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
              <div
                className="overflow-y-auto p-2"
                style={{ maxHeight: menuStyle.maxHeight - (onCreateOption ? 52 : 0) }}
                role="listbox"
              >
                <div className="flex flex-wrap gap-1.5">
                  {filtered.map((tag) => {
                    const active = value.includes(tag)
                    return (
                      <span
                        key={tag}
                        style={tagStyle(tag, options)}
                        className={cn(
                          "group inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-medium",
                          active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(tag)}
                          className="inline-flex items-center gap-1"
                        >
                          {active ? <Check className="size-3" /> : null}
                          {tag}
                        </button>
                        {onDeleteOption ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPendingDelete(tag)
                            }}
                            className="-mr-0.5 ml-0.5 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
                            aria-label={`Delete tag "${tag}" from this column`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        ) : null}
                      </span>
                    )
                  })}
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={create}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="size-3" />
                      Create {'"'}
                      {trimmed}
                      {'"'}
                    </button>
                  ) : null}
                  {filtered.length === 0 && !canCreate ? (
                    <span className="px-1 py-1 text-sm text-muted-foreground">No tags found</span>
                  ) : null}
                </div>
              </div>

              {pendingDelete ? (
                <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 p-2">
                  <span className="min-w-0 truncate text-sm">
                    Delete <span className="font-semibold">{pendingDelete}</span>? Are you sure?
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteOption(pendingDelete)
                        setPendingDelete(null)
                      }}
                      className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
