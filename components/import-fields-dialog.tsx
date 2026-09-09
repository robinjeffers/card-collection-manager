"use client"

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { AlertTriangle, ClipboardPaste, Loader2, Upload } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Label, Select } from "@/components/ui/field"
import type { CardRow, CellValue, Column } from "@/lib/types"

interface FieldUpdate {
  rowId: string
  values: Record<string, CellValue>
}

interface NewTagOptions {
  columnId: string
  options: string[]
}

interface ImportFieldsDialogProps {
  open: boolean
  onClose: () => void
  columns: Column[]
  rows: CardRow[]
  onApply: (updates: FieldUpdate[], newTagOptions: NewTagOptions[]) => void
}

const IGNORE = "__ignore__"

/**
 * Parse pasted spreadsheet data (tab-separated) or CSV text into a matrix of
 * cells, honouring quoted fields and escaped quotes. Tabs win as the delimiter
 * when present (that's what a spreadsheet range paste produces), otherwise
 * commas.
 */
function parseDelimited(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const delimiter = normalized.includes("\t") ? "\t" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

/** Coerce a raw cell string into the stored value for a column, or undefined to skip (blank). */
function coerce(raw: string, type: Column["type"]): CellValue | undefined {
  const t = raw.trim()
  if (t === "") return undefined
  if (type === "number") {
    const n = Number(t)
    return Number.isFinite(n) ? n : t
  }
  if (type === "tag") {
    const arr = t
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
    return arr.length > 0 ? arr : undefined
  }
  return t
}

export function ImportFieldsDialog({ open, onClose, columns, rows, onApply }: ImportFieldsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [applied, setApplied] = useState(false)

  const nameCol = useMemo(
    () => columns.find((c) => c.id === "name") ?? columns.find((c) => c.type === "text") ?? columns[0],
    [columns],
  )

  // Only text / number / tag columns can receive imported field data.
  const mappableColumns = useMemo(
    () => columns.filter((c) => c.type === "text" || c.type === "number" || c.type === "tag"),
    [columns],
  )

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const matrix = parseDelimited(text)
    if (matrix.length < 1) return null
    const [headers, ...dataRows] = matrix
    return { headers: headers.map((h) => h.trim()), dataRows }
  }, [text])

  // Auto-map headers to columns by name whenever new data is parsed.
  const autoMapping = useMemo(() => {
    if (!parsed) return {}
    const map: Record<number, string> = {}
    parsed.headers.forEach((header, i) => {
      const match = mappableColumns.find((c) => c.name.toLowerCase() === header.toLowerCase())
      map[i] = match ? match.id : IGNORE
    })
    return map
  }, [parsed, mappableColumns])

  // The effective mapping is user overrides on top of the auto-map.
  const effectiveMapping = (index: number) => mapping[index] ?? autoMapping[index] ?? IGNORE

  const keyHeaderIndex = useMemo(() => {
    if (!parsed) return -1
    for (let i = 0; i < parsed.headers.length; i++) {
      if (effectiveMapping(i) === nameCol?.id) return i
    }
    return -1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping, autoMapping, nameCol])

  const nameToRowId = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) {
      const n = String(r.values[nameCol?.id ?? "name"] ?? "").trim().toLowerCase()
      if (n && !m.has(n)) m.set(n, r.id)
    }
    return m
  }, [rows, nameCol])

  const preview = useMemo(() => {
    if (!parsed || keyHeaderIndex < 0) return null
    let matched = 0
    let unmatched = 0
    let changes = 0
    const unmatchedNames: string[] = []
    for (const dataRow of parsed.dataRows) {
      const key = (dataRow[keyHeaderIndex] ?? "").trim()
      if (!key) continue
      const rowId = nameToRowId.get(key.toLowerCase())
      if (!rowId) {
        unmatched++
        if (unmatchedNames.length < 8) unmatchedNames.push(key)
        continue
      }
      matched++
      parsed.headers.forEach((_, i) => {
        const colId = effectiveMapping(i)
        if (colId === IGNORE || colId === nameCol?.id) return
        const col = columns.find((c) => c.id === colId)
        if (!col) return
        if (coerce(dataRow[i] ?? "", col.type) !== undefined) changes++
      })
    }
    return { matched, unmatched, changes, unmatchedNames }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, keyHeaderIndex, mapping, autoMapping, nameToRowId, columns, nameCol])

  const reset = () => {
    setText("")
    setMapping({})
    setApplied(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    file.text().then((t) => {
      setText(t)
      setMapping({})
    })
  }

  const apply = () => {
    if (!parsed || keyHeaderIndex < 0) return
    const updates: FieldUpdate[] = []
    const newOptions = new Map<string, Set<string>>()

    for (const dataRow of parsed.dataRows) {
      const key = (dataRow[keyHeaderIndex] ?? "").trim()
      if (!key) continue
      const rowId = nameToRowId.get(key.toLowerCase())
      if (!rowId) continue

      const values: Record<string, CellValue> = {}
      parsed.headers.forEach((_, i) => {
        const colId = effectiveMapping(i)
        if (colId === IGNORE || colId === nameCol?.id) return
        const col = columns.find((c) => c.id === colId)
        if (!col) return
        const value = coerce(dataRow[i] ?? "", col.type)
        if (value === undefined) return
        values[col.id] = value
        if (col.type === "tag" && Array.isArray(value)) {
          const known = new Set(col.options ?? [])
          const set = newOptions.get(col.id) ?? new Set<string>()
          value.forEach((v) => {
            if (!known.has(v)) set.add(v)
          })
          newOptions.set(col.id, set)
        }
      })

      if (Object.keys(values).length > 0) updates.push({ rowId, values })
    }

    const tagOptions: NewTagOptions[] = [...newOptions.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([columnId, set]) => ({ columnId, options: [...set] }))

    onApply(updates, tagOptions)
    setApplied(true)
    setTimeout(close, 900)
  }

  const canApply = !!preview && preview.matched > 0 && preview.changes > 0 && !applied

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import field data"
      description="Paste a range from a spreadsheet or upload a CSV. The first row is treated as column headers; rows are matched to existing cards by name."
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Paste spreadsheet or CSV</Label>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" />
              Upload CSV
            </Button>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setMapping({})
            }}
            rows={5}
            placeholder={"Card Name\tRarity\tPower\tDeck Tags\nEmber Knight\tRare\t7\tFire, Legendary"}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {text.trim() && !parsed ? (
            <p className="mt-1 text-xs text-destructive">Could not read any rows from that input.</p>
          ) : null}
        </div>

        {parsed ? (
          <div>
            <Label>Map columns</Label>
            <ul className="flex flex-col gap-2">
              {parsed.headers.map((header, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-sm"
                    title={header || `Column ${i + 1}`}
                  >
                    {header || <span className="text-muted-foreground">{`Column ${i + 1}`}</span>}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <div className="relative w-40 shrink-0">
                    <Select
                      value={effectiveMapping(i)}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="h-8"
                      aria-label={`Map column "${header || i + 1}"`}
                    >
                      <option value={IGNORE}>Ignore</option>
                      {mappableColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.id === nameCol?.id ? " (match key)" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>

            {keyHeaderIndex < 0 ? (
              <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                Map one column to {nameCol?.name ?? "Card Name"} (match key) so rows can be matched to cards.
              </p>
            ) : null}
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium text-foreground">
                {preview.matched} matched{preview.matched === 1 ? "" : ""}
              </span>
              <span className="text-muted-foreground">
                {preview.changes} field value{preview.changes === 1 ? "" : "s"} to update
              </span>
            </p>
            {preview.unmatched > 0 ? (
              <p className="mt-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {preview.unmatched} row{preview.unmatched === 1 ? "" : "s"} skipped (no matching card):{" "}
                  <span className="text-muted-foreground">
                    {preview.unmatchedNames.join(", ")}
                    {preview.unmatched > preview.unmatchedNames.length ? "…" : ""}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

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
                <ClipboardPaste className="size-4" />
                Update {preview?.matched ?? 0} card{(preview?.matched ?? 0) === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
