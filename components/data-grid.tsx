"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { GripVertical, Hash, ImageIcon, Lock, Paperclip, Pencil, Tag, Trash2, Type } from "lucide-react"
import { TagInput } from "@/components/tag-input"
import { ImageUpload } from "@/components/image-upload"
import { FileUpload } from "@/components/file-upload"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { tagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import type { CardRow, CellValue, Column } from "@/lib/types"

/** True when a cell holds a real value (non-empty string / non-empty array / number). */
function hasValue(value: CellValue): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "string") return value.trim() !== ""
  return true
}

const TYPE_ICON = {
  text: Type,
  number: Hash,
  tag: Tag,
  image: ImageIcon,
  file: Paperclip,
} as const

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

/**
 * Compute a stable width (in ch) for a column from the full dataset, so the
 * table can use `table-fixed` for virtualization without columns jittering as
 * rows scroll in and out. Header chrome (grip + type icon + delete button) adds
 * roughly 9ch on top of the label.
 */
function computeColWidthCh(col: Column, rows: CardRow[]): number {
  const header = col.name.length + 9
  switch (col.type) {
    case "number":
      return clamp(header, 10, 18)
    case "tag":
      return clamp(header, 24, 40)
    case "image":
      return clamp(header, 12, 20)
    case "file":
      return clamp(header, 20, 32)
    default: {
      let maxLen = 0
      for (const row of rows) {
        const v = row.values[col.id]
        if (typeof v === "string" && v.length > maxLen) maxLen = v.length
      }
      return clamp(Math.max(header, maxLen + 3), 16, 60)
    }
  }
}

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
  const [pendingDeleteCol, setPendingDeleteCol] = useState<Column | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const affectedCount = pendingDeleteCol
    ? rows.filter((r) => hasValue(r.values[pendingDeleteCol.id])).length
    : 0

  const resetDrag = () => {
    dragIndexRef.current = null
    setDragIndex(null)
    setOverIndex(null)
  }

  const colWidths = useMemo(
    () => columns.map((col) => computeColWidthCh(col, rows)),
    [columns, rows],
  )

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 49,
    overscan: 12,
    // Key by row id so measurements stay correct across sort/filter changes.
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalColumns = columns.length + 2 // filler + actions
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-xl border border-border"
      style={{ maxHeight: "calc(100svh - 15rem)" }}
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          {columns.map((col, i) => (
            <col key={col.id} style={{ width: `${colWidths[i]}ch` }} />
          ))}
          {/* filler soaks up leftover width; actions stays fixed */}
          <col />
          <col style={{ width: "6rem" }} />
        </colgroup>
        <thead>
          <tr>
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
                    "sticky top-0 z-10 bg-muted px-3 py-2.5 text-left font-medium whitespace-nowrap transition-colors",
                    "shadow-[inset_0_-1px_0_0_var(--color-border)]",
                    dragIndex === i && "opacity-40",
                    overIndex === i && dragIndex !== i && "bg-primary/15",
                  )}
                >
                  <div className={cn("flex items-center gap-1.5", col.type === "number" && "justify-center")}>
                    <GripVertical
                      className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50"
                      aria-hidden="true"
                    />
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{col.name}</span>
                    {col.locked ? (
                      <Lock className="size-3 shrink-0 text-muted-foreground/60" aria-label="Built-in column" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCol(col)}
                        className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive"
                        aria-label={`Delete column ${col.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </th>
              )
            })}
            <th
              aria-hidden="true"
              className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_0_var(--color-border)]"
            />
            <th className="sticky top-0 z-10 bg-muted px-3 py-2.5 text-right font-medium shadow-[inset_0_-1px_0_0_var(--color-border)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={totalColumns} style={{ height: paddingTop }} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]
            const selected = row.id === selectedId
            return (
              <tr
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                onClick={() => onSelect(row.id)}
                aria-selected={selected}
                className={cn(
                  "cursor-pointer border-b border-border/60 transition-colors",
                  selected
                    ? "bg-primary/10 shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    : "hover:bg-muted/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-3 py-1.5 align-middle",
                      col.type === "number" && "text-center",
                    )}
                  >
                    <GridCell
                      column={col}
                      value={row.values[col.id]}
                      onChange={(v) => onUpdateCell(row.id, col.id, v)}
                      onCreateTagOption={(opt) => onCreateTagOption(col.id, opt)}
                      onDeleteTagOption={(opt) => onDeleteTagOption(col.id, opt)}
                    />
                  </td>
                ))}
                <td aria-hidden="true" />
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
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={totalColumns} style={{ height: paddingBottom }} />
            </tr>
          ) : null}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          No cards yet. Add your first card to get started.
        </div>
      ) : null}

      <Modal
        open={pendingDeleteCol !== null}
        onClose={() => setPendingDeleteCol(null)}
        title="Delete column?"
        description={
          pendingDeleteCol
            ? `This permanently removes the "${pendingDeleteCol.name}" column and its values from every card. This can't be undone.`
            : undefined
        }
      >
        {affectedCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {affectedCount} card{affectedCount === 1 ? "" : "s"} currently{" "}
            {affectedCount === 1 ? "has" : "have"} data in this column that will be lost.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No cards have data in this column.</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDeleteCol(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (pendingDeleteCol) onDeleteColumn(pendingDeleteCol.id)
              setPendingDeleteCol(null)
            }}
          >
            Delete column
          </Button>
        </div>
      </Modal>
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

  if (column.type === "file") {
    return <FileUpload value={String(value ?? "")} onChange={(url) => onChange(url)} />
  }

  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-center text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
      />
    )
  }

  // Text fills its (content-sized) column so the full value stays visible.
  const text = value == null ? "" : String(value)
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
    />
  )
}
