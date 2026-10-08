"use client"

import { useState } from "react"
import { Check, Copy, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react"
import {
  createLibraryShareLink,
  createShareLink,
  revokeLibraryShareLink,
  revokeShareLink,
} from "@/app/actions/share"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { fieldClass } from "@/components/ui/field"
import { useToast } from "@/components/ui/toast"

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  /** Omit to manage the link covering every collection. */
  collectionId?: string
  token: string | null
  onTokenChange: (token: string | null) => void
}

export function ShareDialog({ open, onClose, collectionId, token, onTokenChange }: ShareDialogProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null)
  const [copied, setCopied] = useState(false)
  const isLibrary = collectionId === undefined

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : ""

  const generate = async () => {
    setBusy("create")
    try {
      const { token: next } = isLibrary ? await createLibraryShareLink() : await createShareLink(collectionId)
      onTokenChange(next)
      setCopied(false)
    } catch {
      toast({ message: "Couldn't create the share link." })
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    setBusy("revoke")
    try {
      if (isLibrary) await revokeLibraryShareLink()
      else await revokeShareLink(collectionId)
      onTokenChange(null)
      toast({ message: "Share link turned off." })
    } catch {
      toast({ message: "Couldn't turn off the share link." })
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ message: "Copy failed — select the link and copy it manually." })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isLibrary ? "Share all collections" : "Share collection"}
      description={
        isLibrary
          ? "One link to every collection — players can switch decks or search all cards at once. New collections appear automatically. Templates and bleed artwork are never shared, and nothing can be edited."
          : "Anyone with the link can search cards and view artwork, tags, and text fields. Templates and bleed artwork are never shared, and nothing can be edited."
      }
    >
      {token ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className={fieldClass}
            />
            <Button onClick={copy} className="shrink-0">
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={generate} disabled={busy !== null}>
              {busy === "create" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              New link
            </Button>
            <Button variant="destructive" size="sm" onClick={revoke} disabled={busy !== null}>
              {busy === "revoke" ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Turn off sharing
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            &ldquo;New link&rdquo; replaces this URL, so anyone holding the old one loses access.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {isLibrary ? "Sharing all collections is off." : "Sharing is off for this collection."}
          </p>
          <Button onClick={generate} disabled={busy !== null} className="self-start">
            {busy === "create" ? <Loader2 className="animate-spin" /> : <Link2 />}
            Create share link
          </Button>
        </div>
      )}
    </Modal>
  )
}
