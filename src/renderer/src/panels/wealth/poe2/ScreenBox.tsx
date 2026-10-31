import type { Poe2ScreenCardTab, Poe2ScreenLine, Poe2WealthState, UiLang } from '@shared/types'
import { cardTotal, needsCheck } from '@shared/wealth/poe2'
import { useT } from '../../../i18n'
import { tKey } from '../../../i18n/hotkey'
import { WIco } from '../ui'
import { ago } from '../format'
import { usePoe2WealthStore } from './usePoe2WealthStore'
import { ItemIcon } from './ItemIcon'
import { usePoe2Item } from './names'
import { money, tabsCount, unitEx } from './money'
import { QtyInput } from './QtyInput'

// «Снимок вкладки» (S70, W4): клавиша в игре → main читает открытую особую вкладку (модуль S68) → здесь карточка:
// строки с иконками и числами, «проверьте» у неуверенных, правка числа и выбор уровня у одинаковых по рисунку,
// «Принять» / «Переснять». Без сеанса — как снять и принятые вкладки с давностью (старше суток — серым).

type T = ReturnType<typeof useT>

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

function CardLine({ tab, line, lang, rate }: { tab: Poe2ScreenCardTab; line: Poe2ScreenLine; lang: UiLang; rate: number | null }) {
  const t = useT()
  const edit = usePoe2WealthStore((s) => s.screenEdit)
  const item = usePoe2Item(lang)
  const view = item(line.name)
  const check = needsCheck(line)
  const value = line.unit !== undefined && line.qty !== null ? money(line.unit * line.qty, rate, lang).main : null
  return (
    <tr className={check ? 'w2-check' : undefined}>
      <td>
        <span className="w2-item">
          <ItemIcon icon={view.icon} />
          {line.alt?.length ? (
            <select
              className="ui-select w2-alt"
              aria-label={t('wealth.p2.screen.altHint')}
              title={t('wealth.p2.screen.altHint')}
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
            <span className="ui-item ui-item--currency">{view.name}</span>
          )}
          {check && (
            <span className="ui-tag ui-tag--warn" title={t(line.alt?.length ? 'wealth.p2.screen.altHint' : 'wealth.p2.screen.checkHint')}>
              {t('wealth.p2.screen.check')}
            </span>
          )}
        </span>
      </td>
      <td className="is-num">
        <QtyInput value={line.qty} label={t('wealth.p2.manual.qty', { name: view.name })} onCommit={(n) => void edit(tab.id, line.key, { qty: n })} />
      </td>
      <td className="is-num w2-faint">{line.unit !== undefined ? unitEx(line.unit, lang) : t('wealth.p2.screen.noPrice')}</td>
      <td className="is-num">{value ?? '—'}</td>
    </tr>
  )
}

function CardTab({ tab, lang, rate, busy }: { tab: Poe2ScreenCardTab; lang: UiLang; rate: number | null; busy: boolean }) {
  const t = useT()
  const drop = usePoe2WealthStore((s) => s.screenDrop)
  const total = cardTotal(tab)
  return (
    <div className="w2-cardtab">
      <div className="w2-row">
        <b>{layoutName(t, tab.layout)}</b>
        <span className="w2-faint">{t('wealth.p2.screen.tabTotal', { v: money(total.ex, rate, lang).main })}</span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={busy} title={t('wealth.p2.screen.retakeHint')} onClick={() => void drop(tab.id)}>
          <WIco name="refresh" />
          {t('wealth.p2.screen.retake')}
        </button>
      </div>
      <div className="w2-table">
        <table className="ui-table">
          <tbody>
            {tab.lines.map((l) => (
              <CardLine key={l.key} tab={tab} line={l} lang={lang} rate={rate} />
            ))}
          </tbody>
        </table>
      </div>
      {(tab.unknown > 0 || total.uncounted > 0) && (
        <p className="wl-note">
          <WIco name="info" size="sm" />
          {[tab.unknown ? t('wealth.p2.screen.unknown', { n: tab.unknown }) : '', total.uncounted ? t('wealth.p2.screen.uncounted', { n: total.uncounted }) : '']
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
    </div>
  )
}

export function ScreenBox({ s, lang, now, hotkey }: { s: Poe2WealthState; lang: UiLang; now: number; hotkey?: string }) {
  const t = useT()
  const accept = usePoe2WealthStore((st) => st.screenAccept)
  const drop = usePoe2WealthStore((st) => st.screenDrop)
  const removeTab = usePoe2WealthStore((st) => st.removeTab)
  const session = s.screen
  const rate = s.exPerDivine
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="grid" size="sm" />
          {t('wealth.p2.screen')}
        </span>
        <span className="ui-label__grow" />
        {session?.busy && <span className="w2-faint">{t('wealth.p2.screen.busy')}</span>}
      </div>
      <div className="ui-box__body w2-stack">
        {session?.fail && (
          <div className="ui-banner ui-banner--bad" role="status">
            <WIco name="warn" />
            <span>{t(`wealth.p2.screen.fail.${session.fail}`)}</span>
          </div>
        )}
        {session && session.tabs.length > 0 ? (
          <>
            <span className="ui-label">{t('wealth.p2.screen.card')}</span>
            {session.tabs.map((tab) => (
              <CardTab key={tab.id} tab={tab} lang={lang} rate={rate} busy={!!session.busy} />
            ))}
            <p className="wl-note">{tKey(t, 'wealth.p2.screen.more', hotkey)}</p>
            <div className="wl-btns">
              <button type="button" className="ui-btn ui-btn--primary" disabled={!!session.busy} onClick={() => void accept()}>
                <WIco name="check" />
                {t('wealth.p2.screen.accept')}
              </button>
              <button type="button" className="ui-btn ui-btn--ghost" disabled={!!session.busy} onClick={() => void drop()}>
                {t('wealth.p2.screen.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <span>{tKey(t, 'wealth.p2.screen.how', hotkey)}</span>
            {session && !session.busy && (
              <div className="wl-btns">
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => void drop()}>
                  {t('wealth.p2.screen.cancel')}
                </button>
              </div>
            )}
          </>
        )}
        <p className="wl-note">
          <WIco name="shield" size="sm" />
          {t('wealth.p2.screen.private')}
        </p>
        {s.screenTabs.length > 0 && (
          <div className="w2-stack">
            <span className="ui-label">
              {t('wealth.p2.screen.accepted')} · {tabsCount(t, s.screenTabs.length, lang)}
            </span>
            {s.screenTabs.map((x) => (
              <div key={x.id} className={`w2-row w2-src${x.stale ? ' is-stale' : ''}`} title={x.stale ? t('wealth.p2.src.stale') : undefined}>
                <b>{layoutName(t, x.layout)}</b>
                <span className="w2-faint">
                  {ago(t, x.at, now)} · {t('wealth.p2.screen.items', { n: x.items })}
                </span>
                <span className="ui-label__grow" />
                <span className="w2-num">{money(x.ex, rate, lang).main}</span>
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" title={t('wealth.p2.screen.remove')} aria-label={t('wealth.p2.screen.remove')} onClick={() => void removeTab(x.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
