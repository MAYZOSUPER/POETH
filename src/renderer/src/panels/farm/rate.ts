import { useEffect, useState } from 'react'

// Курс exalted за divine для трекера карт PoE 2 (S69): тот же, что у вкладки «Прайс-чек» PoE 2 (S61) — биржа GGG
// за прошлые часы, лига поиска (`leagues.effective`). Общий для панели компаньона и виджета оверлея; данных
// пользователя в запросе нет. Нет курса (нет сети, нет сделок) — null: суммы показываем в exalted.

const REFRESH_MS = 10 * 60_000

export function useExPerDiv(enabled: boolean): number | null {
  const [rate, setRate] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const league = (await window.overlayApi.leagues.get())?.effective
        if (!league) return
        const r = await window.overlayApi.trade.poe2Rate(league)
        if (alive && r && r.exaltedPerDivine > 0) setRate(r.exaltedPerDivine)
      } catch {
        // курс не нужен для учёта — без него суммы в exalted
      }
    }
    void load()
    const t = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [enabled])
  return rate
}
