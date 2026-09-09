"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, ShieldCheck, Trash2, User as UserIcon } from "lucide-react"
import { createAccount, deleteUser, setUserRole, type AdminUser } from "@/app/actions/admin"
import type { Role } from "@/lib/admin"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Input, Label, Select } from "@/components/ui/field"
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

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as Role })
  const [savingNew, setSavingNew] = useState(false)

  const adminCount = users.filter((u) => u.role === "admin").length

  const openCreate = () => {
    setForm({ name: "", email: "", password: "", role: "user" })
    setCreateError(null)
    setCreating(true)
  }

  const submitCreate = () => {
    setCreateError(null)
    setSavingNew(true)
    startTransition(async () => {
      try {
        await createAccount(form)
        setCreating(false)
        router.refresh()
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : "Could not create the account")
      } finally {
        setSavingNew(false)
      }
    })
  }

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
    <div className="mx-auto flex max-w-4xl flex-col px-4 pt-6 lg:px-8">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/")}>
            <ArrowLeft />
            Back to collection
          </Button>
          <Button onClick={openCreate}>
            <Plus />
            New account
          </Button>
        </div>
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
        open={creating}
        onClose={() => (savingNew ? null : setCreating(false))}
        title="Create account"
        description="The new user can sign in immediately with this email and password."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submitCreate()
          }}
        >
          <div>
            <Label htmlFor="new-account-name">Name</Label>
            <Input
              id="new-account-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="Ada Lovelace"
            />
          </div>
          <div>
            <Label htmlFor="new-account-email">Email</Label>
            <Input
              id="new-account-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label htmlFor="new-account-password">Password</Label>
            <Input
              id="new-account-password"
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <Label htmlFor="new-account-role">Role</Label>
            <Select
              id="new-account-role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value === "admin" ? "admin" : "user" }))}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </div>

          {createError ? (
            <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {createError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={savingNew} onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingNew}>
              {savingNew ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      </Modal>

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
