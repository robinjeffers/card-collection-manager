"use client"

import { useState } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input, Label, Select } from "@/components/ui/field"
import type { Column, ColumnType } from "@/lib/types"

interface AddColumnDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (column: Omit<Column, "id">) => void
}

export function AddColumnDialog({ open, onClose, onAdd }: AddColumnDialogProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<ColumnType>("text")
  const [optionsText, setOptionsText] = useState("")

  const reset = () => {
    setName("")
    setType("text")
    setOptionsText("")
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const column: Omit<Column, "id"> = { name: trimmed, type }
    if (type === "tag") {
      column.options = optionsText
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    }
    onAdd(column)
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add column"
      description="Create a custom field for your collection."
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="col-name">Column name</Label>
          <Input
            id="col-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rarity, Price, Notes"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
            }}
          />
        </div>
        <div>
          <Label htmlFor="col-type">Data type</Label>
          <Select id="col-type" value={type} onChange={(e) => setType(e.target.value as ColumnType)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="tag">Tag (multiselect)</option>
            <option value="image">Image (upload)</option>
            <option value="file">File (upload)</option>
          </Select>
        </div>
        {type === "tag" ? (
          <div>
            <Label htmlFor="col-options">Tag options</Label>
            <Input
              id="col-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Common, Rare, Legendary"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Separate options with commas. You can also add more later while editing a card.
            </p>
          </div>
        ) : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Add column
          </Button>
        </div>
      </div>
    </Modal>
  )
}
