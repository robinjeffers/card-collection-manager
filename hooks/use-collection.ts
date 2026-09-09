"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CellValue, Collection, Column } from "@/lib/types"
import { saveCollectionData } from "@/app/actions/collection"

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Manages the signed-in user's collection. The initial value is loaded on the
 * server and passed in; every change is debounced and persisted to the
 * database, scoped to the current user by the server action.
 */
export function useCollection(initial: Collection, collectionId: string) {
  const [collection, setCollection] = useState<Collection>(initial)
  const [saving, setSaving] = useState(false)
  const firstRun = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (timer.current) clearTimeout(timer.current)
    setSaving(true)
    timer.current = setTimeout(async () => {
      try {
        await saveCollectionData(collectionId, collection)
      } catch {
        // network/auth error — the local state is preserved and the next
        // change will retry the save.
      } finally {
        setSaving(false)
      }
    }, 600)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [collection, collectionId])

  const addColumn = useCallback((column: Omit<Column, "id">) => {
    setCollection((prev) => ({
      ...prev,
      columns: [...prev.columns, { ...column, id: uid("col") }],
    }))
  }, [])

  const reorderColumns = useCallback((from: number, to: number) => {
    setCollection((prev) => {
      if (from === to || from < 0 || to < 0) return prev
      const cols = [...prev.columns]
      if (from >= cols.length || to >= cols.length) return prev
      const [moved] = cols.splice(from, 1)
      cols.splice(to, 0, moved)
      return { ...prev, columns: cols }
    })
  }, [])

  const removeColumn = useCallback((columnId: string) => {
    setCollection((prev) => ({
      columns: prev.columns.filter((c) => c.id !== columnId),
      rows: prev.rows.map((r) => {
        const { [columnId]: _removed, ...rest } = r.values
        return { ...r, values: rest }
      }),
    }))
  }, [])

  const addTagOption = useCallback((columnId: string, option: string) => {
    setCollection((prev) => ({
      ...prev,
      columns: prev.columns.map((c) =>
        c.id === columnId && !(c.options ?? []).includes(option)
          ? { ...c, options: [...(c.options ?? []), option] }
          : c,
      ),
    }))
  }, [])

  const removeTagOption = useCallback((columnId: string, option: string) => {
    setCollection((prev) => ({
      ...prev,
      columns: prev.columns.map((c) =>
        c.id === columnId ? { ...c, options: (c.options ?? []).filter((o) => o !== option) } : c,
      ),
      // Also strip the removed tag from every card that had it selected.
      rows: prev.rows.map((r) => {
        const v = r.values[columnId]
        if (!Array.isArray(v)) return r
        return { ...r, values: { ...r.values, [columnId]: (v as string[]).filter((t) => t !== option) } }
      }),
    }))
  }, [])

  const addRow = useCallback((values: Record<string, CellValue>) => {
    const id = uid("card")
    setCollection((prev) => ({ ...prev, rows: [{ id, values }, ...prev.rows] }))
    return id
  }, [])

  const addRows = useCallback((rowsValues: Record<string, CellValue>[]) => {
    const created = rowsValues.map((values) => ({ id: uid("card"), values }))
    setCollection((prev) => ({ ...prev, rows: [...created, ...prev.rows] }))
    return created.map((r) => r.id)
  }, [])

  const updateRow = useCallback((rowId: string, values: Record<string, CellValue>) => {
    setCollection((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, ...values } } : r)),
    }))
  }, [])

  const updateCell = useCallback((rowId: string, columnId: string, value: CellValue) => {
    setCollection((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r)),
    }))
  }, [])

  const removeRow = useCallback((rowId: string) => {
    setCollection((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }))
  }, [])

  const removeRows = useCallback((rowIds: string[]) => {
    const ids = new Set(rowIds)
    setCollection((prev) => ({ ...prev, rows: prev.rows.filter((r) => !ids.has(r.id)) }))
  }, [])

  // Apply a batch of per-row value merges in a single state update, so bulk
  // edits over many rows only trigger one save.
  const updateRows = useCallback((updates: { rowId: string; values: Record<string, CellValue> }[]) => {
    const map = new Map(updates.map((u) => [u.rowId, u.values]))
    setCollection((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        const values = map.get(r.id)
        return values ? { ...r, values: { ...r.values, ...values } } : r
      }),
    }))
  }, [])

  return {
    collection,
    saving,
    addColumn,
    removeColumn,
    reorderColumns,
    addTagOption,
    removeTagOption,
    addRow,
    addRows,
    updateRow,
    updateRows,
    updateCell,
    removeRow,
    removeRows,
  }
}
