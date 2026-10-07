"use client"

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { AlertTriangle, Check, FileText, Frame, ImageIcon, Layers, Loader2, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/field"
import {
  ACCEPT_ATTRIBUTE,
  EXTENSION_MIME,
  TEMPLATE_ACCEPT_ATTRIBUTE,
  TEMPLATE_EXTENSION_MIME,
  fileExtension,
} from "@/lib/uploads"
import { createThumbnailBlob } from "@/lib/image-thumbnail"

export interface ImportedPair {
  name: string
  artworkUrl?: string
  bleedUrl?: string
  templateUrl?: string
}

interface ImportPairsDialogProps {
  open: boolean
  onClose: () => void
  onImport: (items: ImportedPair[]) => void
  /** Also accept `<name>_Bleed.<ext>` images as a third, bleed-artwork slot. */
  withBleed?: boolean
}

type SlotKey = "image" | "bleed" | "template"
type SlotStatus = "none" | "pending" | "uploading" | "done" | "error"

interface Slot {
  file?: File
  status: SlotStatus
  url?: string
  error?: string
}

interface Pair {
  id: string
  name: string
  slots: Record<SlotKey, Slot>
}

const IMAGE_EXTS = new Set(Object.keys(EXTENSION_MIME))
const TEMPLATE_EXTS = new Set(Object.keys(TEMPLATE_EXTENSION_MIME))
const BLEED_SUFFIX = /_bleed$/i

/** Strip the extension to use as the pairing key / default card name. */
function baseName(filename: string) {
  const dot = filename.lastIndexOf(".")
  return (dot > 0 ? filename.slice(0, dot) : filename).trim()
}

const emptySlot = (): Slot => ({ status: "none" })

let counter = 0

export function ImportPairsDialog({ open, onClose, onImport, withBleed = false }: ImportPairsDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pairs, setPairs] = useState<Pair[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [importing, setImporting] = useState(false)

  const activeSlots: SlotKey[] = withBleed ? ["image", "bleed", "template"] : ["image", "template"]

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files)
    if (incoming.length === 0) return

    setPairs((prev) => {
      // Index existing pairs by their (lowercased) base name so repeated drops merge.
      const byName = new Map<string, Pair>()
      const order: string[] = []
      for (const p of prev) {
        byName.set(p.name.toLowerCase(), p)
        order.push(p.name.toLowerCase())
      }

      for (const file of incoming) {
        const ext = fileExtension(file.name)
        const isImage = IMAGE_EXTS.has(ext)
        const isTemplate = TEMPLATE_EXTS.has(ext)
        if (!isImage && !isTemplate) continue

        let base = baseName(file.name)
        let slotKey: SlotKey = isImage ? "image" : "template"
        if (isImage && withBleed && BLEED_SUFFIX.test(base)) {
          base = base.replace(BLEED_SUFFIX, "").trim()
          slotKey = "bleed"
        }
        if (!base) continue

        const key = base.toLowerCase()
        let pair = byName.get(key)
        if (!pair) {
          pair = {
            id: `pair-${counter++}`,
            name: base,
            slots: { image: emptySlot(), bleed: emptySlot(), template: emptySlot() },
          }
          byName.set(key, pair)
          order.push(key)
        }
        pair.slots = { ...pair.slots, [slotKey]: { file, status: "pending" } }
      }

      return order.map((k) => byName.get(k)!)
    })
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

  const removePair = (id: string) => setPairs((prev) => prev.filter((p) => p.id !== id))

  const renamePair = (id: string, name: string) =>
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))

  const close = () => {
    if (importing) return
    setPairs([])
    onClose()
  }

  const isPairDone = (p: Pair) => activeSlots.every((k) => !p.slots[k].file || p.slots[k].status === "done")
  const hasPending = (p: Pair) => activeSlots.some((k) => p.slots[k].file && p.slots[k].status !== "done")

  const pendingCount = useMemo(() => pairs.filter(hasPending).length, [pairs]) // eslint-disable-line react-hooks/exhaustive-deps
  const unmatchedCount = useMemo(
    () => pairs.filter((p) => activeSlots.some((k) => !p.slots[k].file)).length,
    [pairs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function uploadFile(file: File, kind: "image" | "file"): Promise<string> {
    const body = new FormData()
    body.append("file", file)
    if (kind === "file") {
      body.append("kind", "file")
    } else {
      const thumb = await createThumbnailBlob(file)
      if (thumb) body.append("thumbnail", new File([thumb], "thumb.webp", { type: "image/webp" }))
    }
    const res = await fetch("/api/uploads", { method: "POST", body })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error || "Upload failed")
    }
    const { url } = (await res.json()) as { url: string }
    return url
  }

  const setSlot = (pairId: string, key: SlotKey, patch: Partial<Slot>) =>
    setPairs((prev) =>
      prev.map((p) => (p.id === pairId ? { ...p, slots: { ...p.slots, [key]: { ...p.slots[key], ...patch } } } : p)),
    )

  const runImport = async () => {
    setImporting(true)
    const succeeded: ImportedPair[] = []
    let failures = 0

    for (const pair of pairs) {
      if (!hasPending(pair)) continue

      const urls: Partial<Record<SlotKey, string>> = {}
      let pairFailed = false

      for (const key of activeSlots) {
        const slot = pair.slots[key]
        if (!slot.file) continue
        if (slot.status === "done") {
          urls[key] = slot.url
          continue
        }
        setSlot(pair.id, key, { status: "uploading", error: undefined })
        try {
          const url = await uploadFile(slot.file, key === "template" ? "file" : "image")
          urls[key] = url
          setSlot(pair.id, key, { status: "done", url })
        } catch (e) {
          pairFailed = true
          setSlot(pair.id, key, { status: "error", error: e instanceof Error ? e.message : "Failed" })
        }
      }

      if (pairFailed) {
        failures += 1
      } else {
        succeeded.push({
          name: pair.name.trim() || "Untitled",
          artworkUrl: urls.image,
          bleedUrl: urls.bleed,
          templateUrl: urls.template,
        })
      }
    }

    if (succeeded.length > 0) onImport(succeeded)
    setImporting(false)

    // All good → reset & close. Otherwise keep the failed rows for a retry and
    // drop the ones that already imported cleanly.
    if (failures === 0) {
      setPairs([])
      onClose()
    } else {
      setPairs((prev) => prev.filter((p) => activeSlots.some((k) => p.slots[k].status === "error")))
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

  const slotMeta: Record<SlotKey, { label: string; icon: React.ReactNode }> = {
    image: { label: "Artwork", icon: <ImageIcon className="size-3.5" /> },
    bleed: { label: "Bleed", icon: <Frame className="size-3.5" /> },
    template: { label: "Template", icon: <FileText className="size-3.5" /> },
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={withBleed ? "Import artwork + bleed + templates" : "Import artwork + templates"}
      description={
        withBleed
          ? "Drop artwork, bleed artwork, and template files together. Files that share a name are paired into one card — bleed artwork is matched by a _Bleed suffix (e.g. Acid Surge_Bleed.png)."
          : "Drop artwork and template files together. Files that share a name (without extension) are paired into one card."
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPT_ATTRIBUTE},${TEMPLATE_ACCEPT_ATTRIBUTE}`}
        multiple
        className="hidden"
        onChange={onPick}
      />

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
        <Layers className="size-6" />
        <span className="text-sm">
          {dragActive
            ? "Drop files to add"
            : withBleed
              ? "Click or drag artwork, bleed, and template files here"
              : "Click or drag artwork and template files here"}
        </span>
      </button>

      {unmatchedCount > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {unmatchedCount} card{unmatchedCount === 1 ? " is" : "s are"} missing{" "}
          {withBleed ? "artwork, bleed, or a template" : "artwork or a template"}. They&apos;ll still be imported.
        </p>
      ) : null}

      {pairs.length > 0 ? (
        <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {pairs.map((pair) => {
            const unmatched = activeSlots.some((k) => !pair.slots[k].file)
            const done = isPairDone(pair)
            return (
              <li key={pair.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <div className="min-w-0 flex-1">
                  <Input
                    value={pair.name}
                    onChange={(e) => renamePair(pair.id, e.target.value)}
                    disabled={importing || done}
                    aria-label="Card name"
                    className="h-8"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {activeSlots.map((key) => (
                      <SlotBadge
                        key={key}
                        icon={slotMeta[key].icon}
                        label={slotMeta[key].label}
                        present={!!pair.slots[key].file}
                        status={pair.slots[key].status}
                        error={pair.slots[key].error}
                      />
                    ))}
                    {unmatched ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        Unmatched
                      </span>
                    ) : null}
                  </div>
                </div>
                {!importing && !done ? (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove card" onClick={() => removePair(pair.id)}>
                    <X />
                  </Button>
                ) : null}
              </li>
            )
          })}
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

function SlotBadge({
  icon,
  label,
  present,
  status,
  error,
}: {
  icon: React.ReactNode
  label: string
  present: boolean
  status: SlotStatus
  error?: string
}) {
  if (!present) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/50">
        {icon}
        {label}: —
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        status === "error" ? "text-destructive" : status === "done" ? "text-primary" : "text-muted-foreground"
      }`}
      title={error}
    >
      {icon}
      {label}
      {status === "uploading" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : status === "done" ? (
        <Check className="size-3" />
      ) : status === "error" ? (
        <X className="size-3" />
      ) : null}
    </span>
  )
}
