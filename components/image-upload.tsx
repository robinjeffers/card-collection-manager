"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { ImageIcon, Loader2, Upload } from "lucide-react"
import { ACCEPT_ATTRIBUTE } from "@/lib/uploads"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  variant?: "cell" | "full"
}

export function ImageUpload({ value, onChange, variant = "cell" }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  async function upload(file: File) {
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/uploads", { method: "POST", body })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || "Upload failed")
      }
      const { url } = (await res.json()) as { url: string }
      onChange(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
    e.target.value = ""
  }

  const pick = (e: React.MouseEvent) => {
    e.stopPropagation()
    inputRef.current?.click()
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!uploading) setDragActive(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file")
      return
    }
    void upload(file)
  }

  const dragProps = { onDragOver, onDragLeave, onDrop }

  const hiddenInput = (
    <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={onPick} />
  )

  if (variant === "full") {
    return (
      <div>
        {hiddenInput}
        <button
          type="button"
          onClick={pick}
          {...dragProps}
          className={`relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:border-ring hover:text-foreground ${
            dragActive ? "border-ring bg-primary/10 text-foreground" : "border-border"
          }`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value || "/placeholder.svg"} alt="" className="size-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-2 p-6 text-center">
              <ImageIcon className="size-6" />
              <span className="text-sm">{dragActive ? "Drop image to upload" : "Click or drag image to upload"}</span>
            </span>
          )}
          {dragActive && value ? (
            <span className="absolute inset-0 flex items-center justify-center bg-primary/20 text-sm font-medium text-foreground">
              Drop to replace
            </span>
          ) : null}
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin" />
            </span>
          ) : null}
        </button>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button type="button" onClick={pick} className="text-muted-foreground hover:text-foreground">
            {value ? "Replace" : "Upload"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange("")
              }}
              className="text-muted-foreground/70 hover:text-destructive"
            >
              Remove
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2" {...dragProps}>
      {hiddenInput}
      <div
        className={`relative size-9 shrink-0 overflow-hidden rounded-md border bg-muted transition-colors ${
          dragActive ? "border-ring ring-2 ring-ring/40" : "border-border"
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <Upload className="size-4" />
          </span>
        )}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-4 animate-spin" />
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <button type="button" onClick={pick} className="text-left text-sm text-muted-foreground hover:text-foreground">
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </button>
        {value && !uploading ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange("")
            }}
            className="text-left text-xs text-muted-foreground/70 hover:text-destructive"
          >
            Remove
          </button>
        ) : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  )
}
