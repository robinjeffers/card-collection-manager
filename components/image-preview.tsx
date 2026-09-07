"use client"

import { useState } from "react"
import { ImageOff, ImageIcon } from "lucide-react"
import { tagStyle } from "@/lib/tag-color"
import type { CardRow, Column } from "@/lib/types"

interface ImagePreviewProps {
  row: CardRow | null
  columns: Column[]
}

export function ImagePreview({ row, columns }: ImagePreviewProps) {
  const [errored, setErrored] = useState(false)

  const artworkCol = columns.find((c) => c.isArtwork)
  const nameCol = columns.find((c) => c.id === "name")
  const tagCol = columns.find((c) => c.type === "tag")

  const src = artworkCol && row ? String(row.values[artworkCol.id] ?? "") : ""
  const name = nameCol && row ? String(row.values[nameCol.id] ?? "") : ""
  const tags = tagCol && row && Array.isArray(row.values[tagCol.id]) ? (row.values[tagCol.id] as string[]) : []

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
        {src && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src || "/placeholder.svg"}
            alt={name || "Card artwork"}
            className="max-h-full max-w-full object-contain"
            onError={() => setErrored(true)}
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ImageOff className="size-6" />
            <p className="text-sm">
              {src ? "Image could not be loaded" : "No artwork path set"}
            </p>
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
                style={tagStyle(tag)}
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
