import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/admin"
import { restoreFromBackup } from "@/lib/restore"

// Restores can be large and must never be cached.
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const current = await getCurrentUser()
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (current.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let bytes: Uint8Array
  try {
    const form = await request.formData()
    const file = form.get("backup")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No backup file was provided." }, { status: 400 })
    }
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 })
  }

  try {
    const result = await restoreFromBackup(bytes)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Restore failed." },
      { status: 400 },
    )
  }
}
