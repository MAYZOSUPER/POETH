// Почасовой фид обмена валюты GGG (чистый модуль; tests/wealth/exchange.test.ts).
//
// GET https://web.poecdn.com/api/currency-exchange/<hourId> (без авторизации) →
//   { next_change_id, markets: [{ league, market_pair:[A,B], volume_traded:{A:a, B:b}, … }] }
// hourId — unix-время начала часа (секунды); текущий час недоступен (404), прошлые неизменны.
// volume_traded {A:a, B:b}: за час a штук A обменяли на b штук B → цена A = b/a штук B.
// Цена предмета в chaos — VWAP по рынкам с якорями chaos и divine:
//   price(X) = Σ vol_якоря · цена_якоря / Σ vol_X.

export const CHAOS_ID = 'Currency/CurrencyRerollRare'
export const DIVINE_ID = 'Currency/CurrencyModValues'
const META_PREFIX = 'Metadata/Items/'

/** Сделки часа в сжатом виде: [лига, idA, idB, объём A, объём B] (id без 'Metadata/Items/'). */
export type CompactTrade = [string, string, string, number, number]

export interface CompactHour {
  hour: number
  trades: CompactTrade[]
}

export function shortId(metaId: string): string {
  return metaId.startsWith(META_PREFIX) ? metaId.slice(META_PREFIX.length) : metaId
}

/** Начало текущего часа (секунды) — последний доступный час на час раньше. */
export function hourStart(nowMs: number): number {
  return Math.floor(nowMs / 3_600_000) * 3600
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** Ответ фида → только рынки с объёмом (все лиги). null — не похоже на фид. */
export function compactFeedHour(hour: number, json: unknown): CompactHour | null {
  const markets = (json as { markets?: unknown } | null)?.markets
  if (!Array.isArray(markets)) return null
  const trades: CompactTrade[] = []
  for (const m of markets as Array<Record<string, unknown>>) {
    const league = m?.league
    const pair = m?.market_pair
    const vol = m?.volume_traded as Record<string, unknown> | undefined
    if (typeof league !== 'string' || !Array.isArray(pair) || pair.length !== 2 || !vol) continue
    const [a, b] = pair
    if (typeof a !== 'string' || typeof b !== 'string') continue
    const va = num(vol[a])
    const vb = num(vol[b])
    if (!va || !vb) continue
    trades.push([league, shortId(a), shortId(b), va, vb])
  }
  return { hour, trades }
}

export interface ExchangePrice {
  /** chaos за штуку */
  chaos: number
  /** штук предмета в сделках за окно */
  volume: number
  /** часов с сделками в окне */
  hours: number
}

export interface ExchangePrices {
  /** chaos за 1 divine (0 — нет сделок) */
  divineRate: number
  /** по короткому id ('Currency/…', 'Scarabs/…') */
  byId: Map<string, ExchangePrice>
  /** последний час с данными (секунды) */
  lastHour?: number
}

/** Окна VWAP (часов): берём самое короткое, где у предмета есть сделки. */
export const VWAP_WINDOWS_H = [6, 24, 48]

/**
 * Цены лиги по часам фида: курс divine и цена каждого предмета, торгуемого против
 * chaos или divine. Предмет без сделок в окнах — без цены.
 */
export function computeExchangePrices(hours: readonly CompactHour[], league: string): ExchangePrices {
  const sorted = [...hours].sort((a, b) => b.hour - a.hour)
  const latest = sorted[0]?.hour
  const out: ExchangePrices = { divineRate: 0, byId: new Map(), lastHour: latest }
  if (latest === undefined) return out

  const within = (h: CompactHour, windowH: number): boolean => h.hour > latest - windowH * 3600

  // курс divine: самое короткое окно со сделками chaos↔divine
  for (const w of VWAP_WINDOWS_H) {
    let c = 0
    let d = 0
    for (const h of sorted) {
      if (!within(h, w)) continue
      for (const [lg, a, b, va, vb] of h.trades) {
        if (lg !== league) continue
        if (a === CHAOS_ID && b === DIVINE_ID) {
          c += va
          d += vb
        } else if (a === DIVINE_ID && b === CHAOS_ID) {
          c += vb
          d += va
        }
      }
    }
    if (d > 0) {
      out.divineRate = c / d
      break
    }
  }

  const anchor = (id: string): number => (id === CHAOS_ID ? 1 : id === DIVINE_ID ? out.divineRate : 0)
  out.byId.set(CHAOS_ID, { chaos: 1, volume: 0, hours: 0 })
  if (out.divineRate > 0) out.byId.set(DIVINE_ID, { chaos: out.divineRate, volume: 0, hours: 0 })

  // по каждому предмету: Σ (объём якоря · цена якоря) и Σ объём предмета, по окнам
  interface Acc {
    value: number
    volume: number
    hours: Set<number>
  }
  const acc = VWAP_WINDOWS_H.map(() => new Map<string, Acc>())
  for (const h of sorted) {
    for (const [lg, a, b, va, vb] of h.trades) {
      if (lg !== league) continue
      const pa = anchor(a)
      const pb = anchor(b)
      let item: string
      let itemVol: number
      let value: number
      if (pb > 0 && pa === 0) {
        item = a
        itemVol = va
        value = vb * pb
      } else if (pa > 0 && pb === 0) {
        item = b
        itemVol = vb
        value = va * pa
      } else continue
      VWAP_WINDOWS_H.forEach((w, i) => {
        if (!within(h, w)) return
        let e = acc[i].get(item)
        if (!e) acc[i].set(item, (e = { value: 0, volume: 0, hours: new Set() }))
        e.value += value
        e.volume += itemVol
        e.hours.add(h.hour)
      })
    }
  }
  const ids = new Set<string>()
  for (const m of acc) for (const id of m.keys()) ids.add(id)
  for (const id of ids) {
    for (const m of acc) {
      const e = m.get(id)
      if (e && e.volume > 0) {
        out.byId.set(id, { chaos: e.value / e.volume, volume: e.volume, hours: e.hours.size })
        break
      }
    }
  }
  return out
}

/** Мало сделок — цена «примерная». */
export function isLowVolume(p: ExchangePrice): boolean {
  return p.volume > 0 && (p.volume < 3 || p.hours < 2)
}
