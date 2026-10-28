// Часы фида обмена GGG в полном виде (чистый модуль; tests/flip/feed.test.ts).
//
// GET https://web.poecdn.com/api/currency-exchange/<hourId> → { next_change_id, markets: [{ league, market_pair:[A,B],
// volume_traded, lowest_stock, highest_stock, lowest_ratio, highest_ratio }] } — все поля — объекты {A: a, B: b}.
// Храним рынки с любой активностью кортежем (id без 'Metadata/Items/'), чтобы и учёт богатства (объёмы), и
// флиппинг (соотношения, стакан) брали часы из одного кэша.

import { shortId, type CompactHour, type CompactTrade } from '../wealth/exchange'

/** [лига, A, B, объём A, объём B, lowRatio A, lowRatio B, highRatio A, highRatio B, lowStock A, lowStock B, highStock A, highStock B] */
export type FullMarket = [string, string, string, number, number, number, number, number, number, number, number, number, number]

export interface FullHour {
  hour: number
  markets: FullMarket[]
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** Ответ фида → рынки с активностью (все лиги). null — не похоже на фид. */
export function parseFeedHour(hour: number, json: unknown): FullHour | null {
  const markets = (json as { markets?: unknown } | null)?.markets
  if (!Array.isArray(markets)) return null
  const out: FullMarket[] = []
  for (const m of markets as Array<Record<string, unknown>>) {
    const league = m?.league
    const pair = m?.market_pair
    if (typeof league !== 'string' || !Array.isArray(pair) || pair.length !== 2) continue
    const [a, b] = pair
    if (typeof a !== 'string' || typeof b !== 'string') continue
    const get = (k: string, id: string): number => n((m[k] as Record<string, unknown> | undefined)?.[id])
    const row: FullMarket = [
      league,
      shortId(a),
      shortId(b),
      get('volume_traded', a),
      get('volume_traded', b),
      get('lowest_ratio', a),
      get('lowest_ratio', b),
      get('highest_ratio', a),
      get('highest_ratio', b),
      get('lowest_stock', a),
      get('lowest_stock', b),
      get('highest_stock', a),
      get('highest_stock', b)
    ]
    let any = false
    for (let i = 3; i < row.length; i++) if (row[i] as number) any = true
    if (any) out.push(row)
  }
  return { hour, markets: out }
}

/** Полный час → объёмы для учёта богатства (S11a): только рынки со сделками. */
export function toCompactHour(h: FullHour): CompactHour {
  const trades: CompactTrade[] = []
  for (const m of h.markets) if (m[3] > 0 && m[4] > 0) trades.push([m[0], m[1], m[2], m[3], m[4]])
  return { hour: h.hour, trades }
}

/** Только рынки лиги (для памяти). */
export function leagueHour(h: FullHour, league: string): FullHour {
  return { hour: h.hour, markets: h.markets.filter((m) => m[0] === league) }
}
