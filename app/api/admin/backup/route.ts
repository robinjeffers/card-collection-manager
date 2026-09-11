import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/admin"
import { backupFilename, streamFullBackup } from "@/lib/backup"

// A full backup can be many GB; stream it and never cache it.
export const dynamic = "force-dynamic"
// Node runtime (fs + streaming); don't let the route be statically analyzed.
export const runtime = "nodejs"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) return new NextResponse("Unauthorized", { status: 401 })
  if (current.role !== "admin") return new NextResponse("Forbidden", { status: 403 })

  const filename = backupFilename()
  const stream = await streamFullBackup()

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
