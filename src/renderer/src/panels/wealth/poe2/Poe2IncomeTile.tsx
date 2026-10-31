import { useEffect } from 'react'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import type { IncomeTileProps } from '../IncomeTile'
import { df, nf } from '../format'
import { usePoe2WealthStore } from './usePoe2WealthStore'

// Плитка «Доход в час» сессии фарма PoE 2 (S70) — FarmPanel трекера карт зовёт renderIncome. Прибыль забегов
// приходит в exalted (поле profitChaos у FarmPanel — в базовой валюте игры), курс — exalted за divine из
// «Богатства PoE 2». Главная цифра — в div, пока доход меньше 1 div в час — в ex. Входа не нужно: богатство PoE 2
// вводит игрок (снимок вкладок, ручной ввод) — вместо «нужен вход» подсказка обновить богатство в конце.

/** Меньше 5 минут сессии «в час» не считаем — одна находка дала бы бессмысленные тысячи. */
const MIN_ACTIVE_MS = 5 * 60_000

export function Poe2IncomeTile({ profitChaos: profitEx, activeMs, pending }: IncomeTileProps) {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const rate = usePoe2WealthStore((s) => s.state?.exPerDivine ?? null)
  const init = usePoe2WealthStore((s) => s.init)
  useEffect(() => init(), [init])

  const perH = profitEx !== null && activeMs >= MIN_ACTIVE_MS ? (profitEx * 3_600_000) / activeMs : null
  let hero: string
  let sub: string
  if (perH === null) {
    hero = pending || profitEx === null ? t('wealth.income.counting') : '—'
    sub = pending ? t('wealth.p2.income.update') : t('wealth.income.short')
  } else if (rate && Math.abs(perH / rate) >= 1) {
    hero = `${df(perH / rate, lang)} div`
    sub = t('wealth.p2.income.exPerHour', { n: nf(perH, lang) })
  } else {
    hero = `${nf(perH, lang)} ex`
    sub = rate ? `≈ ${df(perH / rate, lang, 2)} div` : t('wealth.income.perHour')
  }
  return (
    <div className="ui-stat ui-stat--hero">
      <span className="ui-label">{t('wealth.income')}</span>
      <b className="ui-stat__value">{hero}</b>
      <span className="ui-stat__sub">{sub}</span>
    </div>
  )
}
