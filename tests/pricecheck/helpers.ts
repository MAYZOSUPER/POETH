// Хелперы тестов окна цены (S15): синтетические лоты из «ответа fetch» и строки словаря RU/EN.
import { normalizeListing, type Poe1Listing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { trade } from '../../src/renderer/src/i18n/dict/trade'

export const NOW = Date.parse('2026-11-14T12:00:00Z')
export const DAY = 24 * 60 * 60_000

export interface LotSpec {
  amount?: number
  currency?: string
  /** мерчант-листинг (мгновенный выкуп) */
  instant?: boolean
  account?: string
  /** сколько дней назад выставлен */
  days?: number
  /** группы связей: [6] — 6L, [4, 2] — 4L + 2 */
  sockets?: number[]
  corrupted?: boolean
  mutated?: boolean
  enchant?: boolean
}

/** Лот так, как он приходит в ответе /api/trade/fetch (флаги — только при true, как у сайта). */
export function fetchItem(id: string, s: LotSpec = {}): TradeFetchItem {
  const sockets = s.sockets?.flatMap((n, group) => Array.from({ length: n }, () => ({ group })))
  return {
    id,
    listing: {
      indexed: new Date(NOW - (s.days ?? 0.5) * DAY).toISOString(),
      price: s.amount == null ? null : { amount: s.amount, currency: s.currency ?? 'chaos', type: '~price' },
      ...(s.instant ? { fee: 300 } : { whisper: `@Char hi ${id}` }),
      account: { name: s.account ?? `acc-${id}`, lastCharacterName: `Char${id}`, online: { status: 'online' } }
    },
    item: {
      ilvl: 84,
      typeLine: 'Vaal Regalia',
      baseType: 'Vaal Regalia',
      ...(sockets ? { sockets } : {}),
      ...(s.corrupted ? { corrupted: true } : {}),
      ...(s.mutated ? { mutated: true } : {}),
      ...(s.enchant ? { enchantMods: ['Enchant line'] } : {})
    }
  }
}

export function lot(id: string, s: LotSpec = {}): Poe1Listing {
  return normalizeListing(fetchItem(id, s))
}

/** Лоты по ценам: lots([10, 12, 15]) → l0, l1, l2 (chaos, «лично»). */
export function lots(prices: number[], s: LotSpec = {}): Poe1Listing[] {
  return prices.map((amount, i) => lot(`l${i}`, { ...s, amount }))
}

/** Текст строки словаря с подстановкой параметров — как t() в окне цены. */
export function text(lang: 'ru' | 'en', key: string, params?: Record<string, string | number>): string {
  const s = trade[lang][key]
  if (s === undefined) throw new Error(`нет строки ${lang}:${key}`)
  return Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s)
}
