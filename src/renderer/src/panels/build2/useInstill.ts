import { useEffect, useState } from 'react'
import { POE2_INSTILL_FILE, parseInstillData, type InstillData } from '@shared/poe2/build/instill'

// «Вложение» (S66): рецепты — poeth://data/poe2/build/instill.json (один раз на окно); цены эмоций — обмен у Ange
// по фиду GGG (S61, trade.poe2Ange: в запросе к web.poecdn.com — только номер часа). Пока S61 не в main, метода
// нет — показываем рецепты без цен; после слияния цены появятся без правок здесь. Цены спрашиваем, только когда
// их есть кому показать, и не чаще раза в 10 минут на окно.

let dataPromise: Promise<InstillData | null> | null = null

export function loadInstill(): Promise<InstillData | null> {
  dataPromise ??= fetch(`poeth://data/poe2/${POE2_INSTILL_FILE}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(parseInstillData)
    .catch(() => {
      dataPromise = null // следующий показ попробует ещё раз
      return null
    })
  return dataPromise
}

export function useInstillData(): { data: InstillData | null; ready: boolean } {
  const [state, setState] = useState<{ data: InstillData | null; ready: boolean }>({ data: null, ready: false })
  useEffect(() => {
    let alive = true
    void loadInstill().then((data) => alive && setState({ data, ready: true }))
    return () => {
      alive = false
    }
  }, [])
  return state
}

export interface EmotionPrices {
  /** английское имя эмоции → exalted за 1 шт. */
  byName: Map<string, number>
  exaltedPerDivine: number | null
}

/** Ответ S61 trade.poe2Ange — только поля, которые нужны здесь. */
interface AngeAnswer {
  ok: boolean
  rate?: { exaltedPerDivine?: number }
  prices?: Record<string, { exalted?: number } | undefined>
}
type AngeFn = (args: { league: string; names: string[] }) => Promise<AngeAnswer>

const PRICES_TTL_MS = 10 * 60_000
let prices: { at: number; pending: Promise<EmotionPrices | null> } | null = null

async function fetchPrices(data: InstillData): Promise<EmotionPrices | null> {
  // S61: метод появится со слиянием «цены у Ange»; до того цен нет
  const ange = (window.overlayApi.trade as unknown as { poe2Ange?: AngeFn }).poe2Ange
  if (typeof ange !== 'function') return null
  const leagues = await window.overlayApi.leagues.get().catch(() => null)
  const league = leagues?.effective
  if (!league) return null
  const res = await ange({ league, names: data.emotions.map((e) => e.en) }).catch(() => null)
  if (!res?.ok || !res.prices) return null
  const byName = new Map<string, number>()
  for (const e of data.emotions) {
    const p = res.prices[e.en]?.exalted
    if (typeof p === 'number' && p > 0) byName.set(e.en, p)
  }
  const rate = res.rate?.exaltedPerDivine
  return { byName, exaltedPerDivine: typeof rate === 'number' && rate > 0 ? rate : null }
}

function loadPrices(data: InstillData): Promise<EmotionPrices | null> {
  if (prices && Date.now() - prices.at < PRICES_TTL_MS) return prices.pending
  const pending = fetchPrices(data).then((p) => {
    if (!p && prices?.pending === pending) prices = null
    return p
  })
  prices = { at: Date.now(), pending }
  return pending
}

/** Цены эмоций, когда `enabled`; loading — ждём ответа. */
export function useEmotionPrices(data: InstillData | null, enabled: boolean): { prices: EmotionPrices | null; loading: boolean } {
  const [state, setState] = useState<{ prices: EmotionPrices | null; loading: boolean }>({ prices: null, loading: false })
  useEffect(() => {
    if (!data || !enabled) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    void loadPrices(data).then((p) => alive && setState({ prices: p, loading: false }))
    return () => {
      alive = false
    }
  }, [data, enabled])
  return state
}
