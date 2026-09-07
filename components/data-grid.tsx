"use client"

import { Hash, ImageIcon, Lock, Pencil, Tag, Trash2, Type } from "lucide-react"
import { TagInput } from "@/components/tag-input"
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
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void
  onCreateTagOption: (columnId: string, option: string) => void
}

export function DataGrid({
  columns,
  rows,
  selectedId,
  onSelect,
  onEdit,
  onDeleteRow,
  onDeleteColumn,
  onUpdateCell,
  onCreateTagOption,
}: DataGridProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => {
              const Icon = TYPE_ICON[col.type]
              return (
                <th
                  key={col.id}
                  className="min-w-40 px-3 py-2.5 text-left font-medium whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
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
                  <td key={col.id} className="px-3 py-1.5 align-middle">
                    <GridCell
                      column={col}
                      value={row.values[col.id]}
                      onChange={(v) => onUpdateCell(row.id, col.id, v)}
                      onCreateTagOption={(opt) => onCreateTagOption(col.id, opt)}
                    />
                  </td>
                ))}
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
}

function GridCell({ column, value, onChange, onCreateTagOption }: GridCellProps) {
  if (column.type === "tag") {
    return (
      <TagInput
        value={Array.isArray(value) ? (value as string[]) : []}
        options={column.options ?? []}
        onChange={onChange}
        onCreateOption={onCreateTagOption}
      />
    )
  }

  if (column.type === "image") {
    const src = String(value ?? "")
    return (
      <div className="flex items-center gap-2">
        <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || "/placeholder.svg"}
              alt=""
              className="size-full object-cover"
              crossOrigin="anonymous"
            />
          ) : null}
        </div>
        <input
          value={src}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/cards/…"
          className="h-8 w-full min-w-32 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
        />
      </div>
    )
  }

  return (
    <input
      type={column.type === "number" ? "number" : "text"}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(column.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
    />
  )
}
