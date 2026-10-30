import { useEffect, useState } from 'react'
import { BUILD_ANOINTS_FILE, parseAnointData, type AnointData } from '@shared/build/anoints'

// Анойнт (S54) во вкладке «Билд»: рецепты S54 — poeth://data/poe1/build/anoints.json (один раз на окно), цены масел —
// обмен у Фаустуса по фиду GGG (trade.poe1Faustus, S24: тот же кэш часов, что у «Богатства» и окна цены; в запросе к
// web.poecdn.com — только номер часа). Цены спрашиваем, только когда их есть кому показать (анойнт у автора или
// открыт поиск), и не чаще раза в 10 минут на окно.

let dataPromise: Promise<AnointData | null> | null = null

/** Рецепты анойнта; null — файла нет или формат новее приложения. */
export function loadAnoints(): Promise<AnointData | null> {
  dataPromise ??= fetch(`poeth://data/poe1/${BUILD_ANOINTS_FILE}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(parseAnointData)
    .catch(() => {
      dataPromise = null // следующий показ попробует ещё раз
      return null
    })
  return dataPromise
}

export function useAnointData(): { data: AnointData | null; ready: boolean } {
  const [state, setState] = useState<{ data: AnointData | null; ready: boolean }>({ data: null, ready: false })
  useEffect(() => {
    let alive = true
    void loadAnoints().then((data) => alive && setState({ data, ready: true }))
    return () => {
      alive = false
    }
  }, [])
  return state
}

export interface OilPrices {
  /** tradeTag масла → chaos за 1 шт. (масел без сделок за сутки нет) */
  byTag: Map<string, number>
  /** chaos за 1 divine — тот же курс, что в шапке окна цены */
  chaosPerDivine: number
  /** последний час фида, ms */
  lastHour: number
}

const PRICES_TTL_MS = 10 * 60_000
let prices: { at: number; pending: Promise<OilPrices | null> } | null = null

async function fetchOilPrices(data: AnointData): Promise<OilPrices | null> {
  const leagues = await window.overlayApi.leagues.get().catch(() => null)
  const league = leagues?.effective
  if (!league) return null
  const res = await window.overlayApi.trade.poe1Faustus({ league, names: data.oils.map((o) => o.en) }).catch(() => null)
  if (!res?.ok) return null
  const byTag = new Map<string, number>()
  for (const o of data.oils) {
    const p = res.prices[o.en]
    if (p && p.chaos > 0) byTag.set(o.tag, p.chaos)
  }
  return { byTag, chaosPerDivine: res.chaosPerDivine, lastHour: res.lastHour }
}

function loadOilPrices(data: AnointData): Promise<OilPrices | null> {
  if (prices && Date.now() - prices.at < PRICES_TTL_MS) return prices.pending
  const pending = fetchOilPrices(data).then((p) => {
    // нет цен (нет сети, фида, лиги) — спросить снова при следующем показе
    if (!p && prices?.pending === pending) prices = null
    return p
  })
  prices = { at: Date.now(), pending }
  return pending
}

/** Цены масел, когда `enabled`; loading — ждём ответа. */
export function useOilPrices(data: AnointData | null, enabled: boolean): { prices: OilPrices | null; loading: boolean } {
  const [state, setState] = useState<{ prices: OilPrices | null; loading: boolean }>({ prices: null, loading: false })
  useEffect(() => {
    if (!data || !enabled) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    void loadOilPrices(data).then((p) => alive && setState({ prices: p, loading: false }))
    return () => {
      alive = false
    }
  }, [data, enabled])
  return state
}
