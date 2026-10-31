import { useEffect, useState } from 'react'
import { POE2_INSTILL_FILE, parseInstillData, type InstillData } from '@shared/poe2/build/instill'
import { mergeEmotionPrices, type EmotionPrices } from '@shared/poe2/build/instillPrices'
import { loadPoe2Prices, type LoadedPoe2Prices } from '@shared/poe2/prices'

// «Вложение» (S66): рецепты — poeth://data/poe2/build/instill.json (один раз на окно). Цены эмоций:
//  - обмен у Ange по фиду GGG (S61, trade.poe2Ange: в запросе к web.poecdn.com — только номер часа) — главный;
//  - снимок poe.ninja PoE 2 из пакета данных (S67, poeth://data/poe2/prices/…, без сети) — для эмоций, которых у Ange
//    за сутки не меняли. Слияние — mergeEmotionPrices (src/shared/poe2/build/instillPrices.ts).
// Цены спрашиваем, только когда их есть кому показать, и не чаще раза в 10 минут на окно.

export type { EmotionPrices }

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

/** Файл данных PoE 2 через poeth:// (надстройка обновлений → встроенные); нет — null. */
const readData = (rel: string): Promise<string | null> =>
  fetch(`poeth://data/poe2/${rel}`)
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null)

/** Снимок poe.ninja меняется только с пакетом данных — один раз на лигу и окно. */
let ninja: { league: string; pending: Promise<LoadedPoe2Prices | null> } | null = null

function loadNinja(league: string): Promise<LoadedPoe2Prices | null> {
  if (ninja?.league !== league) ninja = { league, pending: loadPoe2Prices(readData, league).catch(() => null) }
  return ninja.pending
}

const PRICES_TTL_MS = 10 * 60_000
let prices: { at: number; pending: Promise<EmotionPrices | null> } | null = null

async function fetchPrices(data: InstillData): Promise<EmotionPrices | null> {
  const leagues = await window.overlayApi.leagues.get().catch(() => null)
  const league = leagues?.effective ?? 'auto'
  const [ange, snap] = await Promise.all([
    window.overlayApi.trade.poe2Ange({ league, names: data.emotions.map((e) => e.en) }).catch(() => null),
    loadNinja(league)
  ])
  return mergeEmotionPrices(data.emotions, ange, snap)
}

function loadPrices(data: InstillData): Promise<EmotionPrices | null> {
  if (prices && Date.now() - prices.at < PRICES_TTL_MS) return prices.pending
  const pending = fetchPrices(data).then((p) => {
    // нет цен (нет сети, фида, снимка) — спросить снова при следующем показе
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
