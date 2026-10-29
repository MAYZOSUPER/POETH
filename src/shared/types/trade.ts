// Типы прайс-чека: PoE2 (trade2 API, перенесено из компаса) и IPC-типы PoE1 (S4; сами фильтры и запрос —
// src/shared/poe1/pricecheck).

export type {
  Poe1Listing,
  Poe1ListingKind,
  Poe1Price,
  Poe1SearchArgs,
  Poe1SearchResult,
  Poe1ExchangeArgs,
  Poe1ExchangeOffer,
  Poe1ExchangeResult
} from '../poe1/pricecheck/results'
export type { FallbackMatch as Poe1FallbackMatch } from '../poe1/pricecheck/fallback'
export type { CurrencyRate } from '../poe1/pricecheck/currency'
export type { FaustusPrice, Poe1FaustusArgs, Poe1FaustusResult } from '../poe1/pricecheck/faustus'

/** Настройки окна цены (Settings v2 `priceCheck`). */
export interface PriceCheckSettings {
  /** «Написать» сразу отправляет whisper (Enter); по умолчанию выкл — текст вставляется, Enter жмёт игрок */
  sendWhisper: boolean
}

/** Нераспознанная строка мода (ParsedItem.unknownModifiers) для фолбэка data/stats. */
export interface Poe1UnknownLine {
  text: string
  type: string
}

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

