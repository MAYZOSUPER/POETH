// Типы для тестов (tests/poe2/prices): скрипт CI ninja-snapshot-poe2.mjs — обычный JS для node без сборки.

export interface SnapshotLine2 {
  id: string
  name: string
  kind: string
  value: number
  base?: string
  variant?: string
  corrupted?: true
  listings?: number
  volume?: number
  change?: number
}

export const SNAPSHOT_VERSION: 1
export const MAX_VALUE: number
export const NINJA2_BASE: string
export const USER_AGENT: string
export const EXCHANGE_TYPES: string[]
export const ITEM_TYPES: string[]
export function leagueFile(league: string): string
export function isHardcore(league: string): boolean
export function reduceExchange(kind: string, json: unknown): SnapshotLine2[]
export function reduceItems(kind: string, json: unknown): SnapshotLine2[]
export function reduceCore(json: unknown): { primary: string; rates: Record<string, number> } | null
export function buildSnapshot(args: {
  league: string
  at: number
  core: { primary: string; rates: Record<string, number> }
  lines: SnapshotLine2[]
  etags?: Record<string, string>
}): {
  v: 1
  source: 'poe.ninja'
  league: string
  at: number
  primary: string
  rates: Record<string, number>
  lines: SnapshotLine2[]
  etags?: Record<string, string>
}
