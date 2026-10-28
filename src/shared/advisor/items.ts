// Поиск предмета для редактора стратегии (S17; чистый модуль, tests/advisor/items.test.ts): по русскому или
// английскому имени. В стратегию уходит ref — английское имя (refName данных APT = имя на обмене GGG), вид
// предмета — для цены. Кандидаты: предметы обмена (валюта, скарабеи, сущности…), гадальные карты, уники и
// камни из русских данных APT плюс имена фида обмена, у которых русского имени ещё нет (новая лига).

import type { AdvisorItemKind } from '../types/advisor'

export interface ItemCandidate {
  ref: string
  /** русское имя (данные APT); нет — только английское */
  ru?: string
  kind: AdvisorItemKind
}

/** Запись items.ndjson (нужные поля). */
export interface ItemRecord {
  name: string
  refName: string
  namespace: string
  exchangeable?: boolean
}

const KIND_ORDER: Record<AdvisorItemKind, number> = { stackable: 0, card: 1, unique: 2, gem: 3, map: 4 }

/** Кандидаты поиска; повторы по (вид, ref) отбрасываются. */
export function buildItemCatalog(records: Iterable<ItemRecord>, exchangeNames: Iterable<string>): ItemCandidate[] {
  const exchange = new Set(exchangeNames)
  const out = new Map<string, ItemCandidate>()
  const put = (c: ItemCandidate): void => {
    const key = `${c.kind}:${c.ref}`
    if (!out.has(key)) out.set(key, c)
  }
  for (const r of records) {
    if (!r || typeof r.refName !== 'string' || !r.refName) continue
    const ru = typeof r.name === 'string' && r.name && r.name !== r.refName ? r.name : undefined
    let kind: AdvisorItemKind | null = null
    if (r.namespace === 'ITEM' && (r.exchangeable || exchange.has(r.refName))) kind = 'stackable'
    else if (r.namespace === 'DIVINATION_CARD') kind = 'card'
    else if (r.namespace === 'UNIQUE') kind = 'unique'
    else if (r.namespace === 'GEM') kind = 'gem'
    if (kind) put(ru ? { ref: r.refName, ru, kind } : { ref: r.refName, kind })
  }
  const known = new Set([...out.values()].map((c) => c.ref))
  for (const name of exchange) if (name && !known.has(name)) put({ ref: name, kind: 'stackable' })
  return [...out.values()]
}

/** Для сравнения: нижний регистр, ё → е, пробелы схлопнуты. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

function score(name: string | undefined, q: string): number {
  if (!name) return 9
  const n = normalize(name)
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(` ${q}`) || n.includes(`-${q}`)) return 2
  if (n.includes(q)) return 3
  return 9
}

/** До limit кандидатов: точное совпадение, начало имени, начало слова, подстрока; меньше 2 букв — пусто. */
export function searchItems(catalog: readonly ItemCandidate[], query: string, limit = 8): ItemCandidate[] {
  const q = normalize(String(query ?? '')).slice(0, 80)
  if (q.length < 2) return []
  const hits: Array<{ c: ItemCandidate; s: number }> = []
  for (const c of catalog) {
    const s = Math.min(score(c.ref, q), score(c.ru, q))
    if (s < 9) hits.push({ c, s })
  }
  hits.sort((a, b) => a.s - b.s || KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind] || a.c.ref.length - b.c.ref.length || (a.c.ref < b.c.ref ? -1 : 1))
  return hits.slice(0, limit).map((h) => h.c)
}
