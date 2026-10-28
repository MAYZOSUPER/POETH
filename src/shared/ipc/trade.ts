// IPC домена «трейд/прайс-чек»: PoE2 (trade2, из компаса) и PoE1 (S4: окно цены в оверлее — фильтры и
// запрос строит renderer, main ходит в сеть через шлюз S3 и подбирает моды из data/stats сайта).

import type {
  PriceCheckResult,
  Poe1SearchArgs,
  Poe1SearchResult,
  Poe1ExchangeArgs,
  Poe1ExchangeResult,
  Poe1UnknownLine,
  Poe1FallbackMatch,
  CurrencyRate
} from '../types'

export const tradeChannels = {
  trade: {
    priceCheck: 'trade:priceCheck',
    setSession: 'trade:setSession',
    hasSession: 'trade:hasSession',
    getLeagues: 'trade:getLeagues',
    poe1Search: 'trade:pcSearch',
    poe1Exchange: 'trade:pcExchange',
    poe1MatchUnknown: 'trade:pcMatchUnknown',
    copyText: 'trade:copyText',
    currencyRate: 'trade:currencyRate'
  }
} as const

export const tradeEvents = {
  priceResult: 'event:priceResult'
} as const

export interface TradeIpcApi {
  trade: {
    /** Price-check the given item clipboard text against the trade2 API (PoE2). */
    priceCheck(itemText: string): Promise<PriceCheckResult>
    /** Store the POESESSID (encrypted at rest). Returns true once a session is set. */
    setSession(poesessid: string): Promise<boolean>
    /** Whether a POESESSID is currently stored. */
    hasSession(): Promise<boolean>
    /** Current PoE2 trade leagues (ids); falls back to a static list when offline. */
    getLeagues(): Promise<string[]>
    /** PoE1: поиск (тело — createTradeRequest) + первые лоты (fetch), через шлюз с лимитами */
    poe1Search(args: Poe1SearchArgs): Promise<Poe1SearchResult>
    /** PoE1: bulk-обмен (тело — createBulkRequest) */
    poe1Exchange(args: Poe1ExchangeArgs): Promise<Poe1ExchangeResult>
    /** PoE1: моды, которых нет в данных APT, → статы сайта трейда (data/stats, кэш на диске) */
    poe1MatchUnknown(lang: 'en' | 'ru', lines: Poe1UnknownLine[]): Promise<Poe1FallbackMatch[]>
    /** Положить текст в буфер обмена (кнопка «Скопировать whisper») */
    copyText(text: string): Promise<boolean>
    /** Курс chaos за divine в лиге (почасовой фид обмена GGG, сервис цен S11a); null — данных нет */
    currencyRate(league: string): Promise<CurrencyRate | null>
  }
  /** A hotkey-triggered price-check finished (main read the clipboard for us). */
  onPriceResult(cb: (result: PriceCheckResult) => void): () => void
}
