/**
 * Shared spell calculation logic for the new spell creation process.
 * Single source of truth for points, level mapping, and PM. Uses data/tables/spells.json.
 */

import spellsTables from "../../vendor/data/tables/spells.json"

interface SpellTable {
  name: string
  table: Array<{ min?: number; max?: number | null; value: string; label?: string; pm?: number }>
  points?: Record<string, number>
  ranges?: Array<{ min: number; max: number | null; level?: number; tier?: number }>
}

const tables = spellsTables as SpellTable[]
const baseTable = tables.find((t) => t.name === "spell-base")!
const aspectTable = tables.find((t) => t.name === "spell-aspect")!
const typeTable = tables.find((t) => t.name === "spell-type")!
const levelRangesTable = tables.find((t) => t.name === "spell-level-ranges")!
const effectScopeTable = tables.find((t) => t.name === "spell-effect-scope")!

const BASE_POINTS: Record<string, number> = baseTable?.points ?? {}
const ASPECT_POINTS: Record<string, number> = aspectTable?.points ?? {}
const TYPE_POINTS: Record<string, number> = typeTable?.points ?? {}
const LEVEL_RANGES: Array<{ min: number; max: number | null; level: number }> =
  (levelRangesTable?.ranges ?? []) as Array<{ min: number; max: number | null; level: number }>
const EFFECT_SCOPES: Array<{ value: string; label: string; pm: number }> = (
  effectScopeTable?.table ?? []
) as Array<{ value: string; label: string; pm: number }>

/** Additional axis cost: 1st extra = 1, 2nd = 2, 3rd = 5 (cumulative). Max 3 additional axes. */
const ADDITIONAL_AXIS_COST = [1, 2, 5]

/**
 * Cost for the nth additional axis (1-based): 1st = 1, 2nd = 2, 3rd = 5.
 */
export function getAdditionalAxisCost(n: 1 | 2 | 3): number {
  return ADDITIONAL_AXIS_COST[n - 1] ?? 0
}

/**
 * All additional axis costs for reference: [1st, 2nd, 3rd] = [1, 2, 5].
 */
export function getAdditionalAxisCosts(): [number, number, number] {
  return [ADDITIONAL_AXIS_COST[0], ADDITIONAL_AXIS_COST[1], ADDITIONAL_AXIS_COST[2]]
}

export interface SpellLevelResult {
  totalPoints: number
  axisCost: number
  spellLevel: number
  pm: number
  finalLevel: number
}

/**
 * Total point value for base + aspects + types, plus additional axis cost when there is more than one aspect and one type.
 * Multi-axis is only valid when base is Chaos; callers must enforce that.
 */
export function totalPoints(
  base: string,
  aspects: string[],
  types: string[]
): { total: number; axisCost: number } {
  const baseP = base ? BASE_POINTS[base] ?? 0 : 0
  const aspectP = aspects.reduce((sum, a) => sum + (ASPECT_POINTS[a] ?? 0), 0)
  const typeP = types.reduce((sum, t) => sum + (TYPE_POINTS[t] ?? 0), 0)
  const combinedAxes = aspects.length + types.length
  const additionalAxes = Math.max(0, combinedAxes - 2)
  const axisCost = ADDITIONAL_AXIS_COST.slice(0, additionalAxes).reduce((s, c) => s + c, 0)
  return { total: baseP + aspectP + typeP + axisCost, axisCost }
}

/**
 * Map total points to Spell Level 1–10 using the level mapping table.
 */
export function pointsToLevel(totalPoints: number): number {
  for (const range of LEVEL_RANGES) {
    if (totalPoints >= range.min && (range.max === null || totalPoints <= range.max)) {
      return range.level
    }
  }
  return 0
}

/**
 * Final spell level = base spell level + Power Modifier.
 */
export function finalLevel(spellLevel: number, pm: number): number {
  return spellLevel + pm
}

export function getBasePoints(): Record<string, number> {
  return { ...BASE_POINTS }
}

export function getAspectPoints(): Record<string, number> {
  return { ...ASPECT_POINTS }
}

export function getTypePoints(): Record<string, number> {
  return { ...TYPE_POINTS }
}

export function getEffectScopes(): Array<{ value: string; label: string; pm: number }> {
  return EFFECT_SCOPES.slice()
}

export function getBases(): string[] {
  return baseTable?.table?.map((r: { value: string }) => r.value) ?? []
}

export function getAspects(): string[] {
  return aspectTable?.table?.map((r: { value: string }) => r.value) ?? []
}

export function getTypes(): string[] {
  return typeTable?.table?.map((r: { value: string }) => r.value) ?? []
}
