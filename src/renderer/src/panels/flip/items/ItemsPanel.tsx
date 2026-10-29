import { useEffect } from 'react'
import type { ItemFlipState, UiLang } from '@shared/types'
import { useT } from '../../../i18n'
import { Currency } from '../../../components/Currency'
import { useItemsStore, type ItemsMode } from './useItemsStore'
import { DealsView } from './DealsView'
import { TiersView } from './TiersView'
import { SixLinkView } from './SixLinkView'
import { IIco } from './ui'
import './items.css'

// Подвкладка «Обмен → Предметы» (S33, скрыта флагом): уники PoE 1 по снимку poe.ninja (раз в час, ветка `prices` —
// к poe.ninja ходит CI, а не приложение). Три вида: «Недооценённые» (проверка на трейде по клику и live search),
// «Тиры» (не продавай торговцу) и «6L против без связей». Вид — как у валютного «Обмена» (fx-*, ui-*).

const MODES: ItemsMode[] = ['deals', 'tiers', 'six']
const STALE_MS = 3 * 60 * 60_000

const clock = (ms: number, lang: string): string =>
  new Date(ms).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** «Валюта / Предметы» над содержимым «Обмена». */
export function FlipSubTabs() {
  const t = useT()
  const sub = useItemsStore((st) => st.sub)
  const setSub = useItemsStore((st) => st.setSub)
  return (
    <div className="ui-tabs fi-subtabs" role="tablist" aria-label={t('flip.items.sub')}>
      {(['currency', 'items'] as const).map((id) => (
        <button key={id} type="button" className="ui-tab" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}>
          <IIco name={id === 'currency' ? 'swap' : 'star'} />
          {t(`flip.items.sub.${id}`)}
          {id === 'items' && <span className="ui-tag fi-beta">{t('flip.items.beta')}</span>}
        </button>
      ))}
    </div>
  )
}

function Fresh({ s, lang }: { s: ItemFlipState; lang: string }) {
  const t = useT()
  if (!s.at) return <span className="fx-fresh">{t(s.loading ? 'flip.items.fresh.loading' : 'flip.items.fresh.none')}</span>
  const stale = s.problem === 'net' || Date.now() - s.at > STALE_MS
  const next = s.nextAt && !stale ? ` · ${t('flip.fresh.next', { at: clock(s.nextAt, lang) })}` : ''
  return (
    <span className="fx-fresh">
      <IIco name="history" size="sm" />
      {t(stale ? 'flip.items.fresh.stale' : 'flip.items.fresh', { at: clock(s.at, lang) })}
      {next}
    </span>
  )
}

function RatesBox({ s, lang }: { s: ItemFlipState; lang: UiLang }) {
  const t = useT()
  const busy = useItemsStore((st) => st.busy)
  const refresh = useItemsStore((st) => st.refresh)
  // дешёвые сферы (Jeweller's ≈ 0,019 c) — три знака, иначе «0,02»
  const n = (v: number, d = v < 0.1 ? 3 : 2): string => v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: d })
  return (
    <div className="ui-box fi-rates">
      <div className="ui-box__head">
        <span className="ui-label">{t('flip.items.rates')}</span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={busy || s.loading} title={t('flip.items.refresh.help')} onClick={() => void refresh()}>
          <IIco name="refresh" size="sm" />
          {t('flip.items.refresh')}
        </button>
      </div>
      <div className="ui-box__body fx-kv">
        <span>{t('flip.items.rates.divine')}</span>
        <b>{s.divine > 0 ? <Currency tag="chaos" text={n(s.divine, 0)} lang={lang} /> : '—'}</b>
        <span>{t('flip.items.rates.fusing')}</span>
        <b>{s.fusing !== null ? <Currency tag="chaos" text={n(s.fusing)} lang={lang} /> : '—'}</b>
        <span>{t('flip.items.rates.jewellers')}</span>
        <b>{s.jewellers !== null ? <Currency tag="chaos" text={n(s.jewellers)} lang={lang} /> : '—'}</b>
        <span>{t('flip.items.rates.count')}</span>
        <b>{s.rows.length || '—'}</b>
      </div>
    </div>
  )
}

export function ItemsPanel({ lang, expert }: { lang: UiLang; expert: boolean }) {
  const t = useT()
  const s = useItemsStore((st) => st.state)
  const mode = useItemsStore((st) => st.mode)
  const setView = useItemsStore((st) => st.setView)
  const init = useItemsStore((st) => st.init)
  const refresh = useItemsStore((st) => st.refresh)
  const busy = useItemsStore((st) => st.busy)
  useEffect(() => init(), [init])

  if (!s) return null
  if (!s.supported) return <div className="ui-empty">{t('flip.unsupported')}</div>

  return (
    <>
      <div className="fx-top">
        <div className="fx-intro">
          <div className="fx-title">
            <h3>{t('flip.items.title')}</h3>
            <Fresh s={s} lang={lang} />
          </div>
          <div className="ui-banner ui-banner--info fx-banner" role="note">
            <IIco name="info" />
            <span>
              <b>{t('flip.items.disclaimer.title')}</b> {t('flip.items.disclaimer')}
            </span>
            <span />
          </div>
          <div className="ui-seg fi-modes" role="group" aria-label={t('flip.items.mode')}>
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} title={t(`flip.items.mode.${m}.help`)} onClick={() => setView({ mode: m })}>
                {t(`flip.items.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>
        <RatesBox s={s} lang={lang} />
      </div>
      {s.problem === 'missing' && (
        <div className="ui-banner fx-warn" role="note">
          <IIco name="warn" />
          <span>{t('flip.items.err.missing', { league: s.league ?? '—' })}</span>
        </div>
      )}
      {s.problem === 'net' && (
        <div className="ui-banner ui-banner--bad" role="alert">
          <IIco name="warn" />
          <span>{t(s.rows.length ? 'flip.items.err.cached' : 'flip.items.err.netEmpty')}</span>
          <button type="button" className="ui-btn ui-btn--sm" disabled={busy || s.loading} onClick={() => void refresh()}>
            <IIco name="refresh" size="sm" />
            {t('flip.retry')}
          </button>
        </div>
      )}
      {!s.league && (
        <div className="ui-empty fx-empty">
          <span className="ui-empty__title">{t('flip.items.noLeague')}</span>
        </div>
      )}
      {s.loading && !s.rows.length ? (
        <div className="ui-box">
          <div className="ui-box__head">
            <span className="ui-label">{t('flip.items.fresh.loading')}</span>
          </div>
          <div className="ui-box__body fi-skel">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className="ui-skeleton" />
            ))}
          </div>
        </div>
      ) : s.rows.length ? (
        mode === 'deals' ? (
          <DealsView s={s} lang={lang} expert={expert} />
        ) : mode === 'tiers' ? (
          <TiersView s={s} lang={lang} expert={expert} />
        ) : (
          <SixLinkView s={s} lang={lang} expert={expert} />
        )
      ) : null}
    </>
  )
}
