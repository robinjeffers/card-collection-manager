"use client"

import { useEffect, useState } from "react"
import { ImageOff, ImageIcon, Loader2 } from "lucide-react"
import { tagStyle } from "@/lib/tag-color"
import type { CardRow, Column } from "@/lib/types"

// Some artwork requests (especially the local uploads route) occasionally stall
// without ever firing `load` or `error`, leaving a blank preview until the
// element is remounted. We watchdog each load and retry a fresh request a few
// times with a cache-busting param before showing the error state.
const MAX_RETRIES = 2
const STALL_TIMEOUT_MS = 3000

interface ImagePreviewProps {
  row: CardRow | null
  columns: Column[]
}

export function ImagePreview({ row, columns }: ImagePreviewProps) {
  const artworkCol = columns.find((c) => c.isArtwork)
  const nameCol = columns.find((c) => c.id === "name")
  const tagCol = columns.find((c) => c.type === "tag")

  const src = artworkCol && row ? String(row.values[artworkCol.id] ?? "") : ""
  const name = nameCol && row ? String(row.values[nameCol.id] ?? "") : ""
  const tags = tagCol && row && Array.isArray(row.values[tagCol.id]) ? (row.values[tagCol.id] as string[]) : []

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "loaded")
  const [attempt, setAttempt] = useState(0)

  // Reset the load lifecycle whenever the selected artwork changes.
  useEffect(() => {
    setAttempt(0)
    setStatus(src ? "loading" : "loaded")
  }, [src])

  // Watchdog: if a load neither completes nor errors, retry then fall back.
  useEffect(() => {
    if (status !== "loading" || !src) return
    const timer = setTimeout(() => {
      if (attempt < MAX_RETRIES) setAttempt((a) => a + 1)
      else setStatus("error")
    }, STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status, src, attempt])

  const handleError = () => {
    if (attempt < MAX_RETRIES) setAttempt((a) => a + 1)
    else setStatus("error")
  }

  // Retries use a cache-busting param so the browser issues a genuinely new
  // request rather than replaying the stalled one.
  const displaySrc = attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}reload=${attempt}`

  if (!row) {
    return (
      <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <ImageIcon className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No card selected</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Select a row from the grid to preview its artwork here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
        {src && status !== "error" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={displaySrc}
              src={displaySrc || "/placeholder.svg"}
              alt={name || "Card artwork"}
              className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${
                status === "loaded" ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setStatus("loaded")}
              onError={handleError}
            />
            {status === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <span className="sr-only">Loading artwork…</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ImageOff className="size-6" />
            <p className="text-sm">{src ? "Image could not be loaded" : "No artwork uploaded"}</p>
          </div>
        )}
      </div>
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-balance">{name || "Untitled card"}</h2>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                style={tagStyle(tag, tagCol?.options)}
                className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
