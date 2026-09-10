"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { regenerateAllDerived, type OptimizeSummary } from "@/lib/image-derive"
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
 * (Re)generate the optimized preview + thumbnail for every uploaded image,
 * overwriting stale or lower-quality derivatives. Originals are left untouched.
 * Returns a summary plus a fresh storage report.
 */
export async function optimizeArtwork(): Promise<{ summary: OptimizeSummary; report: StorageReport }> {
  await requireAdmin()
  const summary = await regenerateAllDerived()
  const { report } = await buildStorageReport()
  revalidatePath("/admin")
  return { summary, report }
}
