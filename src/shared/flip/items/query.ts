// Запрос трейда для «Недооценённых уников» (S33): тот же уник, тот же вариант и связи, цена не выше
// k × цены poe.ninja, только онлайн или мгновенный выкуп, лоты за неделю, сначала дешёвые. Этот же запрос
// уходит в live search по кнопке «Следить» (S6). Имя и база — английские (refName), даже у RU-клиента.

import type { ItemRow, ItemTradeStat } from '../../types/flip'

export const DEFAULT_K = 0.7
export const K_MIN = 0.3
export const K_MAX = 0.95
/** лотов за одну проверку (одна страница fetch) */
export const CHECK_LOTS = 10

export function clampK(k: unknown): number {
  const n = typeof k === 'number' && Number.isFinite(k) ? k : DEFAULT_K
  return Math.round(Math.min(K_MAX, Math.max(K_MIN, n)) * 100) / 100
}

/** Порог цены поиска, chaos: k × цена poe.ninja, целым (не меньше 1). */
export function maxPriceOf(row: Pick<ItemRow, 'chaos'>, k: number): number {
  return Math.max(1, Math.floor(row.chaos * clampK(k)))
}

type QueryRow = Pick<ItemRow, 'name' | 'base' | 'links' | 'unlinked' | 'foulborn'> & {
  trade?: readonly ItemTradeStat[]
  corrupted?: boolean
}

export interface ItemSearchBody {
  query: Record<string, unknown>
  sort: { price: 'asc' }
}

/**
 * Тело POST /api/trade/search. Цена — без валюты (сайт сравнивает в chaos-эквиваленте), статус «available»
 * (мгновенный выкуп и личный обмен с продавцом в сети), «indexed: 1week» — только лоты за неделю.
 */
export function buildItemQuery(row: QueryRow, maxChaos: number): ItemSearchBody {
  const misc: Record<string, unknown> = {
    corrupted: { option: row.corrupted ? 'true' : 'false' },
    foulborn_item: { option: row.foulborn ? 'true' : 'false' }
  }
  const filters: Record<string, unknown> = {
    misc_filters: { filters: misc },
    trade_filters: { filters: { price: { max: Math.max(1, Math.floor(maxChaos)) }, indexed: { option: '1week' } } }
  }
  if (row.links === 6) filters.socket_filters = { filters: { links: { min: 6 } } }
  else if (row.links === 5) filters.socket_filters = { filters: { links: { min: 5, max: 5 } } }
  else if (row.unlinked) filters.socket_filters = { filters: { links: { max: 4 } } }

  const query: Record<string, unknown> = {
    status: { option: 'available' },
    name: row.name,
    type: row.base,
    stats: [
      {
        type: 'and',
        filters: (row.trade ?? []).map((s) => {
          const value: Record<string, number> = {}
          if (s.min !== undefined) value.min = s.min
          if (s.max !== undefined) value.max = s.max
          return Object.keys(value).length ? { id: s.id, value } : { id: s.id }
        })
      }
    ],
    filters
  }
  return { query, sort: { price: 'asc' } }
}

/** Название поиска в live search: «Shavronne's Wrappings 6L ≤ 210 c». */
export function watchTitle(row: Pick<ItemRow, 'name' | 'links' | 'foulborn' | 'variant'>, maxChaos: number): string {
  const parts = [row.foulborn ? `Foulborn ${row.name}` : row.name]
  if (row.variant) parts.push(`(${row.variant})`)
  if (row.links) parts.push(`${row.links}L`)
  parts.push(`≤ ${Math.floor(maxChaos)} c`)
  return parts.join(' ').slice(0, 120)
}
