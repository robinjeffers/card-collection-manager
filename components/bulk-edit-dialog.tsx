"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Wand2 } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Label, Input, Select } from "@/components/ui/field"
import { TagInput } from "@/components/tag-input"
import type { CardRow, CellValue, Column } from "@/lib/types"

interface FieldUpdate {
  rowId: string
  values: Record<string, CellValue>
}

interface NewTagOptions {
  columnId: string
  options: string[]
}

interface BulkEditDialogProps {
  open: boolean
  onClose: () => void
  columns: Column[]
  rows: CardRow[]
  onApply: (updates: FieldUpdate[], newTagOptions: NewTagOptions[]) => void
}

type TagMode = "add" | "remove" | "replace"

/**
 * Bulk-edit a single field across the selected cards. Text/number fields are
 * set to one value; tag fields can add, remove, or replace tags relative to
 * each card's existing tags.
 */
export function BulkEditDialog({ open, onClose, columns, rows, onApply }: BulkEditDialogProps) {
  // Editable fields: text (except the locked name key), number, tag.
  const editable = useMemo(
    () =>
      columns.filter(
        (c) => (c.type === "text" && c.id !== "name") || c.type === "number" || c.type === "tag",
      ),
    [columns],
  )

  const [columnId, setColumnId] = useState<string>("")
  const [textValue, setTextValue] = useState("")
  const [tagValue, setTagValue] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<TagMode>("add")
  const [createdOptions, setCreatedOptions] = useState<string[]>([])
  const [applied, setApplied] = useState(false)

  const activeColumn = editable.find((c) => c.id === columnId) ?? null

  // Default the field selection to the first editable column when opened.
  useEffect(() => {
    if (open && !columnId && editable[0]) setColumnId(editable[0].id)
  }, [open, columnId, editable])

  const reset = () => {
    setTextValue("")
    setTagValue([])
    setTagMode("add")
    setCreatedOptions([])
    setApplied(false)
  }

  const close = () => {
    reset()
    setColumnId("")
    onClose()
  }

  // Reset the value inputs when switching between fields.
  const selectColumn = (id: string) => {
    setColumnId(id)
    setTextValue("")
    setTagValue([])
    setTagMode("add")
    setCreatedOptions([])
  }

  const tagOptions = useMemo(() => {
    if (!activeColumn || activeColumn.type !== "tag") return []
    return [...new Set([...(activeColumn.options ?? []), ...createdOptions])]
  }, [activeColumn, createdOptions])

  const computed = useMemo(() => {
    if (!activeColumn) return { updates: [] as FieldUpdate[], changed: 0 }
    const updates: FieldUpdate[] = []

    for (const row of rows) {
      if (activeColumn.type === "tag") {
        const current = Array.isArray(row.values[activeColumn.id])
          ? (row.values[activeColumn.id] as string[])
          : []
        let next: string[]
        if (tagMode === "replace") {
          next = [...tagValue]
        } else if (tagMode === "add") {
          next = [...new Set([...current, ...tagValue])]
        } else {
          const remove = new Set(tagValue)
          next = current.filter((t) => !remove.has(t))
        }
        // Only record a real change.
        const changed =
          next.length !== current.length || next.some((t, i) => t !== current[i])
        if (changed) updates.push({ rowId: row.id, values: { [activeColumn.id]: next } })
      } else {
        const value: CellValue =
          activeColumn.type === "number"
            ? textValue.trim() === ""
              ? ""
              : Number(textValue)
            : textValue
        const current = row.values[activeColumn.id]
        if (String(current ?? "") !== String(value ?? "")) {
          updates.push({ rowId: row.id, values: { [activeColumn.id]: value } })
        }
      }
    }
    return { updates, changed: updates.length }
  }, [activeColumn, rows, tagValue, tagMode, textValue])

  const apply = () => {
    if (!activeColumn || computed.updates.length === 0) return
    const newTagOptions: NewTagOptions[] = []
    if (activeColumn.type === "tag" && (tagMode === "add" || tagMode === "replace")) {
      const known = new Set(activeColumn.options ?? [])
      const added = tagValue.filter((t) => !known.has(t))
      if (added.length > 0) newTagOptions.push({ columnId: activeColumn.id, options: added })
    }
    onApply(computed.updates, newTagOptions)
    setApplied(true)
    setTimeout(close, 800)
  }

  const numberInvalid =
    activeColumn?.type === "number" && textValue.trim() !== "" && !Number.isFinite(Number(textValue))

  const canApply = !!activeColumn && computed.changed > 0 && !numberInvalid && !applied

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Edit ${rows.length} card${rows.length === 1 ? "" : "s"}`}
      description="Choose a field and set its value across every selected card."
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>Field</Label>
          <div className="relative">
            <Select value={columnId} onChange={(e) => selectColumn(e.target.value)}>
              {editable.length === 0 ? <option value="">No editable fields</option> : null}
              {editable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {activeColumn && activeColumn.type === "tag" ? (
          <>
            <div>
              <Label>Action</Label>
              <div className="flex gap-1.5">
                {(["add", "remove", "replace"] as TagMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTagMode(mode)}
                    className={
                      "flex-1 rounded-md border px-2 py-1.5 text-sm capitalize transition-colors " +
                      (tagMode === mode
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>{tagMode === "remove" ? "Tags to remove" : "Tags"}</Label>
              <TagInput
                value={tagValue}
                options={tagOptions}
                onChange={(v) => setTagValue(v as string[])}
                onCreateOption={
                  tagMode === "remove"
                    ? undefined
                    : (opt) => {
                        setCreatedOptions((prev) => [...prev, opt])
                        setTagValue((prev) => [...prev, opt])
                      }
                }
              />
            </div>
          </>
        ) : null}

        {activeColumn && activeColumn.type !== "tag" ? (
          <div>
            <Label>New value</Label>
            <Input
              type={activeColumn.type === "number" ? "number" : "text"}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder={activeColumn.type === "number" ? "e.g. 5" : "Set text for all selected cards"}
            />
            {numberInvalid ? (
              <p className="mt-1 text-xs text-destructive">Enter a valid number.</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to clear this field on all selected cards.
              </p>
            )}
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {activeColumn ? (
            computed.changed > 0 ? (
              <span className="font-medium text-foreground">
                {computed.changed} of {rows.length} card{rows.length === 1 ? "" : "s"} will change
              </span>
            ) : (
              <span className="text-muted-foreground">No changes for the current selection.</span>
            )
          ) : (
            <span className="text-muted-foreground">Select a field to edit.</span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={!canApply} onClick={apply}>
            {applied ? (
              <>
                <Loader2 className="animate-spin" />
                Applied
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                Apply to {computed.changed} card{computed.changed === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
