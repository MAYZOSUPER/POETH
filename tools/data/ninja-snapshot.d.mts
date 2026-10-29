// Типы для тестов (tests/flip/items): скрипт CI ninja-snapshot.mjs — обычный JS для node без сборки.

export interface SnapshotLine {
  id: string
  name: string
  base: string
  type: string
  cls: number
  chaos: number
  count: number
  listings: number
  variant?: string
  links?: 5 | 6
  itemType?: string
  corrupted?: true
  implicits?: number
  trade?: Array<{ id: string; min?: number; max?: number }>
  change?: number
  spark?: Array<number | null>
}

export const SNAPSHOT_VERSION: 1
export const NINJA_BASE: string
export const USER_AGENT: string
export const UNIQUE_TYPES: string[]
export function leagueFile(league: string): string
export function reduceLine(type: string, line: unknown): SnapshotLine | null
export function reduceOverview(type: string, json: unknown): SnapshotLine[]
export function divineRateOf(rawLines: unknown[]): number | undefined
export function buildSnapshot(args: {
  league: string
  at: number
  lines: SnapshotLine[]
  divine?: number
  etags?: Record<string, string>
}): { v: 1; source: 'poe.ninja'; league: string; at: number; lines: SnapshotLine[]; divine?: number; etags?: Record<string, string> }
