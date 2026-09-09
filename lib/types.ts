export type ColumnType = "text" | "number" | "tag" | "image" | "file"

export interface Column {
  id: string
  name: string
  type: ColumnType
  /** Available options for tag columns. */
  options?: string[]
  /** Built-in columns cannot be deleted. */
  locked?: boolean
  /** The single column whose value drives the preview image. */
  isArtwork?: boolean
}

export type CellValue = string | number | string[] | null | undefined

export interface CardRow {
  id: string
  values: Record<string, CellValue>
}

export interface Collection {
  columns: Column[]
  rows: CardRow[]
}

/** Lightweight metadata for the collections home/picker screen. */
export interface CollectionSummary {
  id: string
  name: string
  cardCount: number
  updatedAt: string | null
}
