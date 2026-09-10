"use client"

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { Check, ImagePlus, Loader2, Upload, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/field"
import { ACCEPT_ATTRIBUTE } from "@/lib/uploads"
import { createPreviewBlob, createThumbnailBlob } from "@/lib/image-thumbnail"

interface ImportImagesDialogProps {
  open: boolean
  onClose: () => void
  onImport: (items: { name: string; url: string }[]) => void
}

type Status = "pending" | "uploading" | "done" | "error"

interface Item {
  id: string
  file: File
  name: string
  status: Status
  url?: string
  error?: string
}

/** Strip the extension from a filename to use as the default card name. */
function baseName(filename: string) {
  const dot = filename.lastIndexOf(".")
  return (dot > 0 ? filename.slice(0, dot) : filename).trim()
}

let counter = 0

export function ImportImagesDialog({ open, onClose, onImport }: ImportImagesDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [importing, setImporting] = useState(false)

  const addFiles = (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (images.length === 0) return
    setItems((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: `item-${counter++}`,
        file,
        name: baseName(file.name),
        status: "pending" as Status,
      })),
    ])
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ""
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (importing) return
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const renameItem = (id: string, name: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)))
  }

  const reset = () => {
    setItems([])
    setImporting(false)
  }

  const close = () => {
    if (importing) return
    reset()
    onClose()
  }

  const pendingCount = useMemo(() => items.filter((i) => i.status !== "done").length, [items])

  async function uploadOne(item: Item): Promise<string | null> {
    const body = new FormData()
    body.append("file", item.file)
    const thumb = await createThumbnailBlob(item.file)
    if (thumb) body.append("thumbnail", new File([thumb], "thumb.webp", { type: "image/webp" }))
    const preview = await createPreviewBlob(item.file)
    if (preview) body.append("preview", new File([preview], "preview.webp", { type: "image/webp" }))
    const res = await fetch("/api/uploads", { method: "POST", body })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error || "Upload failed")
    }
    const { url } = (await res.json()) as { url: string }
    return url
  }

  const runImport = async () => {
    setImporting(true)
    const succeeded: { name: string; url: string }[] = []
    let failures = 0

    for (const item of items) {
      if (item.status === "done") continue
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", error: undefined } : i)))
      try {
        const url = await uploadOne(item)
        if (!url) throw new Error("Upload failed")
        succeeded.push({ name: item.name.trim() || baseName(item.file.name), url })
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done", url } : i)))
      } catch (e) {
        failures += 1
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "error", error: e instanceof Error ? e.message : "Failed" } : i,
          ),
        )
      }
    }

    if (succeeded.length > 0) onImport(succeeded)
    setImporting(false)

    // If everything succeeded, reset and close; otherwise drop the imported
    // rows and leave the failed ones visible so the user can retry.
    if (failures === 0) {
      setItems([])
      onClose()
    } else {
      setItems((prev) => prev.filter((i) => i.status !== "done"))
    }
  }

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      if (!importing) setDragActive(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
    },
    onDrop,
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import images"
      description="Each image becomes a new card. The file name (without extension) is used as the card name."
    >
      <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} multiple className="hidden" onChange={onPick} />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        {...dragProps}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors ${
          dragActive
            ? "border-ring bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
        }`}
      >
        <ImagePlus className="size-6" />
        <span className="text-sm">{dragActive ? "Drop images to add" : "Click or drag images here"}</span>
      </button>

      {items.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                {item.status === "uploading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : item.status === "done" ? (
                  <Check className="size-4 text-primary" />
                ) : item.status === "error" ? (
                  <X className="size-4 text-destructive" />
                ) : (
                  <Upload className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Input
                  value={item.name}
                  onChange={(e) => renameItem(item.id, e.target.value)}
                  disabled={importing || item.status === "done"}
                  aria-label={`Card name for ${item.file.name}`}
                  className="h-8"
                />
                {item.status === "error" && item.error ? (
                  <p className="mt-1 text-xs text-destructive">{item.error}</p>
                ) : null}
              </div>
              {!importing && item.status !== "done" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => removeItem(item.id)}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={importing} onClick={close}>
          Cancel
        </Button>
        <Button type="button" disabled={importing || pendingCount === 0} onClick={runImport}>
          {importing ? (
            <>
              <Loader2 className="animate-spin" />
              Importing…
            </>
          ) : (
            `Import ${pendingCount} card${pendingCount === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </Modal>
  )
}
