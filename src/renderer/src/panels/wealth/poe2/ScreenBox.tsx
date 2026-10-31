import { useState } from 'react'
import type { Poe2ScreenCardTab, Poe2ScreenLine, Poe2WealthState, UiLang } from '@shared/types'
import { cardTotal, needsCheck } from '@shared/wealth/poe2'
import { useT } from '../../../i18n'
import { accelText } from '../../../i18n/hotkey'
import { useAppStore } from '../../../store/useAppStore'
import { WIco } from '../ui'
import { nf, timeOf } from '../format'
import { usePoe2WealthStore } from './usePoe2WealthStore'
import { ItemIcon } from './ItemIcon'
import { usePoe2Item } from './names'
import { money } from './money'
import { QtyInput } from './QtyInput'

// Карточка «Снимок вкладки» (S70, макет «Богатство PoE 2»): Alt+F в игре → «Записать в богатство» в панели S68 →
// здесь строки вкладки с иконками и числами; неуверенное число — жёлтая строка «проверьте: N?» с полем и «верно»
// (в снимок богатства оно идёт только после правки или «верно»); «Переснять» — ещё раз Alt+F, «Принять» заменяет
// прошлый снимок этой же вкладки.

type T = ReturnType<typeof useT>

/** Строк в свёрнутом виде: самые дорогие + все «проверьте». */
const SHORT_LINES = 8

const LAYOUTS = new Set([
  'orbs',
  'essence',
  'delirium',
  'breach',
  'ritual',
  'abyss',
  'expedition',
  'tablets',
  'socketable-runes',
  'socketable-runes-2',
  'socketable-soul-cores',
  'socketable-idols',
  'socketable-5'
])

export function layoutName(t: T, layout: string | null): string {
  return t(`wealth.p2.layout.${layout && LAYOUTS.has(layout) ? layout : 'other'}`)
}

function ResRow({ tab, line, lang, rate }: { tab: Poe2ScreenCardTab; line: Poe2ScreenLine; lang: UiLang; rate: number | null }) {
  const t = useT()
  const edit = usePoe2WealthStore((s) => s.screenEdit)
  const item = usePoe2Item(lang)
  const view = item(line.name)
  const check = needsCheck(line)
  const value = line.unit !== undefined && line.qty ? money(line.unit * line.qty, rate, lang).main : '—'
  return (
    <div className={`w2-res__row${check ? ' is-check' : ''}`}>
      <ItemIcon icon={view.icon} />
      <span className="w2-res__n">
        {line.alt?.length ? (
          <select
            className="ui-select w2-alt"
            aria-label={t('wealth.p2.screen.altHint')}
            value={line.name}
            onChange={(e) => void edit(tab.id, line.key, { name: e.target.value })}
          >
            {[line.name, ...line.alt].map((n) => (
              <option key={n} value={n}>
                {item(n).name}
              </option>
            ))}
          </select>
        ) : (
          view.name
        )}
        {check && (
          <small>
            {line.alt?.length && !line.picked
              ? t('wealth.p2.screen.altHint')
              : line.qty === null
                ? t('wealth.p2.screen.noQty')
                : t('wealth.p2.screen.checkQty', { n: nf(line.qty, lang) })}
          </small>
        )}
      </span>
      <span className="w2-res__q">
        {check ? (
          <>
            <QtyInput
              value={line.qty}
              label={t('wealth.p2.manual.qty', { name: view.name })}
              onCommit={(n) => void edit(tab.id, line.key, { qty: n })}
            />
            {line.qty !== null && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                title={t('wealth.p2.screen.ok')}
                aria-label={t('wealth.p2.screen.ok')}
                onClick={() => void edit(tab.id, line.key, { qty: line.qty ?? 0, name: line.name })}
              >
                <WIco name="check" />
              </button>
            )}
          </>
        ) : (
          `×${nf(line.qty ?? 0, lang)}`
        )}
      </span>
      <span className="w2-res__v">{value}</span>
    </div>
  )
}

function Card({
  tab,
  s,
  lang,
  now,
  screenKey
}: {
  tab: Poe2ScreenCardTab
  s: Poe2WealthState
  lang: UiLang
  now: number
  screenKey: string
}) {
  const t = useT()
  const accept = usePoe2WealthStore((st) => st.screenAccept)
  const drop = usePoe2WealthStore((st) => st.screenDrop)
  const [all, setAll] = useState(false)
  const [retake, setRetake] = useState(false)
  const rate = s.exPerDivine
  const total = cardTotal(tab)
  const shown = all ? tab.lines : tab.lines.filter((l, i) => i < SHORT_LINES || needsCheck(l) || l.edited)
  const rest = tab.lines.filter((l) => !shown.includes(l))
  const restEx = rest.reduce((a, l) => a + (l.unit !== undefined && l.qty && !needsCheck(l) ? l.unit * l.qty : 0), 0)
  const prev = s.screenTabs.find((x) => x.id === tab.id)
  const m = money(total.ex, rate, lang)
  return (
    <div className="ui-panel ui-panel--flat w2-card" role="region" aria-label={t('wealth.p2.screen')}>
      <div className="ui-panel__head">
        <span className="ui-panel__title">{t('wealth.p2.screen')}</span>
        <span className="ui-badge">PoE 2</span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-label={t('wealth.p2.screen.cancel')}
          title={t('wealth.p2.screen.cancel')}
          onClick={() => void drop(tab.id)}
        >
          ×
        </button>
      </div>
      <div className="w2-card__b">
        <span className="w2-card__meta">
          <b>{layoutName(t, tab.layout)}</b>
          <span>{t('wealth.p2.screen.rows', { n: tab.lines.length, ago: timeOf(tab.at, lang, now - tab.at > 20 * 3_600_000) })}</span>
          {prev && <span>{t('wealth.p2.screen.replaces', { t: timeOf(prev.at, lang, now - prev.at > 20 * 3_600_000) })}</span>}
        </span>
        <div className="w2-res">
          {shown.map((l) => (
            <ResRow key={l.key} tab={tab} line={l} lang={lang} rate={rate} />
          ))}
          {(rest.length > 0 || tab.unknown > 0) && (
            <div className="w2-res__more">
              {[
                rest.length ? t('wealth.p2.screen.more', { n: rest.length, v: money(restEx, rate, lang).main }) : '',
                tab.unknown ? t('wealth.p2.screen.unknown', { n: tab.unknown }) : ''
              ]
                .filter(Boolean)
                .join(' · ')}
              {rest.length > 0 && (
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setAll(true)}>
                  {t('wealth.p2.screen.all')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="w2-card__sum">
          {t('wealth.p2.screen.tab')} <b>{m.main}</b>
          {m.alt && <span>{m.alt}</span>}
        </div>
        {total.check > 0 && <span className="w2-card__meta w2-warn">{t('wealth.p2.screen.pending', { n: total.check })}</span>}
        {retake && <span className="w2-card__meta">{t('wealth.p2.screen.retakeHint', { key: screenKey || 'Alt+F' })}</span>}
        <div className="w2-card__acts">
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => {
              setRetake(true)
              void drop(tab.id)
            }}
          >
            <WIco name="refresh" />
            {t('wealth.p2.screen.retake')}
          </button>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => void accept(tab.id)}>
            <WIco name="check" />
            {t('wealth.p2.screen.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Карточки вкладок, записанных из панели Alt+F и ещё не принятых. */
export function ScreenCards({ s, lang, now }: { s: Poe2WealthState; lang: UiLang; now: number }) {
  const screenKey = useScreenKey()
  if (!s.screen?.tabs.length) return null
  return (
    <div className="w2-cards">
      {s.screen.tabs.map((tab) => (
        <Card key={`${tab.id}|${tab.at}`} tab={tab} s={s} lang={lang} now={now} screenKey={screenKey} />
      ))}
    </div>
  )
}

/** Клавиша «Цены поверх окон» (S68) — ею снимается вкладка для «Богатства»; не назначена — пусто. */
export function useScreenKey(): string {
  return accelText(useAppStore((st) => st.settings?.hotkeys.screenPrices?.accel))
}
