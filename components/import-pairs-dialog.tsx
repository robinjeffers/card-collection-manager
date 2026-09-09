"use client"

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { AlertTriangle, Check, FileText, ImageIcon, Layers, Loader2, X } from "lucide-react"
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

interface ImportPairsDialogProps {
  open: boolean
  onClose: () => void
  onImport: (items: { name: string; artworkUrl?: string; templateUrl?: string }[]) => void
}

type SlotStatus = "none" | "pending" | "uploading" | "done" | "error"

interface Pair {
  id: string
  name: string
  imageFile?: File
  templateFile?: File
  imageStatus: SlotStatus
  templateStatus: SlotStatus
  imageUrl?: string
  templateUrl?: string
  imageError?: string
  templateError?: string
}

const IMAGE_EXTS = new Set(Object.keys(EXTENSION_MIME))
const TEMPLATE_EXTS = new Set(Object.keys(TEMPLATE_EXTENSION_MIME))

/** Strip the extension to use as the pairing key / default card name. */
function baseName(filename: string) {
  const dot = filename.lastIndexOf(".")
  return (dot > 0 ? filename.slice(0, dot) : filename).trim()
}

let counter = 0

export function ImportPairsDialog({ open, onClose, onImport }: ImportPairsDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pairs, setPairs] = useState<Pair[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [importing, setImporting] = useState(false)

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

        const base = baseName(file.name)
        const key = base.toLowerCase()
        let pair = byName.get(key)
        if (!pair) {
          pair = {
            id: `pair-${counter++}`,
            name: base,
            imageStatus: "none",
            templateStatus: "none",
          }
          byName.set(key, pair)
          order.push(key)
        }
        if (isImage) {
          pair.imageFile = file
          pair.imageStatus = "pending"
          pair.imageError = undefined
        } else {
          pair.templateFile = file
          pair.templateStatus = "pending"
          pair.templateError = undefined
        }
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

  const reset = () => {
    setPairs([])
    setImporting(false)
  }

  const close = () => {
    if (importing) return
    reset()
    onClose()
  }

  const pendingCount = useMemo(() => pairs.filter((p) => p.imageStatus !== "done" || p.templateStatus !== "done").length, [pairs])
  const unmatchedCount = useMemo(
    () => pairs.filter((p) => !p.imageFile || !p.templateFile).length,
    [pairs],
  )

  async function uploadFile(file: File, kind: "image" | "file"): Promise<string> {
    const body = new FormData()
    body.append("file", file)
    if (kind === "file") body.append("kind", "file")
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
    const succeeded: { name: string; artworkUrl?: string; templateUrl?: string }[] = []
    let failures = 0

    for (const pair of pairs) {
      const needsImage = pair.imageFile && pair.imageStatus !== "done"
      const needsTemplate = pair.templateFile && pair.templateStatus !== "done"
      if (!needsImage && !needsTemplate && pair.imageStatus !== "done" && pair.templateStatus !== "done") {
        continue
      }

      let imageUrl = pair.imageUrl
      let templateUrl = pair.templateUrl
      let pairFailed = false

      if (needsImage) {
        setPairs((prev) => prev.map((p) => (p.id === pair.id ? { ...p, imageStatus: "uploading", imageError: undefined } : p)))
        try {
          imageUrl = await uploadFile(pair.imageFile!, "image")
          setPairs((prev) => prev.map((p) => (p.id === pair.id ? { ...p, imageStatus: "done", imageUrl } : p)))
        } catch (e) {
          pairFailed = true
          setPairs((prev) =>
            prev.map((p) =>
              p.id === pair.id ? { ...p, imageStatus: "error", imageError: e instanceof Error ? e.message : "Failed" } : p,
            ),
          )
        }
      }

      if (needsTemplate) {
        setPairs((prev) => prev.map((p) => (p.id === pair.id ? { ...p, templateStatus: "uploading", templateError: undefined } : p)))
        try {
          templateUrl = await uploadFile(pair.templateFile!, "file")
          setPairs((prev) => prev.map((p) => (p.id === pair.id ? { ...p, templateStatus: "done", templateUrl } : p)))
        } catch (e) {
          pairFailed = true
          setPairs((prev) =>
            prev.map((p) =>
              p.id === pair.id
                ? { ...p, templateStatus: "error", templateError: e instanceof Error ? e.message : "Failed" }
                : p,
            ),
          )
        }
      }

      if (pairFailed) {
        failures += 1
      } else {
        succeeded.push({ name: pair.name.trim() || "Untitled", artworkUrl: imageUrl, templateUrl })
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
      setPairs((prev) => prev.filter((p) => p.imageStatus === "error" || p.templateStatus === "error"))
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
      title="Import artwork + templates"
      description="Drop artwork and template files together. Files that share a name (without extension) are paired into one card."
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
          {dragActive ? "Drop files to add" : "Click or drag artwork and template files here"}
        </span>
      </button>

      {unmatchedCount > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {unmatchedCount} card{unmatchedCount === 1 ? " is" : "s are"} missing artwork or a template. They&apos;ll still
          be imported.
        </p>
      ) : null}

      {pairs.length > 0 ? (
        <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {pairs.map((pair) => {
            const unmatched = !pair.imageFile || !pair.templateFile
            return (
              <li key={pair.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <div className="min-w-0 flex-1">
                  <Input
                    value={pair.name}
                    onChange={(e) => renamePair(pair.id, e.target.value)}
                    disabled={importing || (pair.imageStatus === "done" && pair.templateStatus === "done")}
                    aria-label={`Card name`}
                    className="h-8"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <SlotBadge
                      icon={<ImageIcon className="size-3.5" />}
                      label="Artwork"
                      present={!!pair.imageFile}
                      status={pair.imageStatus}
                      error={pair.imageError}
                    />
                    <SlotBadge
                      icon={<FileText className="size-3.5" />}
                      label="Template"
                      present={!!pair.templateFile}
                      status={pair.templateStatus}
                      error={pair.templateError}
                    />
                    {unmatched ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        Unmatched
                      </span>
                    ) : null}
                  </div>
                </div>
                {!importing && !(pair.imageStatus === "done" && pair.templateStatus === "done") ? (
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
