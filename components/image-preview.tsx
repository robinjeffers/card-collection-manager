"use client"

import { useEffect, useState } from "react"
import { ImageOff, ImageIcon, Loader2, Download } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { tagStyle } from "@/lib/tag-color"
import { previewUrl, thumbnailUrl } from "@/lib/uploads"
import type { CardRow, Column } from "@/lib/types"

// Previews are normally generated eagerly (at upload and via admin "Optimize
// artwork"), so they usually exist before the panel asks. When one isn't ready
// this instant the serve route builds it on demand, which can take a moment on
// a busy origin. We watchdog that wait, but on a stall we drop to the next
// (already-cached) tier using the SAME url rather than re-firing a cache-busting
// request — replaying with `?reload=` only forces the server to regenerate and
// re-read, making a congested origin slower. A slow-but-live request is left to
// finish on its own.
const STALL_TIMEOUT_MS = 12000

// The panel is a lightweight visual reference, so we only ever *display* a
// small image: the optimized preview WebP first, then the grid thumbnail. The
// full multi-MB original is a last-resort display (older uploads that predate
// both derived files) and is otherwise reserved for the explicit download.
type Tier = "preview" | "thumb" | "full"

interface ImagePreviewProps {
  row: CardRow | null
  columns: Column[]
}

export function ImagePreview({ row, columns }: ImagePreviewProps) {
  const artworkCol = columns.find((c) => c.isArtwork)
  const nameCol = columns.find((c) => c.id === "name")
  const tagCols = columns.filter((c) => c.type === "tag")

  const src = artworkCol && row ? String(row.values[artworkCol.id] ?? "") : ""
  const name = nameCol && row ? String(row.values[nameCol.id] ?? "") : ""

  // Flatten tags across every tag column so the preview reflects all of a
  // card's tags (e.g. both "Deck" and "Magic"), each styled with its own
  // column's option colors. Keys are namespaced by column to stay unique when
  // the same tag value appears in more than one column.
  const tags = row
    ? tagCols.flatMap((col) => {
        const values = Array.isArray(row.values[col.id]) ? (row.values[col.id] as string[]) : []
        return values.map((tag) => ({ key: `${col.id}:${tag}`, tag, options: col.options }))
      })
    : []

  // Derived small-image URLs for our own uploads (null for external images).
  const preview = previewUrl(src)
  const thumb = thumbnailUrl(src)

  // Ordered display candidates, smallest/fastest first. External images have no
  // derived files, so they display their (already remote) original directly.
  const tiers: { tier: Tier; url: string }[] = []
  if (preview) tiers.push({ tier: "preview", url: preview })
  if (thumb) tiers.push({ tier: "thumb", url: thumb })
  if (src) tiers.push({ tier: "full", url: src })

  const [tierIndex, setTierIndex] = useState(0)
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "loaded")

  // Reset the load lifecycle whenever the selected artwork changes.
  useEffect(() => {
    setTierIndex(0)
    setStatus(src ? "loading" : "loaded")
  }, [src])

  // On failure (or a stall), fall through to the next already-cached display
  // tier — preview -> thumbnail -> full — reusing each tier's stable URL so the
  // browser cache can satisfy it. Only when every tier is exhausted do we show
  // the error state.
  const handleFailure = () => {
    if (tierIndex < tiers.length - 1) {
      setTierIndex((i) => i + 1)
      setStatus("loading")
    } else {
      setStatus("error")
    }
  }

  // Watchdog: if a load neither completes nor errors, drop to the next tier.
  useEffect(() => {
    if (status !== "loading" || !src) return
    const timer = setTimeout(handleFailure, STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tierIndex, src])

  const current = tiers[tierIndex]
  const displaySrc = current?.url ?? ""

  // Filename for the "Download full artwork" action, derived from the card name.
  const ext = (src.split("?")[0].split(".").pop() || "png").toLowerCase()
  const downloadName = `${(name || "artwork").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "artwork"}.${ext}`

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
              className={`relative z-10 max-h-full max-w-full object-contain transition-opacity duration-200 ${
                status === "loaded" ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setStatus("loaded")}
              onError={handleFailure}
            />
            {status === "loading" ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-muted-foreground">
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
            {tags.map(({ key, tag, options }) => (
              <span
                key={key}
                style={tagStyle(tag, options)}
                className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {src ? (
          <a
            href={src}
            download={downloadName}
            className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full" })}
          >
            <Download className="size-4" />
            Download full artwork
          </a>
        ) : null}
      </div>
    </div>
  )
}
