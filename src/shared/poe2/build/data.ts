// Данные «Билда» PoE 2 (S66): дерево (hash PoB2 → строковый id игры), камни, уровни актов. Файлы —
// resources/data/poe2/build/{tree,gems}.json (генератор tools/build-data/poe2/*.mjs), приходят и через канал
// обновления данных (userData/data/poe2 главнее встроенных). Загрузчики проверяют формат: данные с диска и из
// сети — недоверенные. Чистый модуль; tests/build2/data.test.ts.

/** Пути внутри данных игры (resources/data/poe2, userData/data/poe2). */
export const POE2_TREE_FILE = 'build/tree.json'
export const POE2_GEMS_FILE = 'build/gems.json'
/** Версии форматов, которые понимает приложение (новее — ждём обновления приложения). */
export const POE2_TREE_FORMAT = 1
export const POE2_GEMS_FORMAT = 1

/** Флаги ноды в tree.json (tools/build-data/poe2/tree.mjs, F). */
export const NODE_FLAG = {
  notable: 1,
  keystone: 2,
  jewel: 4,
  classStart: 8,
  ascStart: 16,
  attribute: 32,
  choice: 64,
  mastery: 128
} as const

export interface Poe2TreeNode {
  hash: number
  /** id из таблицы PassiveSkills — его ждёт игра в `.build` («melee17») */
  id: string
  /** имя EN — только у нотаблов, кейстоунов, гнёзд и выборов восхождения; у прочих '' */
  name: string
  flags: number
  /** id восхождения (`Huntress1`); null — основное дерево */
  ascendancy: string | null
  /** соседи (в обе стороны) */
  near: number[]
}

export interface Poe2Ascendancy {
  /** `Huntress1` — как `ascendancy` в `.build` */
  id: string
  en: string
  /** '' — RU-имени нет в данных */
  ru: string
}

export interface Poe2Class {
  /** индекс = classId PoB2 */
  index: number
  name: string
  ascendancies: Poe2Ascendancy[]
}

export interface Poe2ActLevels {
  act: number
  from: number
  to: number
}

export interface Poe2TreeData {
  version: number
  meta: { tree: string; sources: string[] }
  classes: Poe2Class[]
  /** индекс класса → стартовая нода (у PoE 2 одна нода на два класса) */
  starts: Map<number, number>
  nodes: Map<number, Poe2TreeNode>
  /** уровни актов кампании (из областей игры) */
  acts: Poe2ActLevels[]
  /** уровни интерлюдий; null — нет в данных */
  interlude: { from: number; to: number } | null
  /** уровень первых карт (путевой камень T1) */
  maps: number
}

export type Poe2GemKind = 'skill' | 'support' | 'meta'

export interface Poe2Gem {
  /** id предмета BaseItemTypes (`Metadata/Items/Gems/SkillGemEarthquake`) — как в `.build` */
  id: string
  en: string
  /** '' — RU-имени нет в данных EE2 */
  ru: string
  kind: Poe2GemKind
}

export interface Poe2GemData {
  version: number
  meta: { repoe?: string; sources: string[] }
  gems: Map<string, Poe2Gem>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => Number.isInteger(v)
const ID_RE = /^[A-Za-z0-9_]{1,80}$/
const GEM_ID_RE = /^Metadata\/Items\/Gems?\/[A-Za-z0-9_]{1,100}$/

function meta(v: unknown): { tree: string; sources: string[] } {
  const m = isObj(v) ? v : {}
  return { tree: isStr(m.tree) ? m.tree : '', sources: Array.isArray(m.sources) ? m.sources.filter(isStr) : [] }
}

/** JSON tree.json → данные; null — не наш формат или формат новее приложения. */
export function parsePoe2Tree(raw: unknown): Poe2TreeData | null {
  if (!isObj(raw) || raw.v !== POE2_TREE_FORMAT || !Array.isArray(raw.nodes) || !Array.isArray(raw.classes)) return null
  const nodes = new Map<number, Poe2TreeNode>()
  for (const n of raw.nodes as unknown[]) {
    if (!Array.isArray(n) || !isInt(n[0]) || !isStr(n[1]) || !ID_RE.test(n[1]) || !isStr(n[2]) || !isInt(n[3])) continue
    const asc = isStr(n[4]) && ID_RE.test(n[4]) ? n[4] : null
    const near = Array.isArray(n[5]) ? (n[5] as unknown[]).filter(isInt) : []
    nodes.set(n[0], { hash: n[0], id: n[1], name: n[2].slice(0, 100), flags: n[3], ascendancy: asc, near: [...near] })
  }
  // соседи — в обе стороны (в файле ребро хранится у ноды с меньшим hash)
  for (const n of [...nodes.values()]) {
    for (const h of n.near) {
      const m = nodes.get(h)
      if (m && !m.near.includes(n.hash)) m.near.push(n.hash)
    }
  }
  const classes: Poe2Class[] = []
  ;(raw.classes as unknown[]).forEach((c, index) => {
    if (!Array.isArray(c) || !isStr(c[0])) return
    const ascendancies: Poe2Ascendancy[] = []
    for (const a of Array.isArray(c[1]) ? (c[1] as unknown[]) : []) {
      if (Array.isArray(a) && isStr(a[0]) && ID_RE.test(a[0])) ascendancies.push({ id: a[0], en: isStr(a[1]) ? a[1] : '', ru: isStr(a[2]) ? a[2] : '' })
    }
    classes.push({ index, name: c[0], ascendancies })
  })
  const starts = new Map<number, number>()
  for (const s of Array.isArray(raw.starts) ? (raw.starts as unknown[]) : []) {
    if (Array.isArray(s) && isInt(s[0]) && isInt(s[1]) && nodes.has(s[1])) starts.set(s[0], s[1])
  }
  const acts: Poe2ActLevels[] = []
  for (const a of Array.isArray(raw.acts) ? (raw.acts as unknown[]) : []) {
    if (Array.isArray(a) && isInt(a[0]) && isInt(a[1]) && isInt(a[2]) && a[1] >= 1 && a[2] >= a[1] && a[2] <= 100) {
      acts.push({ act: a[0], from: a[1], to: a[2] })
    }
  }
  acts.sort((a, b) => a.act - b.act)
  const il = raw.interlude
  const interlude = Array.isArray(il) && isInt(il[0]) && isInt(il[1]) && il[0] >= 1 && il[1] >= il[0] && il[1] <= 100 ? { from: il[0], to: il[1] } : null
  const maps = isInt(raw.maps) && raw.maps >= 1 && raw.maps <= 100 ? raw.maps : 65
  if (!nodes.size) return null
  return { version: raw.v as number, meta: meta(raw.meta), classes, starts, nodes, acts, interlude, maps }
}

const KINDS: Record<string, Poe2GemKind> = { s: 'skill', p: 'support', m: 'meta' }

/** JSON gems.json → данные; null — не наш формат или формат новее приложения. */
export function parsePoe2Gems(raw: unknown): Poe2GemData | null {
  if (!isObj(raw) || raw.v !== POE2_GEMS_FORMAT || !isObj(raw.gems)) return null
  const gems = new Map<string, Poe2Gem>()
  for (const [id, g] of Object.entries(raw.gems)) {
    if (!GEM_ID_RE.test(id) || !Array.isArray(g) || !isStr(g[0]) || !isStr(g[1]) || !isStr(g[2]) || !KINDS[g[2]]) continue
    gems.set(id, { id, en: g[0].slice(0, 100), ru: g[1].slice(0, 100), kind: KINDS[g[2]] })
  }
  if (!gems.size) return null
  const m = isObj(raw.meta) ? raw.meta : {}
  return { version: raw.v as number, meta: { repoe: isStr(m.repoe) ? m.repoe : undefined, sources: meta(m).sources }, gems }
}

/**
 * Камень по id из PoB2. PoB2 и игра пишут один id предмета, но в данных игры у части камней путь `Gem/`, у части
 * `Gems/` — если точного нет, пробуем второй вариант.
 */
export function findGem(data: Poe2GemData, gemId: string | null | undefined): Poe2Gem | null {
  if (!gemId) return null
  const g = data.gems.get(gemId)
  if (g) return g
  const alt = gemId.startsWith('Metadata/Items/Gems/') ? gemId.replace('/Gems/', '/Gem/') : gemId.replace('/Gem/', '/Gems/')
  return data.gems.get(alt) ?? null
}

/** Имя камня на языке (RU нет — EN). */
export function gemName(g: Poe2Gem, lang: 'ru' | 'en'): string {
  return lang === 'ru' && g.ru ? g.ru : g.en
}

/** Восхождение по id (`Huntress1`). */
export function findAscendancy(tree: Poe2TreeData, id: string | null | undefined): (Poe2Ascendancy & { className: string }) | null {
  if (!id) return null
  for (const c of tree.classes) {
    const a = c.ascendancies.find((x) => x.id === id)
    if (a) return { ...a, className: c.name }
  }
  return null
}
