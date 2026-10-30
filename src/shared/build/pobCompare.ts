// «Точный расчёт (PoB)» (S44; чистый модуль: main src/main/pob/compare.ts, tests/build/pobCompare.test.ts).
// Проверка запроса окна цены (недоверенные данные: текст вещей, слоты) и вердикт из статов движка: DPS ±%, EHP ±%,
// жизнь и ES, сопротивления с капом и его потерей, нехватка атрибутов. «Нельзя надеть» по уровню — в ответе целиком.

import { ENGINE_MAX_ITEM, ENGINE_MAX_OPTIONS, isEngineSlot, type EngineSlot, type EngineStats } from '../pob/engineProtocol'
import type { EquipAttribute, EquipElement, EquipEntry } from '../types/equip'
import type { PobAttrRow, PobDelta, PobOptionResult, PobResRow } from '../types/pobCompare'

export interface CleanPobRequest {
  item: string
  options: EngineSlot[][]
  /** надетые вещи с текстом — только в слотах, где есть запомненная вещь */
  worn: Partial<Record<EngineSlot, string>>
}

const WORN_MAX = 10

/** Текст вещи: строка ≤ 16 КБ, переводы строк \n, без NUL и управляющих (кроме \t), не пустая. */
export function cleanItemText(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > ENGINE_MAX_ITEM) return null
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()
  return s && s.length <= ENGINE_MAX_ITEM ? s : null
}

/** Запрос окна → проверенный запрос; лишнее отбрасывается, неверное — null. */
export function cleanPobRequest(v: unknown, remembered: readonly EquipEntry[]): CleanPobRequest | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const item = cleanItemText(r.item)
  if (!item) return null
  if (!Array.isArray(r.options) || !r.options.length || r.options.length > ENGINE_MAX_OPTIONS) return null
  const options: EngineSlot[][] = []
  for (const o of r.options) {
    if (!Array.isArray(o) || !o.length || o.length > 2 || !o.every(isEngineSlot)) return null
    options.push([...new Set(o as EngineSlot[])])
  }
  const has = new Set(remembered.map((e) => e.slot))
  const worn: CleanPobRequest['worn'] = {}
  if (Array.isArray(r.worn)) {
    for (const w of r.worn.slice(0, WORN_MAX)) {
      if (!w || typeof w !== 'object') continue
      const { slot, item: text } = w as Record<string, unknown>
      const clean = cleanItemText(text)
      if (isEngineSlot(slot) && has.has(slot) && clean) worn[slot] = clean
    }
  }
  return { item, options, worn }
}

// ---------------------------------------------------------------------------- вердикт

const EL: Record<EquipElement, 'Fire' | 'Cold' | 'Lightning' | 'Chaos'> = { fire: 'Fire', cold: 'Cold', lightning: 'Lightning', chaos: 'Chaos' }
const ATTR: Record<EquipAttribute, 'Str' | 'Dex' | 'Int'> = { str: 'Str', dex: 'Dex', int: 'Int' }
const RES_CAP = 75

export function delta(before: number | undefined, after: number | undefined): PobDelta | undefined {
  if (before === undefined || after === undefined) return undefined
  const pct = before !== 0 ? Math.round(((after - before) / Math.abs(before)) * 1000) / 10 : null
  return { before, after, pct }
}

/** Чей урон сравнивать: весь билд (Full DPS — несколько навыков), главный навык, приспешники. */
export function dpsOf(base: EngineStats, next: EngineStats): { kind: PobOptionResult['dpsKind']; d: PobDelta } | null {
  const pick = (k: keyof EngineStats): PobDelta | undefined => {
    const b = base[k]
    return b !== undefined && b > 0 ? delta(b, next[k] ?? 0) : undefined
  }
  const full = pick('FullDPS')
  if (full) return { kind: 'full', d: full }
  const combined = pick('CombinedDPS') ?? pick('TotalDPS')
  if (combined) return { kind: 'combined', d: combined }
  const minion = pick('MinionCombinedDPS') ?? pick('MinionTotalDPS')
  return minion ? { kind: 'minion', d: minion } : null
}

function resRows(base: EngineStats, next: EngineStats): PobResRow[] {
  const rows: PobResRow[] = []
  for (const el of ['fire', 'cold', 'lightning', 'chaos'] as const) {
    const k = EL[el]
    const before = base[`${k}Resist` as const]
    const after = next[`${k}Resist` as const]
    if (before === undefined || after === undefined) continue
    const overB = base[`${k}ResistOverCap` as const] ?? 0
    const overA = next[`${k}ResistOverCap` as const] ?? 0
    if (before === after && overB === overA) continue
    const cap = next[`${k}ResistMax` as const] ?? base[`${k}ResistMax` as const] ?? RES_CAP
    rows.push({ el, before, after, cap, lost: before >= cap && after < cap, reach: before < cap && after >= cap, below: after < cap })
  }
  return rows
}

function shortAttrs(base: EngineStats, next: EngineStats): PobAttrRow[] {
  const out: PobAttrRow[] = []
  for (const a of ['str', 'dex', 'int'] as const) {
    const have = next[ATTR[a]]
    const need = next[`Req${ATTR[a]}` as const]
    if (have === undefined || need === undefined || need <= have) continue
    // нехватка была и раньше и не выросла — не из-за этой вещи
    const haveB = base[ATTR[a]] ?? 0
    const needB = base[`Req${ATTR[a]}` as const] ?? 0
    if (needB > haveB && need - have <= needB - haveB) continue
    out.push({ a, have, need })
  }
  return out
}

/** Результат одного варианта слота. */
export function pobOption(base: EngineStats, next: EngineStats | null, against: PobOptionResult['against']): PobOptionResult {
  if (!next) return { ok: false, error: 'slot', res: [], short: [], against }
  const dps = dpsOf(base, next)
  const life = delta(base.Life, next.Life)
  const es = delta(base.EnergyShield, next.EnergyShield)
  return {
    ok: true,
    dpsKind: dps?.kind,
    dps: dps?.d,
    ehp: delta(base.TotalEHP, next.TotalEHP),
    life: life && life.before !== life.after ? life : undefined,
    es: es && es.before !== es.after && (es.before > 0 || es.after > 0) ? es : undefined,
    res: resRows(base, next),
    short: shortAttrs(base, next),
    against
  }
}

/** Знак вердикта PoB для точки у варианта: лучше / хуже / по-разному. */
export function pobSign(o: PobOptionResult): 'better' | 'worse' | 'mixed' | 'same' {
  if (!o.ok) return 'worse'
  const noise = (d: PobDelta | undefined): number => (d && d.pct !== null && Math.abs(d.pct) >= 1 ? Math.sign(d.pct) : 0)
  const bad = o.short.length > 0 || o.res.some((r) => r.lost)
  const signs = [noise(o.dps), noise(o.ehp)]
  const up = signs.some((s) => s > 0) || o.res.some((r) => r.reach)
  const down = bad || signs.some((s) => s < 0)
  return up && down ? 'mixed' : up ? 'better' : down ? 'worse' : 'same'
}
