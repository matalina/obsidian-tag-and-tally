import { DiceRoll } from '@dice-roller/rpg-dice-roller'

export interface RandomTableState {
  [name: string]: RandomTable
}

export interface TableResult {
  roll: DiceRoll
  result: string
  keywords?: string[]
  actions?: string[]
}

export interface RandomTable {
  name: string
  formula: string
  table: TableOption[]
}

export interface TableReference {
  table: string
}

export interface TableOption {
  min: number | null
  max: number | null
  value: string | TableReference
}
