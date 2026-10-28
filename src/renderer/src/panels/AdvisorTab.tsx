import { useEffect, useMemo } from 'react'
import type { AdvisorState } from '@shared/types'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useAdvisorStore } from '../store/useAdvisorStore'
import { useFarmStore } from '../store/useFarmStore'
import { useNameOf } from './wealth/names'
import { clock } from './flip/format'
import { AIco } from './advisor/ui'
import { StrategyCard } from './advisor/StrategyCard'
import { buildRows, type AdvisorSort } from './advisor/view'
import './advisor/advisor.css'

// Вкладка «Что фармить» (PoE 1, S16) — советник для новичков: карточки стратегий фарма с оценкой дохода в час
// по ценам биржи GGG (индекс учёта богатства) и времени карты из трекера карт, сложностью и тем, что нужно
// билду; раскрытие — что вложить и что получите, шаги, термины и «Мой результат» по сессиям фарма.
// В v0.1.0 скрыта (features.advisor = false), в разработке — POETH_ADVISOR=1. Только подсказки.

type T = ReturnType<typeof useT>

function freshText(s: AdvisorState, t: T, lang: string): string {
  if (s.loading && s.at === null) return t('advisor.prices.loading')
  const hour = s.prices?.exchangeHour
  if (!hour) return t('advisor.prices.none')
  const base = t('advisor.prices', { hours: `${clock(hour, lang)}–${clock(hour + 3_600_000, lang)}` })
  const pw = s.prices && s.prices.poeWatchItems > 0 ? ` ${t('advisor.prices.poewatch')}` : ''
  const stale = s.problem === 'prices' ? ` · ${t('advisor.prices.stale')}` : ''
  return `${base}${pw}${stale}`
}

function Controls({ busy }: { busy: boolean }) {
  const t = useT()
  const view = useAdvisorStore((st) => st.view)
  const setView = useAdvisorStore((st) => st.setView)
  const refresh = useAdvisorStore((st) => st.refresh)
  return (
    <div className="ui-chips">
      <span className="ui-label">{t('advisor.sort')}</span>
      <div className="ui-seg" role="group" aria-label={t('advisor.sort')}>
        {(['profit', 'easy'] as AdvisorSort[]).map((k) => (
          <button key={k} type="button" aria-pressed={view.sort === k} onClick={() => setView({ sort: k })}>
            {t(`advisor.sort.${k}`)}
          </button>
        ))}
      </div>
      <button type="button" className="ui-chip" aria-pressed={view.easyOnly} onClick={() => setView({ easyOnly: !view.easyOnly })}>
        {t('advisor.easyOnly')}
      </button>
      <span className="ui-label__grow" />
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--sm"
        title={t('advisor.refresh.title')}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void refresh()}
      >
        <AIco name="refresh" size="sm" />
        {t('advisor.refresh')}
      </button>
    </div>
  )
}

export function AdvisorTab() {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const expert = !useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const s = useAdvisorStore((st) => st.state)
  const busy = useAdvisorStore((st) => st.busy)
  const view = useAdvisorStore((st) => st.view)
  const open = useAdvisorStore((st) => st.open)
  const init = useAdvisorStore((st) => st.init)
  const farm = useFarmStore((st) => st.state)
  const initFarm = useFarmStore((st) => st.init)
  const nameOf = useNameOf(lang)

  useEffect(() => init(), [init])
  // трекер карт: время карты и «Мой результат» (одна подписка на окно)
  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void initFarm().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [initFarm])

  const rows = useMemo(() => (s ? buildRows(s.views, farm, view) : []), [s, farm, view])

  if (!s) return <div className="advisor-tab" />
  if (!s.supported || !s.enabled) {
    return (
      <div className="advisor-tab">
        <div className="ui-empty">{t('advisor.unsupported')}</div>
      </div>
    )
  }

  return (
    <div className="advisor-tab ui-scroll">
      <div className="ad-pad">
        <div className="ad-title">
          <h3>{t('advisor.title')}</h3>
          <span className="ad-fresh">
            <AIco name="history" size="sm" />
            {freshText(s, t, lang)}
          </span>
        </div>
        <div className="ui-banner ui-banner--info ad-banner" role="note">
          <AIco name="info" />
          <span>
            <b>{t('advisor.disclaimer.title')}</b> {t('advisor.disclaimer')}
          </span>
          <span />
        </div>
        {s.data?.draft && (
          <div className="ui-banner ad-banner ad-warn" role="note">
            <AIco name="warn" />
            <span>
              <b>{t('advisor.draft.title', { patch: s.data.patch })}</b> {t('advisor.draft')}
            </span>
            <span />
          </div>
        )}
        <Controls busy={busy || s.loading} />
        {!expert && (
          <div className="ui-hint ad-hint">
            <AIco name="help" />
            <span>{t('advisor.hint')}</span>
          </div>
        )}
        {s.invalid > 0 && <p className="ad-muted">{t('advisor.invalid', { n: s.invalid })}</p>}
        {!s.views.length && !s.loading && <div className="ui-empty">{t('advisor.empty')}</div>}
        {s.views.length > 0 && !rows.length && <div className="ui-empty">{t('advisor.empty.filter')}</div>}
        <div className="ad-list-cards">
          {rows.map((row) => (
            <StrategyCard
              key={row.strategy.id}
              row={row}
              lang={lang}
              expert={expert}
              open={open === row.strategy.id}
              farm={farm}
              glossary={s.data?.glossary ?? {}}
              nameOf={nameOf}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
