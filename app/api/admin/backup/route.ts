import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/admin"
import { buildFullBackup } from "@/lib/backup"

// A full backup can be large; don't let the platform cache it and give it room.
export const dynamic = "force-dynamic"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) return new NextResponse("Unauthorized", { status: 401 })
  if (current.role !== "admin") return new NextResponse("Forbidden", { status: 403 })

  const { bytes, filename } = await buildFullBackup()

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
