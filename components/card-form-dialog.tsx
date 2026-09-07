"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/field"
import { TagInput } from "@/components/tag-input"
import { ImageUpload } from "@/components/image-upload"
import type { CardRow, CellValue, Column } from "@/lib/types"

interface CardFormDialogProps {
  open: boolean
  onClose: () => void
  columns: Column[]
  /** When provided, the form edits this row; otherwise it creates a new one. */
  row?: CardRow | null
  onSubmit: (values: Record<string, CellValue>) => void
  onCreateTagOption: (columnId: string, option: string) => void
  onDeleteTagOption: (columnId: string, option: string) => void
}

function emptyValues(columns: Column[]): Record<string, CellValue> {
  const values: Record<string, CellValue> = {}
  for (const col of columns) values[col.id] = col.type === "tag" ? [] : ""
  return values
}

export function CardFormDialog({
  open,
  onClose,
  columns,
  row,
  onSubmit,
  onCreateTagOption,
  onDeleteTagOption,
}: CardFormDialogProps) {
  const [values, setValues] = useState<Record<string, CellValue>>(emptyValues(columns))

  useEffect(() => {
    if (!open) return
    setValues(row ? { ...emptyValues(columns), ...row.values } : emptyValues(columns))
  }, [open, row, columns])

  const setValue = (id: string, value: CellValue) => setValues((prev) => ({ ...prev, [id]: value }))

  const submit = () => {
    const cleaned: Record<string, CellValue> = { ...values }
    for (const col of columns) {
      if (col.type === "number") {
        const raw = cleaned[col.id]
        cleaned[col.id] = raw === "" || raw == null ? "" : Number(raw)
      }
    }
    onSubmit(cleaned)
    onClose()
  }

  const nameCol = columns.find((c) => c.id === "name")
  const nameValue = nameCol ? String(values[nameCol.id] ?? "").trim() : "ok"

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? "Edit card" : "New card"}
      description={row ? "Update this card's details." : "Add a new card to your collection."}
    >
      <div className="flex flex-col gap-4">
        {columns.map((col) => (
          <div key={col.id}>
            <Label htmlFor={`field-${col.id}`}>{col.name}</Label>
            {col.type === "tag" ? (
              <TagInput
                value={Array.isArray(values[col.id]) ? (values[col.id] as string[]) : []}
                options={col.options ?? []}
                onChange={(v) => setValue(col.id, v)}
                onCreateOption={(opt) => onCreateTagOption(col.id, opt)}
                onDeleteOption={(opt) => onDeleteTagOption(col.id, opt)}
              />
            ) : col.type === "image" ? (
              <ImageUpload
                value={String(values[col.id] ?? "")}
                onChange={(url) => setValue(col.id, url)}
                variant="full"
              />
            ) : (
              <Input
                id={`field-${col.id}`}
                type={col.type === "number" ? "number" : "text"}
                inputMode={col.type === "number" ? "numeric" : undefined}
                value={values[col.id] == null ? "" : String(values[col.id])}
                onChange={(e) =>
                  setValue(col.id, col.type === "number" ? e.target.value : e.target.value)
                }
              />
            )}
          </div>
        ))}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!nameValue}>
            {row ? "Save changes" : "Add card"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
