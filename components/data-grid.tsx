"use client"

import { useRef, useState } from "react"
import { GripVertical, Hash, ImageIcon, Lock, Pencil, Tag, Trash2, Type } from "lucide-react"
import { TagInput } from "@/components/tag-input"
import { ImageUpload } from "@/components/image-upload"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { CardRow, CellValue, Column } from "@/lib/types"

const TYPE_ICON = {
  text: Type,
  number: Hash,
  tag: Tag,
  image: ImageIcon,
} as const

interface DataGridProps {
  columns: Column[]
  rows: CardRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (row: CardRow) => void
  onDeleteRow: (id: string) => void
  onDeleteColumn: (id: string) => void
  onReorderColumns: (from: number, to: number) => void
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void
  onCreateTagOption: (columnId: string, option: string) => void
  onDeleteTagOption: (columnId: string, option: string) => void
}

/** Number columns shrink to fit their header/content; others keep a min width. */
function colWidthClass(type: Column["type"]) {
  return type === "number" ? "w-px whitespace-nowrap" : "min-w-40"
}

export function DataGrid({
  columns,
  rows,
  selectedId,
  onSelect,
  onEdit,
  onDeleteRow,
  onDeleteColumn,
  onReorderColumns,
  onUpdateCell,
  onCreateTagOption,
  onDeleteTagOption,
}: DataGridProps) {
  const dragIndexRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const resetDrag = () => {
    dragIndexRef.current = null
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col, i) => {
              const Icon = TYPE_ICON[col.type]
              return (
                <th
                  key={col.id}
                  draggable
                  onDragStart={() => {
                    dragIndexRef.current = i
                    setDragIndex(i)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (overIndex !== i) setOverIndex(i)
                  }}
                  onDrop={() => {
                    const from = dragIndexRef.current
                    if (from !== null) onReorderColumns(from, i)
                    resetDrag()
                  }}
                  onDragEnd={resetDrag}
                  className={cn(
                    "px-3 py-2.5 text-left font-medium whitespace-nowrap transition-colors",
                    colWidthClass(col.type),
                    dragIndex === i && "opacity-40",
                    overIndex === i && dragIndex !== i && "bg-primary/15",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <GripVertical
                      className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50"
                      aria-hidden="true"
                    />
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span>{col.name}</span>
                    {col.locked ? (
                      <Lock className="size-3 text-muted-foreground/60" aria-label="Built-in column" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDeleteColumn(col.id)}
                        className="ml-0.5 rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive"
                        aria-label={`Delete column ${col.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </th>
              )
            })}
            <th className="w-full" aria-hidden="true" />
            <th className="w-20 px-3 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId
            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                aria-selected={selected}
                className={cn(
                  "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                  selected
                    ? "bg-primary/10 shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    : "hover:bg-muted/40",
                )}
              >
                {columns.map((col) => (
                  <td key={col.id} className={cn("px-3 py-1.5 align-middle", colWidthClass(col.type))}>
                    <GridCell
                      column={col}
                      value={row.values[col.id]}
                      onChange={(v) => onUpdateCell(row.id, col.id, v)}
                      onCreateTagOption={(opt) => onCreateTagOption(col.id, opt)}
                      onDeleteTagOption={(opt) => onDeleteTagOption(col.id, opt)}
                    />
                  </td>
                ))}
                <td className="w-full" aria-hidden="true" />
                <td className="px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(row)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${String(row.values.name ?? "card")}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteRow(row.id)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      aria-label={`Delete ${String(row.values.name ?? "card")}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          No cards yet. Add your first card to get started.
        </div>
      ) : null}
    </div>
  )
}

interface GridCellProps {
  column: Column
  value: CellValue
  onChange: (value: CellValue) => void
  onCreateTagOption: (option: string) => void
  onDeleteTagOption: (option: string) => void
}

function GridCell({ column, value, onChange, onCreateTagOption, onDeleteTagOption }: GridCellProps) {
  if (column.type === "tag") {
    return (
      <TagInput
        value={Array.isArray(value) ? (value as string[]) : []}
        options={column.options ?? []}
        onChange={onChange}
        onCreateOption={onCreateTagOption}
        onDeleteOption={onDeleteTagOption}
      />
    )
  }

  if (column.type === "image") {
    return <ImageUpload value={String(value ?? "")} onChange={(url) => onChange(url)} />
  }

  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-8 w-16 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-right text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
      />
    )
  }

  // Text: grow the field to fit its content (bounded) so the full name is visible.
  const text = value == null ? "" : String(value)
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: `${Math.min(Math.max(text.length + 3, 14), 60)}ch` }}
      className="h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
    />
  )
}
