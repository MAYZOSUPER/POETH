// Разбор ответа legacy-эндпоинта стэша (чистый модуль; тесты — tests/wealth/stash.test.ts).
//
// GET https://www.pathofexile.com/character-window/get-stash-items
//     ?accountName=<Name#1234>&realm=pc&league=<лига>&tabs=<0|1>&tabIndex=<n>
// → { numTabs, tabs?: [{ n, i, id, type, colour:{r,g,b} }], items: [...] }
// Запрашиваем у www — имена и свойства предметов на английском (для сопоставления цен).

export interface RawStashTab {
  n?: unknown
  i?: unknown
  id?: unknown
  type?: unknown
  colour?: { r?: unknown; g?: unknown; b?: unknown }
  hidden?: unknown
}

export interface RawProperty {
  name?: unknown
  values?: unknown
  type?: unknown
}

export interface RawSocket {
  group?: unknown
}

export interface RawStashItem {
  name?: unknown
  typeLine?: unknown
  baseType?: unknown
  frameType?: unknown
  stackSize?: unknown
  ilvl?: unknown
  identified?: unknown
  corrupted?: unknown
  sockets?: unknown
  socketedItems?: unknown
  properties?: unknown
}

export interface RawStashResponse {
  numTabs?: unknown
  tabs?: unknown
  items?: unknown
}

export interface StashTabInfo {
  id: string
  index: number
  name: string
  type: string
  colour?: string
  unsupported?: boolean
}

/** Предмет стэша в нормализованном виде (английские имена). */
export interface StashItem {
  name: string
  typeLine: string
  baseType: string
  frameType: number
  qty: number
  ilvl?: number
  identified: boolean
  corrupted: boolean
  /** самая большая группа связанных гнёзд */
  links: number
  gemLevel?: number
  gemQuality?: number
  mapTier?: number
}

export interface ParsedStash {
  numTabs: number
  /** есть только при tabs=1 */
  tabs?: StashTabInfo[]
  items: StashItem[]
}

/** Типы вкладок, содержимое которых legacy-эндпоинт не отдаёт (или это не вкладка). */
export const UNSUPPORTED_TAB_TYPES: ReadonlySet<string> = new Set(['MapStash', 'UniqueStash', 'Folder'])

/** Убрать разметку сайта `<<set:MS>><<set:M>><<set:S>>` из имён. */
export function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/<<[^<>]*>>/g, '').trim() : ''
}

function int(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/** Первое число из значения свойства: '21 (Max)' → 21, '+20%' → 20. */
function propNumber(values: unknown): number | undefined {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return undefined
  const s = values[0][0]
  if (typeof s !== 'string') return undefined
  const m = /-?\d+/.exec(s)
  return m ? parseInt(m[0], 10) : undefined
}

function findProp(props: unknown, names: string[]): number | undefined {
  if (!Array.isArray(props)) return undefined
  for (const p of props as RawProperty[]) {
    if (typeof p?.name === 'string' && names.includes(cleanName(p.name))) return propNumber(p.values)
  }
  return undefined
}

/** Самая большая группа связанных гнёзд. */
export function maxLinks(sockets: unknown): number {
  if (!Array.isArray(sockets) || !sockets.length) return 0
  const groups = new Map<number, number>()
  for (const s of sockets as RawSocket[]) {
    const g = int(s?.group)
    if (g === undefined) continue
    groups.set(g, (groups.get(g) ?? 0) + 1)
  }
  let max = 0
  for (const n of groups.values()) max = Math.max(max, n)
  return max
}

/** Предмет стэша → нормализованный; null — мусор без имени. */
export function parseStashItem(raw: RawStashItem): StashItem | null {
  if (!raw || typeof raw !== 'object') return null
  const typeLine = cleanName(raw.typeLine)
  const name = cleanName(raw.name)
  const baseType = cleanName(raw.baseType) || typeLine
  if (!typeLine && !name) return null
  const frameType = int(raw.frameType) ?? 0
  const stack = int(raw.stackSize)
  const item: StashItem = {
    name,
    typeLine,
    baseType,
    frameType,
    qty: stack && stack > 0 ? stack : 1,
    identified: raw.identified !== false,
    corrupted: raw.corrupted === true,
    links: maxLinks(raw.sockets)
  }
  const ilvl = int(raw.ilvl)
  if (ilvl) item.ilvl = ilvl
  if (frameType === 4) {
    const level = findProp(raw.properties, ['Level'])
    if (level !== undefined) item.gemLevel = level
    item.gemQuality = findProp(raw.properties, ['Quality']) ?? 0
  }
  const tier = findProp(raw.properties, ['Map Tier'])
  if (tier !== undefined) item.mapTier = tier
  return item
}

function colourOf(c: RawStashTab['colour']): string | undefined {
  if (!c || typeof c !== 'object') return undefined
  const r = int(c.r)
  const g = int(c.g)
  const b = int(c.b)
  if (r === undefined || g === undefined || b === undefined) return undefined
  const ok = (v: number): boolean => v >= 0 && v <= 255
  return ok(r) && ok(g) && ok(b) ? `${r},${g},${b}` : undefined
}

export function parseStashTab(raw: RawStashTab): StashTabInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const index = int(raw.i)
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (index === undefined || index < 0 || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const type = typeof raw.type === 'string' ? raw.type : 'NormalStash'
  const tab: StashTabInfo = {
    id,
    index,
    name: cleanName(raw.n).slice(0, 64) || `#${index + 1}`,
    type
  }
  const colour = colourOf(raw.colour)
  if (colour) tab.colour = colour
  if (UNSUPPORTED_TAB_TYPES.has(type)) tab.unsupported = true
  return tab
}

/** Ответ эндпоинта → вкладки (если были запрошены) и предметы (вместе с вставленными в гнёзда камнями). */
export function parseStashResponse(json: unknown): ParsedStash | null {
  if (!json || typeof json !== 'object') return null
  const r = json as RawStashResponse
  if (!Array.isArray(r.items)) return null
  const items: StashItem[] = []
  for (const raw of r.items as RawStashItem[]) {
    const it = parseStashItem(raw)
    if (it) items.push(it)
    // камни в гнёздах предметов — отдельные ценности (6L с камнями 21/20 и т.п.)
    if (Array.isArray(raw?.socketedItems)) {
      for (const s of raw.socketedItems as RawStashItem[]) {
        const gem = parseStashItem(s)
        if (gem) items.push(gem)
      }
    }
  }
  const out: ParsedStash = { numTabs: int(r.numTabs) ?? 0, items }
  if (Array.isArray(r.tabs)) {
    const tabs: StashTabInfo[] = []
    for (const t of r.tabs as RawStashTab[]) {
      if ((t as RawStashTab)?.hidden === true) continue
      const tab = parseStashTab(t)
      if (tab) tabs.push(tab)
    }
    out.tabs = tabs.sort((a, b) => a.index - b.index)
  }
  return out
}
