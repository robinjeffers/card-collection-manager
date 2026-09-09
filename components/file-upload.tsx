"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react"
import { TEMPLATE_ACCEPT_ATTRIBUTE, fileExtension } from "@/lib/uploads"

interface FileUploadProps {
  value: string
  onChange: (url: string) => void
  variant?: "cell" | "full"
}

const ALLOWED = new Set(
  TEMPLATE_ACCEPT_ATTRIBUTE.split(",").map((e) => e.replace(/^\./, "").toLowerCase()),
)

/** Human-readable filename from a stored /api/uploads/.../<name> URL. */
function fileNameFromUrl(url: string): string {
  if (!url) return ""
  const last = url.split("?")[0].split("/").pop() || ""
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

export function FileUpload({ value, onChange, variant = "cell" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const name = fileNameFromUrl(value)

  async function upload(file: File) {
    if (!ALLOWED.has(fileExtension(file.name))) {
      setError("Unsupported file type")
      return
    }
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("kind", "file")
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
    if (file) void upload(file)
  }
  const dragProps = { onDragOver, onDragLeave, onDrop }

  const hiddenInput = (
    <input ref={inputRef} type="file" accept={TEMPLATE_ACCEPT_ATTRIBUTE} className="hidden" onChange={onPick} />
  )

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
  }

  if (variant === "full") {
    return (
      <div>
        {hiddenInput}
        {value ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm" title={name}>
              {name}
            </span>
            <a
              href={value}
              download={name}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="size-4" />
              Download
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={pick}
            {...dragProps}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground ${
              dragActive ? "border-ring bg-primary/10 text-foreground" : "border-border"
            }`}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {uploading ? "Uploading…" : dragActive ? "Drop file to upload" : "Click or drag a template file"}
          </button>
        )}
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button type="button" onClick={pick} className="text-muted-foreground hover:text-foreground">
            {value ? "Replace" : "Upload"}
          </button>
          {value ? (
            <button type="button" onClick={remove} className="text-muted-foreground/70 hover:text-destructive">
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
        className={`flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted transition-colors ${
          dragActive ? "border-ring ring-2 ring-ring/40" : "border-border"
        }`}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <FileText className="size-4 text-muted-foreground" />
        ) : (
          <Paperclip className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        {value && !uploading ? (
          <>
            <a
              href={value}
              download={name}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-left text-sm text-foreground hover:underline"
              title={name}
            >
              {name}
            </a>
            <div className="flex items-center gap-2">
              <button type="button" onClick={pick} className="text-left text-xs text-muted-foreground hover:text-foreground">
                Replace
              </button>
              <button
                type="button"
                onClick={remove}
                className="inline-flex items-center text-xs text-muted-foreground/70 hover:text-destructive"
                aria-label="Remove file"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={pick}
            className="text-left text-sm text-muted-foreground hover:text-foreground"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        )}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  )
}
