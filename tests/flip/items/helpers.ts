import { readFileSync } from 'fs'
import path from 'path'
import type { ItemLine, ItemSnapshot } from '@shared/types'
import { parseSnapshot } from '@shared/flip/items/snapshot'
// скрипт CI — тот же разбор, что публикует ветку `prices`
import { buildSnapshot, reduceOverview } from '../../../tools/data/ninja-snapshot.mjs'

export const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'flip', 'items')
/** курс divine в тестах (как у poe.ninja в выборке) */
export const DIVINE = 337.1

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as T
}

/** Снимок лиги из выборки poe.ninja — через reduceOverview CI и parseSnapshot приложения. */
export function sampleSnapshot(at = Date.parse('2026-10-29T19:17:00Z')): ItemSnapshot {
  const raw = fixture<{ types: Record<string, { lines: unknown[] }> }>('ninja-allflame-sample.json')
  const lines = Object.entries(raw.types).flatMap(([type, json]) => reduceOverview(type, json))
  const snap = parseSnapshot(JSON.parse(JSON.stringify(buildSnapshot({ league: 'Allflame', at, lines, divine: DIVINE }))))
  if (!snap) throw new Error('выборка не разобралась')
  return snap
}

export function line(snap: ItemSnapshot, id: string): ItemLine {
  const l = snap.lines.find((x) => x.id === id)
  if (!l) throw new Error(`нет строки ${id}`)
  return l
}
