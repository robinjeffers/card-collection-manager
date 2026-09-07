"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CellValue, Collection, Column } from "@/lib/types"
import { defaultCollection } from "@/lib/default-data"

const STORAGE_KEY = "card-collection-v1"

function loadCollection(): Collection {
  if (typeof window === "undefined") return defaultCollection
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultCollection
    const parsed = JSON.parse(raw) as Collection
    if (!parsed?.columns || !parsed?.rows) return defaultCollection
    return parsed
  } catch {
    return defaultCollection
  }
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function useCollection() {
  const [collection, setCollection] = useState<Collection>(defaultCollection)
  const [hydrated, setHydrated] = useState(false)
  const firstRun = useRef(true)

  useEffect(() => {
    setCollection(loadCollection())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collection))
    } catch {
      // storage full or unavailable — ignore
    }
  }, [collection, hydrated])

  const addColumn = useCallback((column: Omit<Column, "id">) => {
    setCollection((prev) => ({
      ...prev,
      columns: [...prev.columns, { ...column, id: uid("col") }],
    }))
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

  const addRow = useCallback((values: Record<string, CellValue>) => {
    const id = uid("card")
    setCollection((prev) => ({ ...prev, rows: [{ id, values }, ...prev.rows] }))
    return id
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

  return {
    collection,
    hydrated,
    addColumn,
    removeColumn,
    addTagOption,
    addRow,
    updateRow,
    updateCell,
    removeRow,
  }
}
