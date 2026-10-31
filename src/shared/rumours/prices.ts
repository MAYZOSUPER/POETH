// Цены главных наград слухов (S65; чистый модуль, tests/rumours/prices.test.ts). Источник цен — интерфейс:
//  - «exchange» — цена у Ange по почасовому фиду обмена GGG `currency-exchange/poe2` (S61), адаптер — sources.ts;
//  - «ninja» — снимок poe.ninja PoE 2 из пакета данных (S67), адаптер — sources.ts;
//  - «stub» — заглушка (тесты, нет источников): цен нет.
// Порядок источников — порядок доверия: у ссылки берётся первая найденная цена. Падение одного источника не мешает
// остальным. Сеть и диск — у источников в main; здесь только сведение и пересчёт в exalted.

import { itemRefKey, type RumourItemRef } from './schema'

export type RumourPriceSourceId = 'exchange' | 'ninja' | 'stub'

/** база PoE 2 — exalted, дорогое — divine; chaos встречается в снимках poe.ninja */
export type RumourPriceUnit = 'exalted' | 'divine' | 'chaos'

export interface RumourPriceQuote {
  value: number
  unit: RumourPriceUnit
  source: RumourPriceSourceId
  /** когда источник снял цену (ISO); null — не знает */
  at: string | null
  /** мало сделок или лотов — цена примерная (S61 AngePrice.low, S67 Poe2Price.low) */
  low?: boolean
}

/** Ссылка на награду для источника: имя EE2 (poe.ninja) и путь метаданных (фид обмена). */
export interface RumourPriceRef extends RumourItemRef {
  meta: string | null
}

export interface RumourRates {
  /** сколько exalted за 1 divine; null — курса нет */
  divineInExalted: number | null
  /** сколько exalted за 1 chaos; null — курса нет */
  chaosInExalted: number | null
}

export interface RumourPriceSource {
  readonly id: RumourPriceSourceId
  /** цены по ключу itemRefKey; нет цены — нет ключа */
  quote(refs: readonly RumourPriceRef[], league: string): Promise<Record<string, RumourPriceQuote>>
  /** курс divine/chaos в exalted, если источник его знает */
  rates?(league: string): Promise<Partial<RumourRates>>
}

export interface RumourPriceBook {
  league: string | null
  quotes: Record<string, RumourPriceQuote>
  rates: RumourRates
  /** какие источники ответили (для подписи «цены: фид GGG, poe.ninja») */
  sources: RumourPriceSourceId[]
}

export const EMPTY_PRICE_BOOK: RumourPriceBook = {
  league: null,
  quotes: {},
  rates: { divineInExalted: null, chaosInExalted: null },
  sources: []
}

/** Заглушка до слияния S61 и S67: источник есть, цен нет. */
export const stubPriceSource: RumourPriceSource = {
  id: 'stub',
  quote: async () => ({})
}

/** Источник с готовой таблицей (тесты, фикстуры экрана). */
export function staticPriceSource(
  id: RumourPriceSourceId,
  prices: Record<string, Omit<RumourPriceQuote, 'source'>>,
  rates: Partial<RumourRates> = {}
): RumourPriceSource {
  return {
    id,
    quote: async (refs) => {
      const out: Record<string, RumourPriceQuote> = {}
      for (const r of refs) {
        const q = prices[itemRefKey(r)]
        if (q) out[itemRefKey(r)] = { ...q, source: id }
      }
      return out
    },
    rates: async () => rates
  }
}

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/**
 * Свести цены из источников по порядку. У ссылки — первая годная цена; курс — первый годный. Ошибка источника
 * уходит в onError и не мешает остальным.
 */
export async function collectPrices(
  sources: readonly RumourPriceSource[],
  refs: readonly RumourPriceRef[],
  league: string | null,
  onError: (source: RumourPriceSourceId, e: unknown) => void = () => {}
): Promise<RumourPriceBook> {
  const book: RumourPriceBook = { league, quotes: {}, rates: { divineInExalted: null, chaosInExalted: null }, sources: [] }
  if (!league) return book
  const seen = new Set<string>()
  const uniq = refs.filter((r) => !seen.has(itemRefKey(r)) && seen.add(itemRefKey(r)))
  for (const s of sources) {
    try {
      const want = uniq.filter((r) => !book.quotes[itemRefKey(r)])
      if (want.length) {
        const got = await s.quote(want, league)
        let any = false
        for (const r of want) {
          const q = got[itemRefKey(r)]
          if (q && okNumber(q.value)) {
            book.quotes[itemRefKey(r)] = { ...q, source: s.id }
            any = true
          }
        }
        if (any && !book.sources.includes(s.id)) book.sources.push(s.id)
      }
      if (s.rates && (book.rates.divineInExalted === null || book.rates.chaosInExalted === null)) {
        const r = await s.rates(league)
        if (book.rates.divineInExalted === null && okNumber(r.divineInExalted)) book.rates.divineInExalted = r.divineInExalted
        if (book.rates.chaosInExalted === null && okNumber(r.chaosInExalted)) book.rates.chaosInExalted = r.chaosInExalted
      }
    } catch (e) {
      onError(s.id, e)
    }
  }
  return book
}

/** Цена в exalted; null — нет цены или нет курса для её единицы. */
export function inExalted(q: RumourPriceQuote | null | undefined, rates: RumourRates): number | null {
  if (!q || !okNumber(q.value)) return null
  if (q.unit === 'exalted') return q.value
  const rate = q.unit === 'divine' ? rates.divineInExalted : rates.chaosInExalted
  return okNumber(rate) ? q.value * rate : null
}

export interface ShownPrice {
  value: number
  unit: 'exalted' | 'divine'
  /** цена примерная: мало сделок или лотов */
  low?: boolean
}

/**
 * Как показать цену новичку: от 1 divine — в divine с одним знаком (≈ 2,5 div), иначе в целых exalted (≈ 40 ex).
 * Без курса — в единице источника, chaos без курса не показываем.
 */
export function shownPrice(q: RumourPriceQuote | null | undefined, rates: RumourRates): ShownPrice | null {
  if (!q || !okNumber(q.value)) return null
  const low = q.low ? { low: true } : {}
  const ex = inExalted(q, rates)
  const div = rates.divineInExalted
  if (ex !== null && okNumber(div)) {
    if (ex >= div) return { value: Math.round((ex / div) * 10) / 10, unit: 'divine', ...low }
    return { value: Math.max(1, Math.round(ex)), unit: 'exalted', ...low }
  }
  if (q.unit === 'divine') return { value: Math.round(q.value * 10) / 10, unit: 'divine', ...low }
  if (q.unit === 'exalted') return { value: Math.max(1, Math.round(q.value)), unit: 'exalted', ...low }
  return null
}
