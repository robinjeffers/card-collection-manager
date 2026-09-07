"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ShieldCheck, Trash2, User as UserIcon } from "lucide-react"
import { deleteUser, setUserRole, type AdminUser } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: AdminUser[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<AdminUser | null>(null)

  const adminCount = users.filter((u) => u.role === "admin").length

  const runAction = (id: string, fn: () => Promise<unknown>) => {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col px-4 py-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-balance">Account administration</h1>
            <p className="text-sm text-muted-foreground">
              {users.length} account{users.length === 1 ? "" : "s"} · {adminCount} admin
              {adminCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft />
          Back to collection
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              const isAdmin = u.role === "admin"
              const rowBusy = busyId === u.id && pending
              return (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {u.name}
                        {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                        isAdmin
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {isAdmin ? <ShieldCheck className="size-3" /> : <UserIcon className="size-3" />}
                      {isAdmin ? "Admin" : "User"}
                    </span>
                    {u.isConfiguredAdmin ? (
                      <span className="ml-2 text-xs text-muted-foreground">via ADMIN_EMAILS</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowBusy || isSelf}
                        title={isSelf ? "You cannot change your own role" : undefined}
                        onClick={() => runAction(u.id, () => setUserRole(u.id, isAdmin ? "user" : "admin"))}
                      >
                        {isAdmin ? "Demote to user" : "Promote to admin"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${u.email}`}
                        disabled={rowBusy || isSelf}
                        title={isSelf ? "You cannot delete your own account" : "Delete account"}
                        onClick={() => setToDelete(u)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Delete account"
        description={
          toDelete
            ? `This permanently deletes ${toDelete.email} and their entire card collection. This cannot be undone.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              const target = toDelete
              if (!target) return
              setToDelete(null)
              runAction(target.id, () => deleteUser(target.id))
            }}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </div>
  )
}
