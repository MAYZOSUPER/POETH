// Сборка снимка стэша и разница двух снимков (чистый модуль; tests/wealth/snapshot.test.ts).

import type {
  WealthDiff,
  WealthDiffLine,
  WealthLine,
  WealthSnapshot,
  WealthSummary,
  WealthTabTotal
} from '../types/wealth'
import type { StashItem } from './stash'
import { matchPrice, type PriceIndex } from './prices'

export interface TabItems {
  id: string
  name: string
  items: readonly StashItem[]
}

/** Ключ строки: имя + свойства, от которых зависит цена. */
export function lineKey(ns: string, name: string, it: StashItem): string {
  const parts = [ns, name]
  if (ns === 'UNIQUE' && it.links >= 5) parts.push(`${it.links}L`)
  if (ns === 'GEM') parts.push(`${it.gemLevel ?? 1}/${it.gemQuality ?? 0}`)
  if (it.mapTier !== undefined) parts.push(`T${it.mapTier}`)
  if ((ns === 'GEM' || ns === 'UNIQUE') && it.corrupted) parts.push('c')
  return parts.join('|')
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export interface BuildSnapshotInput {
  id: string
  at: number
  league: string
  tabs: readonly TabItems[]
  index: PriceIndex
  divineRate: number
  manual?: boolean
}

/** Предметы выбранных вкладок + цены → снимок (строки сложены по ключу, итоги по вкладкам). */
export function buildSnapshot(input: BuildSnapshotInput): WealthSnapshot {
  const lines = new Map<string, WealthLine>()
  const tabs: WealthTabTotal[] = []
  let chaos = 0
  for (const tab of input.tabs) {
    const total: WealthTabTotal = { id: tab.id, name: tab.name, chaos: 0, items: 0, unpriced: 0 }
    for (const it of tab.items) {
      const m = matchPrice(it, input.index)
      const key = lineKey(m.ns, m.name, it)
      let line = lines.get(key)
      if (!line) {
        line = { key, name: m.name, ns: m.ns, qty: 0, total: 0 }
        if (m.ns === 'UNIQUE' && it.links >= 5) line.links = it.links
        if (m.ns === 'GEM') {
          line.gemLevel = it.gemLevel ?? 1
          line.gemQuality = it.gemQuality ?? 0
        }
        if (it.mapTier !== undefined) line.mapTier = it.mapTier
        if ((m.ns === 'GEM' || m.ns === 'UNIQUE') && it.corrupted) line.corrupted = true
        if (m.unit !== undefined) {
          line.unit = m.unit
          line.source = m.source
          if (m.low) line.low = true
        } else line.reason = m.reason
        lines.set(key, line)
      }
      line.qty += it.qty
      total.items += it.qty
      if (line.unit !== undefined) {
        const v = line.unit * it.qty
        line.total += v
        total.chaos += v
      } else total.unpriced += it.qty
    }
    total.chaos = round2(total.chaos)
    chaos += total.chaos
    tabs.push(total)
  }
  const list = [...lines.values()]
  for (const l of list) {
    l.total = round2(l.total)
    if (l.unit !== undefined) l.unit = round2(l.unit)
  }
  list.sort((a, b) => b.total - a.total || b.qty - a.qty || a.name.localeCompare(b.name))
  const summary: WealthSummary = {
    id: input.id,
    at: input.at,
    league: input.league,
    chaos: round2(chaos),
    divineRate: round2(input.divineRate),
    tabs,
    priced: list.filter((l) => l.unit !== undefined).length,
    unpriced: list.filter((l) => l.unit === undefined).length
  }
  if (input.manual) summary.manual = true
  return { summary, lines: list }
}

/**
 * Прибыль между снимками без дрейфа цен: Σ (штук после − штук до) × цена штуки (из снимка «после»,
 * для пропавшего — из «до»). Предметы без цены не входят; low — часть суммы по ценам «мало сделок».
 */
export function qtyProfit(from: WealthSnapshot, to: WealthSnapshot): { chaos: number; low: boolean } {
  const before = new Map(from.lines.map((l) => [l.key, l]))
  const after = new Map(to.lines.map((l) => [l.key, l]))
  let chaos = 0
  let low = false
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key)
    const b = after.get(key)
    const dq = (b?.qty ?? 0) - (a?.qty ?? 0)
    if (!dq) continue
    const unit = b?.unit ?? a?.unit
    if (unit === undefined) continue
    chaos += dq * unit
    if ((b ?? a)?.low) low = true
  }
  return { chaos: round2(chaos), low }
}

/**
 * Что изменилось между снимками: по строкам — разница штук и стоимости (по ценам снимка
 * «после»; пропавшее — по ценам снимка «до»). Сортировка — по модулю стоимости.
 */
export function diffSnapshots(from: WealthSnapshot, to: WealthSnapshot, limit = 200): WealthDiff {
  const before = new Map(from.lines.map((l) => [l.key, l]))
  const after = new Map(to.lines.map((l) => [l.key, l]))
  const keys = new Set([...before.keys(), ...after.keys()])
  const lines: WealthDiffLine[] = []
  for (const key of keys) {
    const a = before.get(key)
    const b = after.get(key)
    const qtyDelta = (b?.qty ?? 0) - (a?.qty ?? 0)
    const chaosDelta = round2((b?.total ?? 0) - (a?.total ?? 0))
    if (qtyDelta === 0 && Math.abs(chaosDelta) < 0.01) continue
    const src = (b ?? a) as WealthLine
    const line: WealthDiffLine = { key, name: src.name, ns: src.ns, qtyDelta, chaosDelta }
    for (const f of ['links', 'gemLevel', 'gemQuality', 'mapTier', 'corrupted'] as const) {
      if (src[f] !== undefined) (line as unknown as Record<string, unknown>)[f] = src[f]
    }
    lines.push(line)
  }
  lines.sort((x, y) => Math.abs(y.chaosDelta) - Math.abs(x.chaosDelta) || Math.abs(y.qtyDelta) - Math.abs(x.qtyDelta))
  return {
    fromId: from.summary.id,
    toId: to.summary.id,
    fromAt: from.summary.at,
    toAt: to.summary.at,
    chaosDelta: round2(to.summary.chaos - from.summary.chaos),
    lines: lines.slice(0, limit)
  }
}
