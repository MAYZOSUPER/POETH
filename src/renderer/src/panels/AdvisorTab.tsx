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
import { Editor } from './advisor/Editor'
import { ShareDialog } from './advisor/ShareDialog'
import { ImportDialog } from './advisor/ImportDialog'
import { SOURCE_FILTERS, buildRows, sourceCounts, type AdvisorSort } from './advisor/view'
import './advisor/advisor.css'

// Вкладка «Что фармить» (PoE 1, S16) — советник для новичков: карточки стратегий фарма с оценкой дохода в час
// по ценам биржи GGG (индекс учёта богатства) и времени карты из трекера карт, сложностью и тем, что нужно
// билду; раскрытие — что вложить и что получите, шаги, термины и «Мой результат» по сессиям фарма.
// S17: стратегии игроков — «Новая стратегия» (редактор), «Импорт» по коду или ссылке, «Поделиться», фильтр
// источника (наши, сообщество, мои, импорт). Код из буфера можно вставить Ctrl+V прямо во вкладку.
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

function Controls({ busy, counts }: { busy: boolean; counts: ReturnType<typeof sourceCounts> }) {
  const t = useT()
  const view = useAdvisorStore((st) => st.view)
  const setView = useAdvisorStore((st) => st.setView)
  const refresh = useAdvisorStore((st) => st.refresh)
  return (
    <>
      <div className="ui-chips">
        <span className="ui-label">{t('advisor.sort')}</span>
        <div className="ui-seg" role="group" aria-label={t('advisor.sort')}>
          {(['profit', 'easy', 'cost'] as AdvisorSort[]).map((k) => (
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
      <div className="ui-chips">
        <span className="ui-label">{t('advisor.srcFilter')}</span>
        {SOURCE_FILTERS.map((f) => (
          <button key={f} type="button" className="ui-chip" aria-pressed={view.src === f} onClick={() => setView({ src: f })}>
            {t(`advisor.srcFilter.${f}`)} <span className="ad-chip-n">{counts[f]}</span>
          </button>
        ))}
      </div>
    </>
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
  const draft = useAdvisorStore((st) => st.draft)
  const dialog = useAdvisorStore((st) => st.dialog)
  const newStrategy = useAdvisorStore((st) => st.newStrategy)
  const openImport = useAdvisorStore((st) => st.openImport)
  const setView = useAdvisorStore((st) => st.setView)
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
  // раскрытая карточка (после импорта или сохранения) — прокрутить к ней
  useEffect(() => {
    if (!open || draft) return
    requestAnimationFrame(() => document.getElementById(`ad-card-${open}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [open, draft])
  // код в буфере — Ctrl+V прямо во вкладку (не в поле ввода) открывает «Импорт»
  useEffect(() => {
    if (!s?.enabled || draft || dialog) return
    const onPaste = (e: ClipboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (/POETH\d/i.test(text)) openImport(text)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [s?.enabled, draft, dialog, openImport])

  const rows = useMemo(() => (s ? buildRows(s.views, farm, view) : []), [s, farm, view])
  const counts = useMemo(() => sourceCounts(s?.views ?? []), [s])

  if (!s) return <div className="advisor-tab" />
  if (!s.supported || !s.enabled) {
    return (
      <div className="advisor-tab">
        <div className="ui-empty">{t('advisor.unsupported')}</div>
      </div>
    )
  }

  const dialogs = dialog && (
    <>
      {dialog.kind === 'share' && <ShareDialog id={dialog.id} lang={lang} expert={expert} />}
      {dialog.kind === 'import' && (
        <ImportDialog initial={dialog.text} lang={lang} expert={expert} farm={farm} currentPatch={s.data?.patch ?? null} nameOf={nameOf} />
      )}
    </>
  )

  if (draft) {
    return (
      <div className="ad-host">
        <div className="advisor-tab ui-scroll">
          <Editor state={s} lang={lang} expert={expert} farm={farm} nameOf={nameOf} />
        </div>
        {dialogs}
      </div>
    )
  }

  const filtered = view.src !== 'all' || view.easyOnly
  return (
    <div className="ad-host">
      <div className="advisor-tab ui-scroll">
        <div className="ad-pad">
          <div className="ad-title">
            <h3>{t('advisor.title')}</h3>
            <span className="ad-fresh">
              <AIco name="history" size="sm" />
              {freshText(s, t, lang)}
            </span>
            <span className="grow" />
            <button type="button" className="ui-btn" onClick={() => openImport()}>
              <AIco name="import" />
              {t('advisor.import')}
            </button>
            <button type="button" className="ui-btn" onClick={() => void newStrategy(lang === 'ru' ? 'ru' : 'en')}>
              <AIco name="plus" />
              {t('advisor.new')}
            </button>
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
          <Controls busy={busy || s.loading} counts={counts} />
          {!expert && (
            <div className="ui-hint ad-hint">
              <AIco name="help" />
              <span>{t('advisor.hint')}</span>
            </div>
          )}
          {s.invalid > 0 && <p className="ad-muted">{t('advisor.invalid', { n: s.invalid })}</p>}
          {!s.views.length && !s.loading && <div className="ui-empty">{t('advisor.empty')}</div>}
          {s.views.length > 0 && !rows.length && (
            <div className="ui-empty">
              <img className="ad-empty-img" src="poeth://brand/empty-route.svg" alt="" />
              {view.src === 'mine' ? (
                <>
                  <span className="ui-empty__title">{t('advisor.empty.mine')}</span>
                  <span className="ad-measure">{t('advisor.empty.mine.text')}</span>
                  <div className="ad-row ad-row--center">
                    <button type="button" className="ui-btn ui-btn--primary" onClick={() => void newStrategy(lang === 'ru' ? 'ru' : 'en')}>
                      <AIco name="plus" />
                      {t('advisor.new')}
                    </button>
                    <button type="button" className="ui-btn" onClick={() => openImport()}>
                      <AIco name="import" />
                      {t('advisor.import')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="ui-empty__title">{t('advisor.empty.filter')}</span>
                  {filtered && (
                    <button type="button" className="ui-btn" onClick={() => setView({ src: 'all', easyOnly: false })}>
                      {t('advisor.resetFilters')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <div className="ad-list-cards">
            {rows.map((row) => (
              <div key={`${row.strategy.source.kind}:${row.strategy.id}`} id={`ad-card-${row.strategy.id}`}>
                <StrategyCard
                  row={row}
                  lang={lang}
                  expert={expert}
                  open={open === row.strategy.id}
                  farm={farm}
                  glossary={s.data?.glossary ?? {}}
                  currentPatch={s.data?.patch ?? null}
                  nameOf={nameOf}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {dialogs}
    </div>
  )
}
