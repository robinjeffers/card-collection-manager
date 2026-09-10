"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { listOriginalRelPaths, optimizeRelPaths, type OptimizeSummary } from "@/lib/image-derive"
import { buildStorageReport, deleteOrphanFiles, type StorageReport } from "@/lib/storage-report"

/** Re-scan disk + DB and return a fresh storage report (admin only). */
export async function rescanStorage(): Promise<StorageReport> {
  await requireAdmin()
  const { report } = await buildStorageReport()
  return report
}

/** Delete all orphaned upload files and return the freed space + updated report. */
export async function cleanupOrphans(): Promise<{ deleted: number; bytes: number; report: StorageReport }> {
  await requireAdmin()
  const { deleted, bytes } = await deleteOrphanFiles()
  const { report } = await buildStorageReport()
  revalidatePath("/admin")
  return { deleted, bytes, report }
}

/**
 * List every uploaded original image (as paths relative to the uploads root) so
 * the client can optimize them in small batches. Admin only.
 */
export async function listArtworkToOptimize(): Promise<{ paths: string[] }> {
  await requireAdmin()
  return { paths: await listOriginalRelPaths() }
}

/**
 * (Re)generate the optimized preview + thumbnail for one batch of images,
 * overwriting stale or lower-quality derivatives. Originals are left untouched.
 * Kept small and driven by the browser so a single request never runs long
 * enough to hit a reverse-proxy timeout. Returns a summary for this batch.
 */
export async function optimizeArtworkBatch(paths: string[]): Promise<{ summary: OptimizeSummary }> {
  await requireAdmin()
  return { summary: await optimizeRelPaths(paths) }
}
