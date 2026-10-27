// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/pathofexile-bulk.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: только чистая часть — тело POST /api/trade/exchange/<league> (сеть — main/S3); статус из
// `filters.trade.status` (у обмена свои значения: online / onlineleague / any); разбор ответа — по APT.

import type { ParsedItem } from '../../parser'
import type { ItemFilters, TradeStatus } from '../filters/interfaces'
import { tradeTag } from './common'

export type BulkStatus = 'online' | 'onlineleague' | 'any'

export interface BulkRequest {
  engine: 'new'
  query: {
    status: { option: BulkStatus }
    have: string[]
    want: string[]
    minimum?: number
  }
  sort: { have: 'asc' }
}

/** Чем платим по умолчанию (trade tags валюты). */
export const DEFAULT_BULK_HAVE: readonly string[] = ['divine', 'chaos']

/** У обмена нет мерчант-листингов: `any` → все, остальное → продавцы онлайн (в лиге — по флагу). */
export function bulkStatus(status: TradeStatus, onlineInLeague: boolean): BulkStatus {
  if (status === 'any') return 'any'
  return onlineInLeague ? 'onlineleague' : 'online'
}

/** Тело запроса bulk-обмена; `want` — trade tag предмета (от языка не зависит). */
export function createBulkRequest(
  filters: ItemFilters,
  item: ParsedItem,
  have: readonly string[] = DEFAULT_BULK_HAVE
): BulkRequest {
  const want = tradeTag(item)
  if (!want) throw new Error(`Предмет не торгуется через обмен: ${item.info.refName}`)
  // за саму себя валюту не покупают (Сфера хаоса → платим только divine)
  const pay = have.filter((h) => h !== want)
  return {
    engine: 'new',
    query: {
      have: pay.length ? pay : ['chaos'],
      want: [want],
      status: { option: bulkStatus(filters.trade.status, filters.trade.onlineInLeague) },
      minimum: filters.stackSize && !filters.stackSize.disabled ? filters.stackSize.value : undefined
    },
    sort: { have: 'asc' }
  }
}

/** Ответ обмена с `engine: "new"` (без отдельного fetch). */
export interface BulkSearchResult {
  id: string
  total: number
  result: Record<
    string,
    {
      id: string
      listing: {
        indexed: string
        offers: Array<{
          exchange: { currency: string; amount: number }
          item: { amount: number; stock: number }
        }>
        account: { name: string; lastCharacterName: string; online?: { status?: 'afk' } }
      }
    }
  >
}

export interface BulkOffer {
  id: string
  indexed: string
  /** сколько валюты `currency` за `itemAmount` предметов */
  exchangeAmount: number
  currency: string
  itemAmount: number
  stock: number
  accountName: string
  ign: string
  accountStatus: 'offline' | 'online' | 'afk'
}

/** Предложения по каждой валюте `have`, от дешёвых к дорогим (курс = exchangeAmount / itemAmount). */
export function bulkOffersByCurrency(res: BulkSearchResult, have: readonly string[], limit = 20): Record<string, BulkOffer[]> {
  const offers = Object.values(res.result).filter((r) => r.listing.offers.length === 1)
  const out: Record<string, BulkOffer[]> = {}
  for (const currency of have) {
    out[currency] = offers
      .filter((r) => r.listing.offers[0].exchange.currency === currency)
      .map((r) => {
        const offer = r.listing.offers[0]
        return {
          id: r.id,
          indexed: r.listing.indexed,
          exchangeAmount: offer.exchange.amount,
          currency,
          itemAmount: offer.item.amount,
          stock: offer.item.stock,
          accountName: r.listing.account.name,
          ign: r.listing.account.lastCharacterName,
          accountStatus: r.listing.account.online
            ? r.listing.account.online.status === 'afk'
              ? 'afk'
              : 'online'
            : 'offline'
        } satisfies BulkOffer
      })
      .sort((a, b) => a.exchangeAmount / a.itemAmount - b.exchangeAmount / b.itemAmount)
      .slice(0, limit)
  }
  return out
}
