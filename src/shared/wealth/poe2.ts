// «Богатство PoE 2» (S70, чистый модуль; tests/wealth/poe2.test.ts).
//
// У GGG нет API тайника для PoE 2 (poe2-wealth-farm.md §1). Богатство складывается из трёх источников:
//  - ручной ввод: ключевая валюта (div, ex, chaos) и ходовая — список в данных (resources/data/poe2/wealth/
//    currency.json, tools/wealth/poe2-currency.mjs); золото — отдельной строкой, в итог в exalted не входит;
//  - ценные предметы из окна цены PoE 2 (Ctrl+D → «Добавить в богатство») — с ценой, которую показало окно;
//  - снимок особой вкладки тайника с экрана (модуль S68, клавиша игрока): несколько вкладок за «сеанс снимка»,
//    карточка в компаньоне с правкой чисел, «Принять» / «Переснять».
// Источники → TabItems (StashItem с английскими именами, как у API тайника PoE 1) → тот же buildSnapshot, что у PoE 1:
// история, разница и прибыль сессии (qtyProfit) — без переделки. Цены и суммы — в exalted (база PoE 2), курс —
// exalted за divine; в полях снимка они лежат на месте chaos (WealthSummary.base = 'exalted').
// Ручной ввод и снимок вкладок складываются: валюту из снимка вводить вручную не нужно (строка подскажет).

import type {
  Poe2CurrencyRef,
  Poe2ManualRow,
  Poe2ScreenCardTab,
  Poe2ScreenEdit,
  Poe2ScreenLine,
  Poe2ScreenSession,
  Poe2ScreenTab,
  Poe2ScreenTabView,
  Poe2SourceTotal,
  Poe2Sources,
  Poe2Valuable,
  Poe2ValuableInput,
  Poe2ValuableKind,
  Poe2ValuableSource,
  PriceSourceId,
  WealthSnapshot
} from '../types/wealth'
import type { ScreenRead } from '../types/screen'
import { screenTabId, stackItem } from '../screen/wealth'
import { buildSnapshot, type TabItems } from './snapshot'
import type { PriceEntry, PriceIndex } from './prices'
import type { StashItem } from './stash'

/** id «вкладок» источников в снимке (итоги по вкладкам → итоги источников). */
export const MANUAL_TAB = 'poe2:manual'
export const VALUABLES_TAB = 'poe2:valuables'
export const SCREEN_TAB_PREFIX = 'screen:'

/** Старше суток — источник серым. */
export const STALE_MS = 24 * 3_600_000
export const MAX_QTY = 1_000_000
export const MAX_GOLD = 1_000_000_000_000
export const MAX_VALUABLES = 200
/** принятых вкладок снимка всего и вкладок в одном «сеансе» */
export const MAX_SCREEN_TABS = 40
export const MAX_SESSION_TABS = 12
const MAX_NAME = 120
const MAX_LINES = 400

const round2 = (n: number): number => Math.round(n * 100) / 100

// ------------------------------------------------------------------ список валюты

export interface Poe2CurrencyList {
  /** div, ex, chaos */
  main: Poe2CurrencyRef[]
  /** ходовая (по объёму обмена) */
  common: Poe2CurrencyRef[]
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && s.length <= MAX_NAME ? s : null
}

function cleanRefs(v: unknown, max: number): Poe2CurrencyRef[] {
  if (!Array.isArray(v)) return []
  const out: Poe2CurrencyRef[] = []
  for (const r of v as Array<{ name?: unknown; tag?: unknown }>) {
    const name = cleanName(r?.name)
    if (!name || out.some((x) => x.name === name)) continue
    const tag = typeof r.tag === 'string' && /^[a-z0-9-]{1,64}$/.test(r.tag) ? r.tag : undefined
    out.push(tag ? { name, tag } : { name })
    if (out.length >= max) break
  }
  return out
}

/** currency.json (данные — могли прийти обновлением из сети) → список; битый — null. */
export function parsePoe2CurrencyList(json: unknown): Poe2CurrencyList | null {
  const r = json as { version?: unknown; main?: unknown; common?: unknown } | null
  if (!r || typeof r !== 'object' || r.version !== 1) return null
  const main = cleanRefs(r.main, 6)
  if (!main.length) return null
  const common = cleanRefs(r.common, 24).filter((c) => !main.some((m) => m.name === c.name))
  return { main, common }
}

// ------------------------------------------------------------------ источники

export function emptySources(): Poe2Sources {
  return { manual: {}, manualAt: null, gold: 0, goldAt: null, valuables: [], screen: [] }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const time = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n > 0 ? n : null
}

/** Штук: целое 0…MAX_QTY (мусор — 0). */
export function cleanQty(v: unknown, max = MAX_QTY): number {
  const n = num(v)
  return n === null ? 0 : Math.max(0, Math.min(max, Math.round(n)))
}

const KINDS: readonly Poe2ValuableKind[] = ['unique', 'rare', 'magic', 'normal', 'currency', 'gem', 'other']
const VALUABLE_SOURCES: readonly Poe2ValuableSource[] = ['ange', 'trade', 'ninja', 'manual']

/** Ценный предмет из окна цены (IPC — недоверенный ввод) → чистый; не годится — null. */
export function cleanValuableInput(raw: unknown): Poe2ValuableInput | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const name = cleanName(r.name)
  const unit = num(r.unit)
  if (!name || unit === null || !(unit > 0) || unit > 1e9) return null
  const source = VALUABLE_SOURCES.includes(r.source as Poe2ValuableSource) ? (r.source as Poe2ValuableSource) : 'manual'
  const out: Poe2ValuableInput = { name, unit: round2(unit), source, qty: Math.max(1, cleanQty(r.qty ?? 1)) }
  const base = cleanName(r.base)
  if (base && base !== name) out.base = base
  if (KINDS.includes(r.kind as Poe2ValuableKind)) out.kind = r.kind as Poe2ValuableKind
  if (r.low === true) out.low = true
  return out
}

function cleanValuable(raw: unknown): Poe2Valuable | null {
  const r = raw as Record<string, unknown> | null
  const input = cleanValuableInput(r)
  const at = time(r?.at)
  if (!input || !at || typeof r?.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) return null
  return { id: r.id, at, qty: input.qty ?? 1, ...input }
}

function cleanScreenTab(raw: unknown): Poe2ScreenTab | null {
  const r = raw as Record<string, unknown> | null
  const at = time(r?.at)
  if (!r || !at || typeof r.id !== 'string' || !r.id.startsWith(SCREEN_TAB_PREFIX) || r.id.length > 120) return null
  const layout = typeof r.layout === 'string' && r.layout.length <= 60 ? r.layout : null
  const items: Poe2ScreenTab['items'] = []
  for (const it of Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : []) {
    const name = cleanName(it?.name)
    const qty = cleanQty(it?.qty)
    if (name && qty > 0) items.push({ name, qty, sure: it.sure === true })
    if (items.length >= MAX_LINES) break
  }
  return { id: r.id, layout, at, items }
}

/** sources.json (диск) → источники; всё лишнее и битое отбрасывается. */
export function sanitizeSources(raw: unknown): Poe2Sources {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = emptySources()
  if (r.manual && typeof r.manual === 'object') {
    for (const [k, v] of Object.entries(r.manual as Record<string, unknown>)) {
      const name = cleanName(k)
      const qty = cleanQty(v)
      if (name && qty > 0 && Object.keys(s.manual).length < MAX_LINES) s.manual[name] = qty
    }
  }
  s.manualAt = time(r.manualAt)
  s.gold = cleanQty(r.gold, MAX_GOLD)
  s.goldAt = time(r.goldAt)
  for (const v of Array.isArray(r.valuables) ? r.valuables : []) {
    const x = cleanValuable(v)
    if (x && s.valuables.length < MAX_VALUABLES && !s.valuables.some((y) => y.id === x.id)) s.valuables.push(x)
  }
  for (const t of Array.isArray(r.screen) ? r.screen : []) {
    const x = cleanScreenTab(t)
    if (x && s.screen.length < MAX_SCREEN_TABS && !s.screen.some((y) => y.id === x.id)) s.screen.push(x)
  }
  return s
}

/** Ручной ввод: штук валюты name (0 — убрать строку). */
export function setManual(s: Poe2Sources, name: string, qty: unknown, at: number): Poe2Sources {
  const n = cleanName(name)
  if (!n) return s
  const manual = { ...s.manual }
  const q = cleanQty(qty)
  if ((manual[n] ?? 0) === q) return s
  if (q > 0) manual[n] = q
  else delete manual[n]
  return { ...s, manual, manualAt: at }
}

export function setGold(s: Poe2Sources, qty: unknown, at: number): Poe2Sources {
  const q = cleanQty(qty, MAX_GOLD)
  return q === s.gold ? s : { ...s, gold: q, goldAt: at }
}

/** Добавить ценный предмет (новые — сверху); больше MAX_VALUABLES — самые старые уходят. */
export function addValuable(s: Poe2Sources, input: Poe2ValuableInput, id: string, at: number): Poe2Sources {
  const v: Poe2Valuable = { id, at, ...input, qty: input.qty ?? 1 }
  return { ...s, valuables: [v, ...s.valuables].slice(0, MAX_VALUABLES) }
}

export function removeValuable(s: Poe2Sources, id: string): Poe2Sources {
  const valuables = s.valuables.filter((v) => v.id !== id)
  return valuables.length === s.valuables.length ? s : { ...s, valuables }
}

export function removeScreenTab(s: Poe2Sources, id: string): Poe2Sources {
  const screen = s.screen.filter((t) => t.id !== id)
  return screen.length === s.screen.length ? s : { ...s, screen }
}

// ------------------------------------------------------------------ цены

/** Цена штуки PoE 2 в exalted: фид обмена GGG («у Ange», S61) или снимок poe.ninja PoE 2 (S67). */
export interface Poe2Price {
  unit: number
  source: Extract<PriceSourceId, 'ange' | 'ninja'>
  low?: boolean
}

export type Poe2PriceOf = (name: string) => Poe2Price | null

/**
 * Индекс цен для buildSnapshot (kind 'stackable' — валюта, эссенции, руны, фрагменты особых вкладок): цена по имени
 * спрашивается у priceOf лениво и запоминается. size — 0, если цен нет вовсе (строки будут «цены не загружены»).
 */
export function poe2PriceIndex(priceOf: Poe2PriceOf, size: number): PriceIndex {
  const cache = new Map<string, readonly PriceEntry[]>()
  return {
    size,
    get(kind, name) {
      if (kind !== 'stackable' || !size) return []
      let hit = cache.get(name)
      if (!hit) {
        const p = priceOf(name)
        const e: PriceEntry | null = p && p.unit > 0 ? { name, kind, chaos: p.unit, source: p.source } : null
        if (e && p?.low) e.low = true
        hit = e ? [e] : []
        cache.set(name, hit)
      }
      return hit
    }
  }
}

// ------------------------------------------------------------------ снимок

const FRAME: Record<Poe2ValuableKind, number> = { normal: 0, magic: 1, rare: 2, unique: 3, gem: 4, currency: 5, other: 0 }

/** Ценный предмет → StashItem с готовой ценой (своя строка снимка на каждый добавленный предмет). */
export function valuableItem(v: Poe2Valuable): StashItem {
  const kind = v.kind ?? 'other'
  const base = v.base ?? v.name
  const item: StashItem = {
    name: kind === 'unique' ? v.name : '',
    typeLine: kind === 'unique' ? base : v.name,
    baseType: kind === 'unique' ? base : v.name,
    frameType: FRAME[kind],
    qty: v.qty,
    identified: true,
    corrupted: false,
    links: 0,
    fixed: { key: `VALUABLE|${v.id}`, unit: v.unit, source: 'pricecheck' }
  }
  if (v.low) item.fixed!.low = true
  return item
}

/** Источники → «вкладки» снимка: ручной ввод, ценные предметы, принятые вкладки экрана. */
export function poe2Tabs(s: Poe2Sources): TabItems[] {
  const tabs: TabItems[] = []
  const manual = Object.entries(s.manual)
    .filter(([, q]) => q > 0)
    .map(([name, q]) => stackItem(name, q))
  if (manual.length) tabs.push({ id: MANUAL_TAB, name: 'manual', items: manual })
  if (s.valuables.length) tabs.push({ id: VALUABLES_TAB, name: 'valuables', items: s.valuables.map(valuableItem) })
  for (const t of s.screen) {
    const items = t.items.filter((i) => i.qty > 0).map((i) => stackItem(i.name, i.qty))
    if (items.length) tabs.push({ id: t.id, name: t.layout ?? 'screen', items })
  }
  return tabs
}

export interface BuildPoe2SnapshotInput {
  id: string
  at: number
  league: string
  sources: Poe2Sources
  index: PriceIndex
  /** exalted за divine (0 — не известно) */
  exPerDivine: number
  manual?: boolean
}

/** Снимок богатства PoE 2 — тем же buildSnapshot, что у PoE 1 (база — exalted). */
export function buildPoe2Snapshot(input: BuildPoe2SnapshotInput): WealthSnapshot {
  return buildSnapshot({
    id: input.id,
    at: input.at,
    league: input.league,
    tabs: poe2Tabs(input.sources),
    index: input.index,
    divineRate: input.exPerDivine > 0 ? input.exPerDivine : 0,
    manual: input.manual,
    base: 'exalted'
  })
}

// ------------------------------------------------------------------ снимок вкладки: карточка

/** Строку надо проверить: число не прочитано или не уверено, или предмет из нескольких с одним рисунком. */
export function needsCheck(l: Poe2ScreenLine): boolean {
  return !l.edited && (l.qty === null || !l.sure || !!l.alt?.length)
}

function priceLine(l: Poe2ScreenLine, priceOf: Poe2PriceOf): Poe2ScreenLine {
  const p = priceOf(l.name)
  const next: Poe2ScreenLine = { ...l }
  delete next.unit
  delete next.low
  if (p && p.unit > 0) {
    next.unit = round2(p.unit)
    if (p.low) next.low = true
  }
  return next
}

/** Цены строк карточки — заново (цены обновились). */
export function priceCardTab(tab: Poe2ScreenCardTab, priceOf: Poe2PriceOf): Poe2ScreenCardTab {
  return { ...tab, lines: tab.lines.map((l) => priceLine(l, priceOf)) }
}

/**
 * Результат распознавания (S68) → вкладка карточки: только ячейки с предметом; неузнанные — счётчиком. Порядок —
 * по стоимости стопки (число не прочитано — как одна штука), дальше он не меняется: строки не прыгают при правке.
 */
export function screenCardTab(read: ScreenRead, priceOf: Poe2PriceOf): Poe2ScreenCardTab {
  const lines: Poe2ScreenLine[] = []
  let unknown = 0
  read.cells.forEach((c, i) => {
    if (!c.present) return
    if (!c.item) {
      unknown++
      return
    }
    const line: Poe2ScreenLine = {
      key: c.slot !== undefined ? `s${c.slot}` : `i${i}`,
      name: c.item,
      qty: c.count !== null && c.count > 0 ? Math.min(MAX_QTY, c.count) : null,
      sure: c.countSure && c.count !== null
    }
    if (read.tab === null && c.alt?.length) line.alt = c.alt.slice(0, 6)
    lines.push(priceLine(line, priceOf))
  })
  const value = (l: Poe2ScreenLine): number => (l.unit ?? 0) * (l.qty ?? 1)
  lines.sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name))
  return { id: screenTabId(read), layout: read.tab, at: read.at, lines: lines.slice(0, MAX_LINES), unknown }
}

/** Правка строки игроком: число (0 — убрать строку из итога) или выбор предмета из alt. */
export function editCardLine(tab: Poe2ScreenCardTab, key: string, edit: Poe2ScreenEdit, priceOf: Poe2PriceOf): Poe2ScreenCardTab {
  return {
    ...tab,
    lines: tab.lines.map((l) => {
      if (l.key !== key) return l
      let next: Poe2ScreenLine = { ...l, edited: true }
      if (edit.qty !== undefined) {
        next.qty = cleanQty(edit.qty)
        next.sure = true
      }
      if (edit.name !== undefined && edit.name !== l.name && (l.alt ?? []).includes(edit.name)) {
        next.alt = [l.name, ...(l.alt ?? []).filter((n) => n !== edit.name)]
        next.name = edit.name
        next = priceLine(next, priceOf)
      }
      return next
    })
  }
}

export interface CardTotal {
  /** exalted по строкам с ценой и числом */
  ex: number
  /** строк в итоге */
  counted: number
  /** строк без цены */
  unpriced: number
  /** строк без числа (в итог не войдут) */
  uncounted: number
  /** строк «проверьте» */
  check: number
}

export function cardTotal(tab: Poe2ScreenCardTab): CardTotal {
  const t: CardTotal = { ex: 0, counted: 0, unpriced: 0, uncounted: 0, check: 0 }
  for (const l of tab.lines) {
    if (needsCheck(l)) t.check++
    if (l.qty === null) {
      t.uncounted++
      continue
    }
    if (!l.qty) continue
    if (l.unit === undefined) {
      t.unpriced++
      continue
    }
    t.ex += l.unit * l.qty
    t.counted++
  }
  t.ex = round2(t.ex)
  return t
}

/** Новая прочитанная вкладка — в «сеанс снимка» (та же вкладка ещё раз — заменяет прежнюю). */
export function addToSession(session: Poe2ScreenSession | null, tab: Poe2ScreenCardTab, now: number): Poe2ScreenSession {
  const tabs = (session?.tabs ?? []).filter((t) => t.id !== tab.id)
  tabs.push(tab)
  return { startedAt: session?.startedAt ?? now, tabs: tabs.slice(-MAX_SESSION_TABS) }
}

/** «Переснять»: убрать вкладку из сеанса (без id — весь сеанс); пустой сеанс — null. */
export function dropFromSession(session: Poe2ScreenSession | null, tabId?: string): Poe2ScreenSession | null {
  if (!session || tabId === undefined) return null
  const tabs = session.tabs.filter((t) => t.id !== tabId)
  return tabs.length ? { ...session, tabs } : null
}

/**
 * «Принять»: вкладки сеанса — в источник «Снимок вкладок» (та же вкладка — заменяет принятую раньше, остальные
 * остаются со своим временем). Строки без числа не входят.
 */
export function acceptSession(s: Poe2Sources, session: Poe2ScreenSession, at: number): Poe2Sources {
  const accepted: Poe2ScreenTab[] = session.tabs.map((t) => {
    const byName = new Map<string, { qty: number; sure: boolean }>()
    for (const l of t.lines) {
      if (!l.qty) continue
      const prev = byName.get(l.name)
      const sure = l.sure || !!l.edited
      byName.set(l.name, prev ? { qty: prev.qty + l.qty, sure: prev.sure && sure } : { qty: l.qty, sure })
    }
    return { id: t.id, layout: t.layout, at, items: [...byName].map(([name, v]) => ({ name, qty: Math.min(MAX_QTY, v.qty), sure: v.sure })) }
  })
  const ids = new Set(accepted.map((t) => t.id))
  const screen = [...s.screen.filter((t) => !ids.has(t.id)), ...accepted].slice(-MAX_SCREEN_TABS)
  return { ...s, screen }
}

// ------------------------------------------------------------------ виды для вкладки

const stale = (at: number | null, now: number): boolean => at !== null && now - at > STALE_MS
const maxAt = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null)

export interface Poe2Totals {
  screen: Poe2SourceTotal & { tabs: number }
  manual: Poe2SourceTotal
  valuables: Poe2SourceTotal & { count: number }
  screenTabs: Poe2ScreenTabView[]
  /** в снимке есть числа вкладок, прочитанные неуверенно */
  approx: boolean
}

/** Итоги источников по снимку (итоги «вкладок» снимка) и давность. */
export function poe2Totals(s: Poe2Sources, snap: WealthSnapshot, now: number): Poe2Totals {
  const byId = new Map(snap.summary.tabs.map((t) => [t.id, t]))
  const total = (id: string): { ex: number; unpriced: number } => {
    const t = byId.get(id)
    return { ex: t?.chaos ?? 0, unpriced: t?.unpriced ?? 0 }
  }
  const screenTabs: Poe2ScreenTabView[] = s.screen.map((t) => ({
    id: t.id,
    layout: t.layout,
    at: t.at,
    items: t.items.reduce((a, i) => a + i.qty, 0),
    ex: total(t.id).ex,
    stale: stale(t.at, now)
  }))
  const screenAt = maxAt(s.screen.map((t) => t.at))
  const valuablesAt = maxAt(s.valuables.map((v) => v.at))
  const sum = (xs: number[]): number => round2(xs.reduce((a, b) => a + b, 0))
  return {
    screen: {
      ex: sum(screenTabs.map((t) => t.ex)),
      at: screenAt,
      stale: stale(screenAt, now),
      unpriced: s.screen.reduce((a, t) => a + total(t.id).unpriced, 0),
      tabs: s.screen.length
    },
    manual: { ...total(MANUAL_TAB), at: Object.keys(s.manual).length ? s.manualAt : null, stale: stale(s.manualAt, now) },
    valuables: { ...total(VALUABLES_TAB), at: valuablesAt, stale: stale(valuablesAt, now), count: s.valuables.length },
    screenTabs,
    approx: s.screen.some((t) => t.items.some((i) => !i.sure))
  }
}

/** Строки ручного ввода: ключевая валюта, ходовая, и введённое раньше, чего в списке больше нет. */
export function manualRows(list: Poe2CurrencyList, s: Poe2Sources, index: PriceIndex): Poe2ManualRow[] {
  const inScreen = new Map<string, number>()
  for (const t of s.screen) for (const i of t.items) inScreen.set(i.name, (inScreen.get(i.name) ?? 0) + i.qty)
  const row = (ref: Poe2CurrencyRef, group: Poe2ManualRow['group']): Poe2ManualRow => {
    const r: Poe2ManualRow = { name: ref.name, group, qty: s.manual[ref.name] ?? 0, inScreen: inScreen.get(ref.name) ?? 0 }
    if (ref.tag) r.tag = ref.tag
    const p = index.get('stackable', ref.name)[0]
    if (p) {
      r.unit = round2(p.chaos)
      r.source = p.source
      if (p.low) r.low = true
    }
    return r
  }
  const listed = new Set([...list.main, ...list.common].map((r) => r.name))
  return [
    ...list.main.map((r) => row(r, 'main')),
    ...list.common.map((r) => row(r, 'common')),
    ...Object.keys(s.manual)
      .filter((n) => !listed.has(n))
      .sort()
      .map((name) => row({ name }, 'extra'))
  ]
}
