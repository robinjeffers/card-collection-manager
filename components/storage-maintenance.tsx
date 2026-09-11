"use client"

import { useRef, useState, useTransition } from "react"
import { Download, HardDrive, Loader2, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react"
import { cleanupOrphans, listArtworkToOptimize, optimizeArtworkBatch, rescanStorage } from "@/app/actions/maintenance"
import type { StorageCategory, StorageReport } from "@/lib/storage-report"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"

function formatBytes(n: number): string {
  if (n <= 0) return "0 B"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

const CATEGORY_META: Record<StorageCategory, { label: string; bar: string; dot: string }> = {
  image: { label: "Artwork", bar: "bg-primary", dot: "bg-primary" },
  preview: { label: "Previews", bar: "bg-primary/70", dot: "bg-primary/70" },
  thumbnail: { label: "Thumbnails", bar: "bg-primary/45", dot: "bg-primary/45" },
  template: { label: "Templates", bar: "bg-primary/25", dot: "bg-primary/25" },
  other: { label: "Other", bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/40" },
}

const CATEGORY_ORDER: StorageCategory[] = ["image", "preview", "thumbnail", "template", "other"]

export function StorageMaintenance({ initialReport }: { initialReport: StorageReport }) {
  const [report, setReport] = useState(initialReport)
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState<"rescan" | "cleanup" | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeProgress, setOptimizeProgress] = useState<{ done: number; total: number } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  const onPickRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return
    setError(null)
    setNotice(null)
    setRestoreFile(file)
    setRestoreConfirmOpen(true)
  }

  const doRestore = async () => {
    if (!restoreFile) return
    setRestoreConfirmOpen(false)
    setError(null)
    setNotice(null)
    setRestoring(true)
    try {
      const body = new FormData()
      body.append("backup", restoreFile)
      const res = await fetch("/api/admin/restore", { method: "POST", body })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? `Restore failed (${res.status})`)
      const skipped = json.skipped?.length ? ` ${json.skipped.length} entr${json.skipped.length === 1 ? "y was" : "ies were"} skipped.` : ""
      setNotice(
        `Restored ${json.collectionsRestored} collection${json.collectionsRestored === 1 ? "" : "s"} and ${json.filesRestored} file${json.filesRestored === 1 ? "" : "s"} (${formatBytes(json.fileBytes)}).${skipped}`,
      )
      const fresh = await rescanStorage()
      setReport(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed")
    } finally {
      setRestoring(false)
      setRestoreFile(null)
    }
  }

  // Trigger the backup as a direct browser download (navigation to the route,
  // which responds with `Content-Disposition: attachment`). The server streams
  // the zip and the browser writes it straight to disk, so neither side has to
  // hold a multi-GB archive in memory — unlike a `fetch()` + `blob()` which
  // buffers the whole file and fails for large libraries.
  const downloadBackup = () => {
    setError(null)
    setNotice(null)
    setBackingUp(true)
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = "/api/admin/backup"
    document.body.appendChild(iframe)
    // We can't observe when a native download finishes; re-enable the button
    // shortly after kicking it off and leave the download running in the
    // background.
    window.setTimeout(() => {
      setBackingUp(false)
      setNotice(
        "Your backup download has started. A large library can take a while and downloads in the background — you can keep working.",
      )
      window.setTimeout(() => iframe.remove(), 60_000)
    }, 2_000)
  }

  const run = (kind: "rescan" | "cleanup", fn: () => Promise<void>) => {
    setError(null)
    setNotice(null)
    setAction(kind)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      } finally {
        setAction(null)
      }
    })
  }

  const rescan = () =>
    run("rescan", async () => {
      const fresh = await rescanStorage()
      setReport(fresh)
    })

  const cleanup = () =>
    run("cleanup", async () => {
      const result = await cleanupOrphans()
      setReport(result.report)
      setNotice(
        result.deleted === 0
          ? "No orphaned files needed removal."
          : `Removed ${result.deleted} orphaned file${result.deleted === 1 ? "" : "s"} and reclaimed ${formatBytes(result.bytes)}.`,
      )
    })

  // Optimize in small browser-driven batches: each request handles only a
  // handful of images, so a single call never runs long enough to trip a
  // reverse-proxy timeout (e.g. Cloudflare Tunnel's ~100s cap), and the user
  // sees live progress instead of one opaque long request.
  const optimize = async () => {
    const BATCH_SIZE = 12
    setError(null)
    setNotice(null)
    setOptimizing(true)
    setOptimizeProgress({ done: 0, total: 0 })
    try {
      const { paths } = await listArtworkToOptimize()
      if (paths.length === 0) {
        setNotice("No artwork found to optimize.")
        return
      }
      setOptimizeProgress({ done: 0, total: paths.length })
      const totals = { processed: 0, failed: 0, originalBytes: 0, previewBytes: 0, thumbBytes: 0 }
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE)
        const { summary } = await optimizeArtworkBatch(batch)
        totals.processed += summary.processed
        totals.failed += summary.failed
        totals.originalBytes += summary.originalBytes
        totals.previewBytes += summary.previewBytes
        totals.thumbBytes += summary.thumbBytes
        setOptimizeProgress({ done: Math.min(i + batch.length, paths.length), total: paths.length })
      }
      const fresh = await rescanStorage()
      setReport(fresh)
      const failedNote = totals.failed > 0 ? ` ${totals.failed} could not be read and were skipped.` : ""
      setNotice(
        `Optimized ${totals.processed} image${totals.processed === 1 ? "" : "s"}: previews now total ` +
          `${formatBytes(totals.previewBytes)} (down from ${formatBytes(totals.originalBytes)} of originals, ` +
          `which are kept intact for downloads).${failedNote}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optimization failed")
    } finally {
      setOptimizing(false)
      setOptimizeProgress(null)
    }
  }

  const segments = CATEGORY_ORDER.filter((c) => report.categories[c].bytes > 0)
  const showPerUser = report.perUser.length > 1

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <HardDrive className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Storage</h2>
            <p className="text-sm text-muted-foreground">
              {formatBytes(report.totalBytes)} across {report.totalFiles} file
              {report.totalFiles === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={rescan} disabled={pending}>
          {pending && action === "rescan" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Rescan
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        {report.totalFiles === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No uploaded files yet.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {segments.map((c) => (
                <div
                  key={c}
                  className={cn("h-full", CATEGORY_META[c].bar)}
                  style={{ width: `${(report.categories[c].bytes / report.totalBytes) * 100}%` }}
                  title={`${CATEGORY_META[c].label}: ${formatBytes(report.categories[c].bytes)}`}
                />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CATEGORY_ORDER.map((c) => (
                <li key={c} className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={cn("size-2.5 rounded-full", CATEGORY_META[c].dot)} />
                    {CATEGORY_META[c].label}
                  </span>
                  <span className="text-sm font-medium">{formatBytes(report.categories[c].bytes)}</span>
                  <span className="text-xs text-muted-foreground">
                    {report.categories[c].files} file{report.categories[c].files === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {showPerUser ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-4 py-2.5 font-medium">Owner namespace</th>
                <th className="px-4 py-2.5 text-right font-medium">Files</th>
                <th className="px-4 py-2.5 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {report.perUser.map((u) => (
                <tr key={u.userId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{u.name ?? "Unknown / unassigned"}</span>
                      {u.email ? <span className="text-xs text-muted-foreground">{u.email}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.files}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBytes(u.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Orphaned files</h3>
          <p className="text-sm text-muted-foreground">
            {report.orphanFiles === 0
              ? "No orphaned files. Every upload is referenced by a card."
              : `${report.orphanFiles} file${report.orphanFiles === 1 ? "" : "s"} (${formatBytes(report.orphanBytes)}) are no longer referenced by any card and can be safely removed.`}
            {report.recentlyModifiedSkipped > 0
              ? ` ${report.recentlyModifiedSkipped} recently uploaded file${report.recentlyModifiedSkipped === 1 ? " is" : "s are"} held back for an hour in case they're still being attached to a card.`
              : ""}
          </p>
        </div>
        <Button
          variant="destructive"
          disabled={pending || report.orphanFiles === 0}
          onClick={() => setConfirmOpen(true)}
          className="shrink-0"
        >
          {pending && action === "cleanup" ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Clean up
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium">Optimize artwork</h3>
            <p className="text-sm text-muted-foreground">
              Regenerate the small preview and grid thumbnail for every uploaded image at the
              current quality. Runs in small batches so it works reliably even over a remote tunnel.
              Fixes older or low-resolution previews and shrinks what the app loads. Your
              full-resolution originals are never modified.
            </p>
          </div>
          <Button variant="outline" onClick={optimize} disabled={pending || optimizing} className="shrink-0">
            {optimizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {optimizing ? "Optimizing…" : "Optimize"}
          </Button>
        </div>
        {optimizeProgress ? (
          <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${optimizeProgress.total ? (optimizeProgress.done / optimizeProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {optimizeProgress.total === 0
                ? "Scanning artwork…"
                : `Optimizing ${optimizeProgress.done} of ${optimizeProgress.total} images…`}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Full backup</h3>
          <p className="text-sm text-muted-foreground">
            Download every collection and its uploaded files as a single zip. Includes raw data
            (for exact restore), a CSV per collection, and all artwork and template files.
          </p>
        </div>
        <Button variant="outline" onClick={downloadBackup} disabled={backingUp} className="shrink-0">
          {backingUp ? <Loader2 className="animate-spin" /> : <Download />}
          {backingUp ? "Preparing…" : "Download backup"}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Restore from backup</h3>
          <p className="text-sm text-muted-foreground">
            Upload a backup zip to restore its collections and files. Collections are matched by ID
            and overwritten; anything not in the backup is left untouched.
          </p>
        </div>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={onPickRestoreFile}
          className="sr-only"
        />
        <Button
          variant="outline"
          onClick={() => restoreInputRef.current?.click()}
          disabled={restoring}
          className="shrink-0"
        >
          {restoring ? <Loader2 className="animate-spin" /> : <Upload />}
          {restoring ? "Restoring…" : "Restore backup"}
        </Button>
      </div>

      <Modal
        open={restoreConfirmOpen}
        onClose={() => {
          setRestoreConfirmOpen(false)
          setRestoreFile(null)
        }}
        title="Restore this backup?"
        description={`This restores collections and files from "${restoreFile?.name ?? "the selected file"}". Collections with the same ID as ones in the backup will be overwritten. Collections not included in the backup are left as-is.`}
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRestoreConfirmOpen(false)
              setRestoreFile(null)
            }}
          >
            Cancel
          </Button>
          <Button onClick={doRestore}>Restore</Button>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete orphaned files?"
        description={`This permanently deletes ${report.orphanFiles} unreferenced file${
          report.orphanFiles === 1 ? "" : "s"
        } (${formatBytes(report.orphanBytes)}) from disk. This can't be undone.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmOpen(false)
              cleanup()
            }}
          >
            Delete files
          </Button>
        </div>
      </Modal>
    </section>
  )
}
