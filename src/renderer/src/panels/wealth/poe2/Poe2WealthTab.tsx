import { useEffect, useState } from 'react'
import type { Poe2ManualRow, Poe2WealthState, UiLang } from '@shared/types'
import { useT } from '../../../i18n'
import { tKey } from '../../../i18n/hotkey'
import { useAppStore } from '../../../store/useAppStore'
import { useFarmStore } from '../../../store/useFarmStore'
import { CoinIcon } from '../../../components/Currency'
import { FarmPanel } from '../../farm/FarmPanel'
import { sessionMs } from '../../farm/format'
import { WealthChart } from '../Chart'
import { WIco } from '../ui'
import { ago, clock, nf, timeOf } from '../format'
import { usePoe2WealthStore } from './usePoe2WealthStore'
import { usePoe2Item } from './names'
import { ItemIcon } from './ItemIcon'
import { QtyInput } from './QtyInput'
import { ScreenBox } from './ScreenBox'
import { Poe2IncomeTile } from './Poe2IncomeTile'
import { money, signedMoney, tabsCount, unitEx } from './money'
import './poe2.css'

// Вкладка «Богатство» в режиме PoE 2 (S70, W2–W4). API тайника у PoE 2 нет: итог «≈ N div (M ex)» складывается из
// трёх источников с давностью — снимок вкладок с экрана, ввод вручную, ценные предметы из окна цены; золото —
// отдельно. История — график, как у PoE 1; прибыль сессии фарма — по снимкам (вводу) в начале и в конце, плитка
// дохода — в FarmPanel трекера карт. Черновой экран на ui-* до макета дизайнера «Богатство PoE 2».

type Sub = 'wealth' | 'session'
type T = ReturnType<typeof useT>

const START_GRACE_MS = 15 * 60_000

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Клавиша «Снимок вкладки в богатство» (действие wealthScreen; в настройках — после правки лида). */
function useScreenKey(): string | undefined {
  return useAppStore((s) => (s.settings?.hotkeys as unknown as Partial<Record<string, { accel: string }>> | undefined)?.wealthScreen?.accel)
}

function Why({ t, expert }: { t: T; expert: boolean }) {
  const [open, setOpen] = useState(!expert)
  return (
    <div className="ui-banner ui-banner--info w2-why" role="note">
      <WIco name="info" />
      <span>
        {open ? t('wealth.p2.why') : null}
        {expert && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('wealth.p2.why.title')}
          </button>
        )}
      </span>
    </div>
  )
}

function Top({ s, t, lang, now, expert }: { s: Poe2WealthState; t: T; lang: UiLang; now: number; expert: boolean }) {
  const rate = s.exPerDivine
  const m = money(s.total.ex, rate, lang)
  const empty = !s.total.ex && !s.sources.screen.tabs && !s.sources.manual.at && !s.sources.valuables.count
  let priceNote: string | null = null
  if (s.prices.loading && !rate) priceNote = t('wealth.p2.rate.loading')
  else if (!rate) priceNote = t('wealth.p2.rate.none')
  const src = (key: string, total: Poe2WealthState['sources']['manual'], meta: string | null) => (
    <div className={`w2-row w2-src${total.stale ? ' is-stale' : ''}`} title={total.stale ? t('wealth.p2.src.stale') : undefined}>
      <b>{key}</b>
      <span className="w2-faint">{meta ?? (total.at === null ? t('wealth.p2.src.empty') : ago(t, total.at, now))}</span>
      <span className="ui-label__grow" />
      <span className="w2-num">{total.at === null ? '—' : money(total.ex, rate, lang).main}</span>
    </div>
  )
  const screenMeta = s.sources.screen.at === null ? null : `${timeOf(s.sources.screen.at, lang, now - s.sources.screen.at > 20 * 3_600_000)} · ${tabsCount(t, s.sources.screen.tabs, lang)}`
  return (
    <div className="w-top">
      <div className="w-total">
        <span className="ui-label">{t('wealth.p2.total')}</span>
        {empty ? (
          <span className="w-wait">{t('wealth.p2.total.none')}</span>
        ) : (
          <div className="ui-figure">
            <span className="ui-figure__value ui-cur">
              <CoinIcon tag={rate && s.total.ex >= rate ? 'divine' : 'exalted'} lang={lang} />≈ {m.main}
            </span>
            {m.alt && <span className="ui-figure__alt">({m.alt})</span>}
          </div>
        )}
        {(s.total.approx || s.total.unpriced > 0) && (
          <span className="w-wait">
            {[s.total.approx ? t('wealth.p2.total.approx') : '', s.total.unpriced ? t('wealth.p2.total.unpriced', { n: s.total.unpriced }) : ''].filter(Boolean).join(' · ')}
          </span>
        )}
        <div className="w2-srcs">
          {src(t('wealth.p2.src.screen'), s.sources.screen, screenMeta)}
          {src(t('wealth.p2.src.manual'), s.sources.manual, null)}
          {src(t('wealth.p2.src.valuables', { n: s.sources.valuables.count }), s.sources.valuables, null)}
          <div className={`w2-row w2-src w2-gold${s.gold.stale ? ' is-stale' : ''}`} title={t('wealth.p2.gold.hint')}>
            <b>
              <CoinIcon tag="gold" lang={lang} /> {t('wealth.p2.gold')}
            </b>
            <span className="ui-label__grow" />
            <span className="w2-num">{nf(s.gold.qty, lang)}</span>
          </div>
        </div>
      </div>
      <div className="w-snap">
        {s.latest && (
          <span>
            <WIco name="history" size="sm" /> {t('wealth.p2.total.at', { ago: ago(t, s.latest.at, now) })}
          </span>
        )}
        {rate ? <span className="w-rate">{t('wealth.p2.rate', { n: nf(rate, lang) })}</span> : null}
        {expert && s.prices.feedHour ? <span className="w-rate">{t('wealth.p2.rate.ange', { t: timeOf(s.prices.feedHour + 3_600_000, lang, false) })}</span> : null}
        {expert && s.prices.ninjaAt ? (
          <span className="w-rate">
            {s.prices.ninjaLeague
              ? t('wealth.p2.rate.ninjaLeague', { league: s.prices.ninjaLeague, d: timeOf(s.prices.ninjaAt, lang, true) })
              : t('wealth.p2.rate.ninja', { d: timeOf(s.prices.ninjaAt, lang, true) })}
          </span>
        ) : null}
        {s.prices.problem && <span className="w-rate">{t('wealth.p2.rate.problem')}</span>}
        {priceNote && <span className="w-rate">{priceNote}</span>}
      </div>
    </div>
  )
}

function ManualRow({ r, lang, rate, expert }: { r: Poe2ManualRow; lang: UiLang; rate: number | null; expert: boolean }) {
  const t = useT()
  const setManual = usePoe2WealthStore((s) => s.setManual)
  const item = usePoe2Item(lang)
  const view = item(r.name)
  const set = (n: number): void => void setManual(r.name, Math.max(0, n))
  return (
    <div className="w2-manual">
      <span className="w2-item">
        {r.tag ? <CoinIcon tag={r.tag} lang={lang} /> : <ItemIcon icon={view.icon} />}
        <span className="ui-item ui-item--currency">{view.name}</span>
        {r.inScreen > 0 && (
          <span className="ui-tag" title={t('wealth.p2.manual.inScreenHint')}>
            {t('wealth.p2.manual.inScreen', { n: nf(r.inScreen, lang) })}
          </span>
        )}
      </span>
      <span className="w2-steps">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--icon" disabled={r.qty <= 0} title={t('wealth.p2.manual.dec')} aria-label={t('wealth.p2.manual.dec')} onClick={() => set(r.qty - 1)}>
          −
        </button>
        <QtyInput value={r.qty} label={t('wealth.p2.manual.qty', { name: view.name })} onCommit={set} />
        <button type="button" className="ui-btn ui-btn--sm" title={t('wealth.p2.manual.inc', { n: 1 })} onClick={() => set(r.qty + 1)}>
          +1
        </button>
        <button type="button" className="ui-btn ui-btn--sm" title={t('wealth.p2.manual.inc', { n: 10 })} onClick={() => set(r.qty + 10)}>
          +10
        </button>
      </span>
      <span className="w2-value">
        <span className="w2-num">{r.unit !== undefined && r.qty > 0 ? money(r.unit * r.qty, rate, lang).main : ''}</span>
        {(expert || r.qty > 0) && (
          <span className="w2-faint" title={r.low ? t('wealth.low') : undefined}>
            {r.unit !== undefined ? t('wealth.p2.manual.each', { v: unitEx(r.unit, lang) }) + (r.low ? ' ~' : '') : t('wealth.p2.manual.noPrice')}
          </span>
        )}
      </span>
    </div>
  )
}

function GoldRow({ s, t, lang }: { s: Poe2WealthState; t: T; lang: UiLang }) {
  const setGold = usePoe2WealthStore((st) => st.setGold)
  return (
    <div className="w2-manual">
      <span className="w2-item">
        <CoinIcon tag="gold" lang={lang} />
        <span>{t('wealth.p2.gold')}</span>
      </span>
      <span className="w2-steps">
        <QtyInput wide value={s.gold.qty} label={t('wealth.p2.manual.qty', { name: t('wealth.p2.gold') })} onCommit={(n) => void setGold(n)} />
      </span>
      <span className="w2-value w2-faint">{t('wealth.p2.gold.hint')}</span>
    </div>
  )
}

function ManualBox({ s, t, lang, expert }: { s: Poe2WealthState; t: T; lang: UiLang; expert: boolean }) {
  const groups: Array<[Poe2ManualRow['group'], string | null]> = [
    ['main', null],
    ['common', t('wealth.p2.manual.common')],
    ['extra', t('wealth.p2.manual.extra')]
  ]
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="coins" size="sm" />
          {t('wealth.p2.manual')}
        </span>
      </div>
      <div className="ui-box__body w2-stack">
        <span className="w2-faint">{t('wealth.p2.manual.hint')}</span>
        {groups.map(([g, title]) => {
          const rows = s.manual.filter((r) => r.group === g)
          if (!rows.length) return null
          return (
            <div key={g} className="w2-stack">
              {title && <span className="ui-label">{title}</span>}
              {rows.map((r) => (
                <ManualRow key={r.name} r={r} lang={lang} rate={s.exPerDivine} expert={expert} />
              ))}
            </div>
          )
        })}
        <div className="ui-divider" />
        <GoldRow s={s} t={t} lang={lang} />
      </div>
    </div>
  )
}

function ValuablesBox({ s, t, lang, now }: { s: Poe2WealthState; t: T; lang: UiLang; now: number }) {
  const remove = usePoe2WealthStore((st) => st.removeItem)
  const item = usePoe2Item(lang)
  const pcKey = useAppStore((st) => st.settings?.hotkeys.priceCheck.accel)
  const rate = s.exPerDivine
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="layers" size="sm" />
          {t('wealth.p2.val')}
        </span>
      </div>
      <div className="ui-box__body w2-stack">
        {!s.valuables.length && <span className="w2-faint">{tKey(t, 'wealth.p2.val.empty', pcKey)}</span>}
        {s.valuables.map((v) => {
          const view = item(v.name, v.kind === 'unique' ? 'UNIQUE' : v.kind === 'gem' ? 'GEM' : 'ITEM')
          const base = v.base ? item(v.base).name : null
          return (
            <div key={v.id} className={`w2-row w2-src${v.stale ? ' is-stale' : ''}`} title={v.stale ? t('wealth.p2.src.stale') : undefined}>
              <ItemIcon icon={view.icon} />
              <span className="w2-item-name">
                <span className={`ui-item${v.kind === 'unique' ? ' ui-item--unique' : v.kind === 'rare' ? ' ui-item--rare' : v.kind === 'gem' ? ' ui-item--gem' : ''}`}>
                  {v.qty > 1 ? `${v.qty} × ` : ''}
                  {view.name}
                </span>
                <span className="w2-faint">
                  {[base, t(`wealth.p2.val.src.${v.source}`), ago(t, v.at, now)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="ui-label__grow" />
              <span className="w2-num" title={v.low ? t('wealth.p2.val.low') : undefined}>
                {money(v.unit * v.qty, rate, lang).main}
                {v.low ? ' ~' : ''}
              </span>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" title={t('wealth.p2.val.remove')} aria-label={t('wealth.p2.val.remove')} onClick={() => void remove(v.id)}>
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiffBox({ s, t, lang }: { s: Poe2WealthState; t: T; lang: UiLang }) {
  const diff = usePoe2WealthStore((st) => st.diff)
  const item = usePoe2Item(lang)
  const lines = (diff?.lines ?? []).slice(0, 8)
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="history" size="sm" />
          {t('wealth.p2.diff')}
        </span>
        <span className="ui-label__grow" />
        {diff && <span className={`ui-delta ${diff.chaosDelta >= 0 ? 'ui-delta--up' : 'ui-delta--down'}`}>{signedMoney(diff.chaosDelta, s.exPerDivine, lang)}</span>}
      </div>
      <div className="ui-box__body w2-stack">
        {!lines.length && <span className="w2-faint">{t('wealth.p2.diff.none')}</span>}
        {lines.map((l) => (
          <div key={l.key} className="w2-row">
            <span className="ui-item ui-item--currency">{item(l.name, l.ns === 'UNIQUE' ? 'UNIQUE' : 'ITEM').name}</span>
            <span className="w2-faint">{l.qtyDelta > 0 ? `+${nf(l.qtyDelta, lang)}` : `−${nf(-l.qtyDelta, lang)}`}</span>
            <span className="ui-label__grow" />
            <span className={`w2-num ${l.chaosDelta >= 0 ? 'w2-good' : 'w2-bad'}`}>{signedMoney(l.chaosDelta, s.exPerDivine, lang)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionBox({ s, t, lang, now }: { s: Poe2WealthState; t: T; lang: UiLang; now: number }) {
  const ss = s.session
  const rate = s.exPerDivine
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="chart" size="sm" />
          {t('wealth.p2.session')}
        </span>
      </div>
      <div className="ui-box__body w2-stack">
        <span className="w2-faint">{t('wealth.p2.session.how')}</span>
        {!ss ? (
          <span>{t('wealth.p2.session.none')}</span>
        ) : (
          <>
            <span>{t('wealth.p2.session.start', { v: money(ss.startEx, rate, lang).main, t: timeOf(ss.startedAt, lang, now - ss.startedAt > 20 * 3_600_000) })}</span>
            {ss.stoppedAt === undefined && now - ss.startedAt < START_GRACE_MS && (
              <div className="ui-banner ui-banner--info" role="status">
                <WIco name="info" />
                <span>{t('wealth.p2.session.startGrace', { t: timeOf(ss.startedAt + START_GRACE_MS, lang, false) })}</span>
              </div>
            )}
            {ss.awaitingEnd && (
              <div className="ui-banner" role="status">
                <WIco name="warn" />
                <span>{t('wealth.p2.session.awaiting')}</span>
              </div>
            )}
            {ss.profitEx !== undefined && (
              <div className="ui-figure">
                <span className="ui-label">{t('wealth.p2.session.profit')}</span>
                <span className={`ui-figure__value ${ss.profitEx >= 0 ? 'w2-good' : 'w2-bad'}`}>{signedMoney(ss.profitEx, rate, lang)}</span>
                {ss.low && <span className="w2-faint">{t('wealth.p2.session.low')}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function Poe2WealthTab() {
  const t = useT()
  const lang = useAppStore((st) => st.settings?.uiLang ?? 'ru') as UiLang
  const expert = !(useAppStore((st) => st.settings?.ui.simpleMode ?? true))
  const s = usePoe2WealthStore((st) => st.state)
  const init = usePoe2WealthStore((st) => st.init)
  const farm = useFarmStore((st) => st.state)
  const initFarm = useFarmStore((st) => st.init)
  const hotkey = useScreenKey()
  const now = useNow()
  const [sub, setSub] = useState<'wealth' | 'session'>('wealth')

  useEffect(() => init(), [init])
  useEffect(() => {
    let off: (() => void) | null = null
    let disposed = false
    void initFarm().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [initFarm])
  // снимок вкладки по клавише — показать карточку
  useEffect(() => {
    if (s?.screen?.tabs.length) setSub('wealth')
  }, [s?.screen?.tabs.length])

  if (!s) return <div className="wealth-tab" />
  const subs: Array<[Sub, 'coins' | 'map', string]> = [
    ['wealth', 'coins', t('wealth.p2.sub.wealth')],
    ['session', 'map', t('wealth.sub.session')]
  ]
  return (
    <div className="wealth-tab">
      <div className="ui-tabs wl-subtabs" role="tablist">
        {subs.map(([id, icon, label]) => (
          <button key={id} type="button" className="ui-tab" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}>
            <WIco name={icon} />
            {label}
            {id === 'wealth' && !!s.screen?.tabs.length && <span className="ui-count">{s.screen.tabs.length}</span>}
            {id === 'session' && farm?.session && <span className="ui-count ui-count--live">{clock(sessionMs(farm, now), true).slice(0, -3)}</span>}
          </button>
        ))}
      </div>
      <div className="wl-body ui-scroll">
        {sub === 'wealth' ? (
          <div className="w-pad">
            <Why t={t} expert={expert} />
            <Top s={s} t={t} lang={lang} now={now} expert={expert} />
            <ScreenBox s={s} lang={lang} now={now} hotkey={hotkey} />
            <div className="w-grid">
              <ManualBox s={s} t={t} lang={lang} expert={expert} />
              <div className="w2-stack">
                <ValuablesBox s={s} t={t} lang={lang} now={now} />
                <DiffBox s={s} t={t} lang={lang} />
              </div>
            </div>
            <WealthChart points={s.history} lang={lang} expert={expert} unit="ex" title={t('wealth.p2.chart')} empty={t('wealth.p2.chart.empty')} />
          </div>
        ) : (
          <div className="w-pad">
            <SessionBox s={s} t={t} lang={lang} now={now} />
            <FarmPanel renderIncome={(p) => <Poe2IncomeTile {...p} />} />
          </div>
        )}
      </div>
    </div>
  )
}
