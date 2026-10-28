import { useCallback, useEffect, useMemo } from 'react'
import type { FlipFilters, FlipRoute, FlipState } from '@shared/types'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useFlipStore } from './flip/useFlipStore'
import { useNameOf } from './wealth/names'
import { FIco } from './flip/ui'
import { RateBox } from './flip/RateBox'
import { Opportunities } from './flip/Opportunities'
import { HowCard } from './flip/HowCard'
import { clock, itemNs } from './flip/format'
import { hiddenByTrend, pickRoute, visibleRoutes, type ViewBase } from './flip/view'
import './flip/flip.css'

// Вкладка «Обмен» (PoE1, S13) по утверждённому макету «Обмен» v2: помощник по флиппингу валюты у Фаустуса по
// почасовому фиду биржи GGG. Слева — заголовок со свежестью данных, дисклеймер и фильтры, справа — курс
// divine : chaos с коридором; ниже — таблица возможностей и карточка «как сделать» по выбранной строке.
// Только оценка по прошлому часу: ордера игрок ставит сам, никаких авто-ордеров и опроса трейда.

type T = ReturnType<typeof useT>

function freshText(s: FlipState, t: T, lang: string): string {
  if (!s.lastHour) return t(s.loading ? 'flip.fresh.loading' : 'flip.fresh.none')
  const hours = `${clock(s.lastHour, lang)}–${clock(s.lastHour + 3_600_000, lang)}`
  if (s.problem) return t('flip.fresh.stale', { hours })
  const next = s.nextUpdateAt ? ` · ${t('flip.fresh.next', { at: clock(s.nextUpdateAt, lang) })}` : ''
  return `${t('flip.fresh', { hours })}${next}`
}

/** Порог эксперта: число на языке интерфейса, применяется по Enter или уходу фокуса. */
function Threshold({ k, scale = 1, s, lang }: { k: keyof FlipFilters; scale?: number; s: FlipState; lang: string }) {
  const t = useT()
  const setFilters = useFlipStore((st) => st.setFilters)
  const v = Math.round(s.filters[k] * scale * 100) / 100
  const shown = v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { useGrouping: false, maximumFractionDigits: 2 })
  return (
    <input
      key={shown}
      className="ui-input ui-input--num"
      inputMode="decimal"
      defaultValue={shown}
      aria-label={t(`flip.f.${k}`)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={(e) => {
        const n = Number(e.currentTarget.value.replace(',', '.'))
        if (Number.isFinite(n) && n >= 0 && n !== v) void setFilters({ [k]: n / scale })
        else e.currentTarget.value = shown
      }}
    />
  )
}

function Filters({ s, lang, expert, hidden }: { s: FlipState; lang: string; expert: boolean; hidden: number }) {
  const t = useT()
  const view = useFlipStore((st) => st.view)
  const setView = useFlipStore((st) => st.setView)
  const h = t('flip.h')
  return (
    <div className="fx-filters">
      <div className="ui-chips">
        <span className="ui-label">{t('flip.base')}</span>
        <div className="ui-seg" role="group" aria-label={t('flip.base')}>
          {(['chaos', 'divine', 'all'] as ViewBase[]).map((b) => (
            <button key={b} type="button" aria-pressed={view.base === b} onClick={() => setView({ base: b })}>
              {t(`flip.base.${b}`)}
            </button>
          ))}
        </div>
        <button type="button" className="ui-chip" aria-pressed={view.sure} title={t('flip.sure.title')} onClick={() => setView({ sure: !view.sure })}>
          {t('flip.sure')}
        </button>
        <button type="button" className="ui-chip" aria-pressed={view.noTrend} title={t('flip.noTrend.title')} onClick={() => setView({ noTrend: !view.noTrend })}>
          {t('flip.noTrend')}
          {hidden > 0 && ` · ${t('flip.noTrend.hidden', { n: hidden })}`}
        </button>
        <input
          className="ui-input fx-search"
          type="search"
          value={view.q}
          placeholder={t('flip.search')}
          aria-label={t('flip.search')}
          onChange={(e) => setView({ q: e.target.value })}
        />
      </div>
      {expert && (
        <div className="ui-chips">
          <span className="ui-label">{t('flip.limits')}</span>
          <label className="fx-num">
            {t('flip.f.liq')}
            <Threshold k="minLiquidityDiv" s={s} lang={lang} /> div/{h}
          </label>
          <label className="fx-num">
            {t('flip.f.spread')}
            <Threshold k="minSpread" scale={100} s={s} lang={lang} />–<Threshold k="maxSpread" scale={100} s={s} lang={lang} />%
          </label>
          <label className="fx-num">
            {t('flip.f.active')}
            <Threshold k="minActiveHours" s={s} lang={lang} />
            /24 {h}
          </label>
          <label className="fx-num">
            {t('flip.f.vol')}
            <Threshold k="maxVolatility" s={s} lang={lang} />
          </label>
          <label className="fx-num">
            {t('flip.f.budget')}
            <Threshold k="budgetDiv" s={s} lang={lang} /> div
          </label>
        </div>
      )}
    </div>
  )
}

export function FlipTab() {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const expert = !useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const s = useFlipStore((st) => st.state)
  const view = useFlipStore((st) => st.view)
  const selected = useFlipStore((st) => st.selected)
  const init = useFlipStore((st) => st.init)
  const nameOfItem = useNameOf(lang)
  // карты Таро — в DIVINATION_CARD, но «колода» и прочее из той же папки — обычные предметы
  const nameOf = useCallback(
    (r: FlipRoute): string => {
      const ns = itemNs(r)
      const n = nameOfItem({ name: r.name, ns })
      return n === r.name && ns !== 'ITEM' ? nameOfItem({ name: r.name, ns: 'ITEM' }) : n
    },
    [nameOfItem]
  )

  useEffect(() => init(), [init])

  const rows = useMemo(() => (s ? visibleRoutes(s.routes, view, nameOf) : []), [s, view, nameOf])

  if (!s) return <div className="flip-tab" />
  if (!s.supported) {
    return (
      <div className="flip-tab">
        <div className="ui-empty">{t('flip.unsupported')}</div>
      </div>
    )
  }
  const route = pickRoute(rows, selected)

  return (
    <div className="flip-tab ui-scroll">
      <div className="fx-pad">
        <div className="fx-top">
          <div className="fx-intro">
            <div className="fx-title">
              <h3>{t('flip.title')}</h3>
              <span className="fx-fresh">
                <FIco name="history" size="sm" />
                {freshText(s, t, lang)}
              </span>
            </div>
            <div className="ui-banner ui-banner--info fx-banner" role="note">
              <FIco name="info" />
              <span>
                <b>{t('flip.disclaimer.title')}</b> {t('flip.disclaimer')}
              </span>
              <span />
            </div>
            <Filters s={s} lang={lang} expert={expert} hidden={hiddenByTrend(s.routes, view)} />
            {!expert && (
              <div className="ui-hint fx-hint">
                <FIco name="help" />
                <span>{t('flip.hint')}</span>
              </div>
            )}
          </div>
          <RateBox s={s} lang={lang} />
        </div>
        <Opportunities s={s} rows={rows} selected={route?.id ?? null} lang={lang} expert={expert} nameOf={nameOf} />
        {route && !(s.loading && !s.lastHour) && (
          <HowCard r={route} name={nameOf(route)} lang={lang} expert={expert} divine={s.divine?.current ?? 0} />
        )}
      </div>
    </div>
  )
}
