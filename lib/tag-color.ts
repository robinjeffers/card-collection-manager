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

// The golden angle spreads sequential hues far apart around the color wheel.
const GOLDEN_ANGLE = 137.508
// Minimum hue gap (degrees) enforced between tags in the same column.
const MIN_SEPARATION = 24

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Assign every option in a column a distinct hue. Built-in tags keep their
 * fixed hue; the rest are spread around the wheel via the golden angle,
 * skipping any hue too close to one already used — so no two tags in a column
 * share a color. Assignment is order-stable: appending a new option never
 * recolors the existing ones.
 */
function hueMapFor(options: string[]): Map<string, number> {
  const map = new Map<string, number>()
  const used: number[] = []

  // First pass: pin fixed tags to their designated hue.
  for (const tag of options) {
    if (tag in FIXED && !map.has(tag)) {
      map.set(tag, FIXED[tag])
      used.push(FIXED[tag])
    }
  }

  // Second pass: assign the rest from the golden-angle sequence, avoiding
  // collisions with hues already taken.
  let step = 0
  for (const tag of options) {
    if (map.has(tag)) continue
    let hue = 0
    let attempts = 0
    do {
      hue = Math.round((step * GOLDEN_ANGLE) % 360)
      step++
      attempts++
    } while (used.some((u) => hueDistance(u, hue) < MIN_SEPARATION) && attempts < 360)
    map.set(tag, hue)
    used.push(hue)
  }

  return map
}

// Cache the per-column hue map keyed on the option-list reference, so repeated
// renders don't recompute it. The list reference only changes when tags do.
const cache = new WeakMap<string[], Map<string, number>>()

function hashHue(tag: string): number {
  if (tag in FIXED) return FIXED[tag]
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) % 360
  }
  return hash
}

function styleFromHue(h: number): CSSProperties {
  return {
    color: `oklch(0.82 0.11 ${h})`,
    backgroundColor: `oklch(0.42 0.06 ${h} / 0.22)`,
    borderColor: `oklch(0.7 0.1 ${h} / 0.35)`,
  }
}

/**
 * Subtle, cohesive pill styling for a tag. Pass the column's ordered option
 * list to get colors that are unique within that column; without it, the hue
 * falls back to a deterministic hash of the tag text.
 */
export function tagStyle(tag: string, options?: string[]): CSSProperties {
  if (options && options.length > 0) {
    let map = cache.get(options)
    if (!map) {
      map = hueMapFor(options)
      cache.set(options, map)
    }
    const hue = map.get(tag)
    if (hue != null) return styleFromHue(hue)
  }
  return styleFromHue(hashHue(tag))
}
