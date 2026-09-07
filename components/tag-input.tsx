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
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<{ left: number; top: number; width: number; openUp: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    openUp: false,
  })

  useEffect(() => setMounted(true), [])

  // Position the portalled menu relative to the trigger, flipping upward when
  // there isn't enough space below (so it's never clipped by the table's
  // overflow container or the viewport edge).
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && rect.top > spaceBelow
    setMenuStyle({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      width: rect.width,
      openUp,
    })
  }, [])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
