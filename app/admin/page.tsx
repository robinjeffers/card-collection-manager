import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/admin"
import { listUsers } from "@/app/actions/admin"
import { AdminUsers } from "@/components/admin-users"

export default async function AdminPage() {
  const current = await getCurrentUser()
  if (!current) redirect("/sign-in")
  if (current.role !== "admin") redirect("/")

  const users = await listUsers()

  return (
    <main className="min-h-svh bg-background">
      <AdminUsers users={users} currentUserId={current.id} />
    </main>
  )
}
