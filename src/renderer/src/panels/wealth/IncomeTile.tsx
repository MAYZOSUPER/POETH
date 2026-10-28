import { useEffect } from 'react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useWealthStore } from './useWealthStore'
import { WIco } from './ui'
import { df, nf } from './format'

// Плитка «Доход в час» сессии фарма по макету «Богатство» v2 (w-kpi--hero). Пропсы — FarmIncomeInput
// трекера карт S11b: FarmPanel зовёт renderIncome={(p) => <IncomeTile {...p} />}. Курс divine и
// «нужен вход» — из стора учёта богатства. Главная цифра — в div (в chaos под ней), пока доход
// меньше 1 div в час — наоборот.

/** Меньше 5 минут сессии «в час» не считаем — одна находка дала бы бессмысленные тысячи. */
const MIN_ACTIVE_MS = 5 * 60_000

export interface IncomeTileProps {
  /** прибыль сессии в chaos; null — ещё нет ни одной посчитанной */
  profitChaos: number | null
  /** время сессии без пауз, мс */
  activeMs: number
  /** есть забеги, прибыль которых ещё считается */
  pending: boolean
}

export function IncomeTile({ profitChaos, activeMs, pending }: IncomeTileProps) {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const state = useWealthStore((s) => s.state)
  const init = useWealthStore((s) => s.init)
  useEffect(() => init(), [init])

  if (state && !state.loggedIn) {
    return (
      <div className="w-kpi w-kpi--hero w-kpi--need">
        <span className="ui-label">{t('wealth.income')}</span>
        <b>{t('wealth.income.need')}</b>
        <span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void window.overlayApi.auth.login()}>
            <WIco name="external" />
            {t('wealth.auth.btn')}
          </button>
        </span>
      </div>
    )
  }

  const rate = state?.latest?.divineRate || state?.prices.divineRate || 0
  const perH = profitChaos !== null && activeMs >= MIN_ACTIVE_MS ? (profitChaos * 3_600_000) / activeMs : null
  let hero: string
  let sub: string
  if (perH === null) {
    hero = pending || profitChaos === null ? t('wealth.income.counting') : '—'
    sub = t('wealth.income.short')
  } else if (rate > 0 && Math.abs(perH / rate) >= 1) {
    hero = `${df(perH / rate, lang)} div`
    sub = t('wealth.income.chaosPerHour', { n: nf(perH, lang) })
  } else {
    hero = `${nf(perH, lang)} chaos`
    sub = rate > 0 ? `≈ ${df(perH / rate, lang, 2)} div` : t('wealth.income.perHour')
  }
  return (
    <div className="w-kpi w-kpi--hero">
      <span className="ui-label">{t('wealth.income')}</span>
      <b>{hero}</b>
      <span>{sub}</span>
    </div>
  )
}
