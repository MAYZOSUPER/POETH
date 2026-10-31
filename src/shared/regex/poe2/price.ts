// «Цена по профилю» (S62): ровно один поиск trade2 по клику + одна страница лотов (до 10) — цены самых дешёвых.
// Сеть передаётся снаружи (main: шлюз S3 с лимитами и кэшем), поэтому функция чистая и проверяется тестом.
// Без фоновых опросов и запросов при наведении: одно нажатие — один поиск.

import type { Poe2PriceListing, Poe2PriceResult } from '../../types/regex'
import { isPoe2TradeBody } from './profiles'

/** Лотов в ответе: одна страница fetch. */
export const PRICE_FETCH = 10

/** Запрос к шлюзу trade2 — та же форма, что GatewayRequest в main (search / fetch). */
export interface Poe2PriceRequest {
  kind: 'search' | 'fetch'
  priority: 'interactive'
  req: {
    method: 'GET' | 'POST'
    endpoint: 'search' | 'fetch'
    rest: string
    body?: unknown
    game: 'poe2'
  }
}

export type Poe2PriceTransport = <T>(
  r: Poe2PriceRequest
) => Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message?: string } }>

interface SearchResponse {
  id: string
  result: string[]
  total: number
}

interface FetchItem {
  id?: string
  listing?: { fee?: number; price?: { amount?: number; currency?: string } }
}

export async function profilePrice(
  body: unknown,
  league: string,
  request: Poe2PriceTransport,
  siteUrl: (searchId: string) => string
): Promise<Poe2PriceResult> {
  if (!isPoe2TradeBody(body)) return { ok: false, error: { code: 'bad-request', message: 'body' } }
  if (!league || league.length > 100) return { ok: false, error: { code: 'bad-request', message: 'league' } }
  // статус — только «выкуп + онлайн» (available), что бы ни пришло от renderer
  const safe = {
    ...body,
    query: { ...body.query, status: { option: 'available' as const } }
  }
  const search = await request<SearchResponse>({
    kind: 'search',
    priority: 'interactive',
    req: {
      method: 'POST',
      endpoint: 'search',
      rest: encodeURIComponent(league),
      body: safe,
      game: 'poe2'
    }
  })
  if (!search.ok) return search
  const { id, result, total } = search.data
  if (typeof id !== 'string' || !Array.isArray(result)) return { ok: false, error: { code: 'bad-response' } }
  const listings: Poe2PriceListing[] = []
  const ids = result.slice(0, PRICE_FETCH).filter((x) => typeof x === 'string')
  if (ids.length) {
    const fetched = await request<{ result: Array<FetchItem | null> }>({
      kind: 'fetch',
      priority: 'interactive',
      req: {
        method: 'GET',
        endpoint: 'fetch',
        rest: `${ids.join(',')}?query=${encodeURIComponent(id)}`,
        game: 'poe2'
      }
    })
    if (!fetched.ok) return fetched
    for (const r of fetched.data.result ?? []) {
      const p = r?.listing?.price
      if (!p || typeof p.amount !== 'number' || typeof p.currency !== 'string') continue
      listings.push({
        amount: p.amount,
        currency: p.currency,
        instant: typeof r?.listing?.fee === 'number'
      })
    }
  }
  return {
    ok: true,
    total: Number(total) || 0,
    listings,
    siteUrl: siteUrl(id),
    league
  }
}
