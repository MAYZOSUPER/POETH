// Типы прайс-чека PoE2 (trade2 API, перенесено из компаса).
// TODO S4: типы прайс-чека PoE1 (фильтры модов, результаты, bulk) — сюда или в src/shared/poe1/.

export interface TradeListing {
  amount: number
  currency: string
  account?: string
  /** ready-made @whisper string from the trade API */
  whisper?: string
  indexed?: string
}

export interface PriceResult {
  /** human label of what we searched (item/base name) */
  query: string
  league: string
  /** total listings the API reported */
  total: number
  /** top listings (cheapest first) */
  listings: TradeListing[]
  min?: { amount: number; currency: string }
  median?: { amount: number; currency: string }
  /** caveat, e.g. "rare matched by base only (approx)" */
  note?: string
  /** pathofexile.com/trade2 URL to open the search in a browser */
  searchUrl?: string
}

export type PriceCheckResult =
  | { status: 'ok'; item: { name: string; rarity: string }; result: PriceResult }
  | { status: 'no-session' }
  | { status: 'not-an-item' }
  | { status: 'empty'; item: { name: string; rarity: string } }
  | { status: 'error'; message: string }

