"use client"

import { useEffect, useState } from "react"
import { ImageOff, ImageIcon, Loader2, Download } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { tagStyle } from "@/lib/tag-color"
import { previewUrl, thumbnailUrl } from "@/lib/uploads"
import type { CardRow, Column } from "@/lib/types"

// Some artwork requests (especially the local uploads route) occasionally stall
// without ever firing `load` or `error`, leaving a blank preview until the
// element is remounted. We watchdog each load and retry a fresh request a few
// times with a cache-busting param before falling back to the next tier.
const MAX_RETRIES = 2
// Previews are normally generated eagerly (at upload and via admin "Optimize
// artwork"), so they exist before the panel asks. This watchdog only matters
// for the rare lazy build of an older upload; give sharp ample room so we don't
// prematurely give up and drop to the tiny grid thumbnail.
const STALL_TIMEOUT_MS = 9000

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
  const tagCol = columns.find((c) => c.type === "tag")

  const src = artworkCol && row ? String(row.values[artworkCol.id] ?? "") : ""
  const name = nameCol && row ? String(row.values[nameCol.id] ?? "") : ""
  const tags = tagCol && row && Array.isArray(row.values[tagCol.id]) ? (row.values[tagCol.id] as string[]) : []

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
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "loaded")

  // Reset the load lifecycle whenever the selected artwork changes.
  useEffect(() => {
    setTierIndex(0)
    setAttempt(0)
    setStatus(src ? "loading" : "loaded")
  }, [src])

  // Advance to the next (larger) display tier. The serve route generates the
  // optimized preview on demand, so a failing preview tier just means it isn't
  // ready this instant; the retry/fallback below covers it.
  const advanceTier = () => {
    setTierIndex((i) => i + 1)
    setAttempt(0)
    setStatus("loading")
  }

  const handleFailure = () => {
    if (attempt < MAX_RETRIES) {
      setAttempt((a) => a + 1)
      setStatus("loading")
    } else if (tierIndex < tiers.length - 1) {
      advanceTier()
    } else {
      setStatus("error")
    }
  }

  // Watchdog: if a load neither completes nor errors, treat it as a failure.
  useEffect(() => {
    if (status !== "loading" || !src) return
    const timer = setTimeout(handleFailure, STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tierIndex, attempt, src])

  const current = tiers[tierIndex]
  const base = current?.url ?? ""
  // Retries use a cache-busting param so the browser issues a genuinely new
  // request rather than replaying the stalled one.
  const displaySrc = attempt === 0 ? base : `${base}${base.includes("?") ? "&" : "?"}reload=${attempt}`

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
            {/* Instant low-res placeholder: the grid thumbnail is tiny and
                usually already cached, so it paints immediately and avoids an
                empty box while the larger preview loads. */}
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 z-0 size-full scale-105 object-contain blur-md"
              />
            ) : null}
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
