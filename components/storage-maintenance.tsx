"use client"

import { useState, useTransition } from "react"
import { Download, HardDrive, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { cleanupOrphans, rescanStorage } from "@/app/actions/maintenance"
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
  thumbnail: { label: "Thumbnails", bar: "bg-primary/55", dot: "bg-primary/55" },
  template: { label: "Templates", bar: "bg-primary/30", dot: "bg-primary/30" },
  other: { label: "Other", bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/40" },
}

const CATEGORY_ORDER: StorageCategory[] = ["image", "thumbnail", "template", "other"]

export function StorageMaintenance({ initialReport }: { initialReport: StorageReport }) {
  const [report, setReport] = useState(initialReport)
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState<"rescan" | "cleanup" | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)

  const downloadBackup = async () => {
    setError(null)
    setNotice(null)
    setBackingUp(true)
    try {
      const res = await fetch("/api/admin/backup")
      if (!res.ok) throw new Error(`Backup failed (${res.status})`)
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? "ccm-backup.zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setNotice(`Backup downloaded (${formatBytes(blob.size)}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed")
    } finally {
      setBackingUp(false)
    }
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
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
