import type { CSSProperties } from "react"

// Fixed hues for the built-in deck tags so they read consistently.
const FIXED: Record<string, number> = {
  Consumable: 150,
  "Tier 1": 200,
  "Tier 2": 45,
  "Tier 3": 25,
  Spells: 265,
  Unique: 330,
}

function hueFor(tag: string): number {
  if (tag in FIXED) return FIXED[tag]
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) % 360
  }
  return hash
}

/** Subtle, cohesive pill styling derived deterministically from the tag text. */
export function tagStyle(tag: string): CSSProperties {
  const h = hueFor(tag)
  return {
    color: `oklch(0.82 0.11 ${h})`,
    backgroundColor: `oklch(0.42 0.06 ${h} / 0.22)`,
    borderColor: `oklch(0.7 0.1 ${h} / 0.35)`,
  }
}
