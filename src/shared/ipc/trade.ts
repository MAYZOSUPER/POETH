// IPC домена «трейд/прайс-чек».
// Сейчас — прайс-чек PoE2 (trade2, перенесён из компаса).
// TODO S4: прайс-чек PoE1 (фильтры, пресеты, bulk, «открыть в трейд-окне») — каналы сюда.

import type { PriceCheckResult } from '../types'

export const tradeChannels = {
  trade: {
    priceCheck: 'trade:priceCheck',
    setSession: 'trade:setSession',
    hasSession: 'trade:hasSession',
    getLeagues: 'trade:getLeagues'
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
  }
  /** A hotkey-triggered price-check finished (main read the clipboard for us). */
  onPriceResult(cb: (result: PriceCheckResult) => void): () => void
}
