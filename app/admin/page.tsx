import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/admin"
import { listUsers } from "@/app/actions/admin"
import { buildStorageReport } from "@/lib/storage-report"
import { AdminUsers } from "@/components/admin-users"
import { StorageMaintenance } from "@/components/storage-maintenance"

export default async function AdminPage() {
  const current = await getCurrentUser()
  if (!current) redirect("/sign-in")
  if (current.role !== "admin") redirect("/")

  const [users, { report }] = await Promise.all([listUsers(), buildStorageReport()])

  return (
    <main className="min-h-svh bg-background">
      <AdminUsers users={users} currentUserId={current.id} />
      <StorageMaintenance initialReport={report} />
    </main>
  )
}
