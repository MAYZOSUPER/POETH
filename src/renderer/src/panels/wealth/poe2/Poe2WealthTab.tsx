import { useEffect, useMemo, useState } from 'react'
import type { Poe2ManualRow, Poe2SourceTotal, Poe2WealthState, UiLang } from '@shared/types'
import { useT } from '../../../i18n'
import { tKey } from '../../../i18n/hotkey'
import { useAppStore } from '../../../store/useAppStore'
import { useFarmStore } from '../../../store/useFarmStore'
import { CoinIcon, useCurrencyTable } from '../../../components/Currency'
import { useGameLang } from '../../../gameLang'
import { FarmPanel } from '../../farm/FarmPanel'
import { sessionMs } from '../../farm/format'
import { WealthChart } from '../Chart'
import { WIco, type WIcoName } from '../ui'
import { clock, df, nf, timeOf } from '../format'
import { usePoe2WealthStore } from './usePoe2WealthStore'
import { usePoe2Item } from './names'
import { ItemIcon } from './ItemIcon'
import { QtyInput } from './QtyInput'
import { layoutName, ScreenCards, useScreenKey } from './ScreenBox'
import { money, signedMoney, tabsCount } from './money'
import './poe2.css'

// Вкладка «Богатство» в режиме PoE 2 (S70) по утверждённому макету «Богатство и сессия фарма PoE 2». API тайника у
// PoE 2 нет: «Всего ≈ N div · M ex» складывается из трёх источников с давностью — снимки вкладок (Alt+F → «Записать
// в богатство»), быстрый ввод валюты, ценные предметы (Ctrl+D → «В богатство»); каждый предмет — один раз (что
// новее). Золото — отдельно. Устаревшее (старше суток) — серым с «Переснять». История — график в div.
// «Сессия фарма» — FarmPanel трекера карт (S69) + прибыль сессии по снимкам начала и конца.

type T = ReturnType<typeof useT>

const DAY_MS = 24 * 3_600_000

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** «сегодня 12:31» / «вчера 21:10» / «30.10, 19:05». */
function when(t: T, at: number, now: number, lang: UiLang): string {
  const d = new Date(at)
  const today = new Date(now)
  const hm = timeOf(at, lang, false)
  if (d.toDateString() === today.toDateString()) return t('wealth.p2.when.today', { t: hm })
  if (new Date(now - DAY_MS).toDateString() === d.toDateString()) return t('wealth.p2.when.yesterday', { t: hm })
  return timeOf(at, lang, true)
}

function Kbd({ k }: { k: string }) {
  return <span className="ui-kbd">{k}</span>
}

function Why({ t }: { t: T }) {
  return (
    <div className="ui-banner ui-banner--info w2-why" role="note">
      <WIco name="info" />
      <span>
        <b>{t('wealth.p2.why.title')}</b> {t('wealth.p2.why')}
      </span>
      <span />
    </div>
  )
}

function Top({ s, t, lang, now, expert }: { s: Poe2WealthState; t: T; lang: UiLang; now: number; expert: boolean }) {
  const rate = s.exPerDivine
  const stale = s.sources.screen.stale || s.sources.manual.stale || s.sources.valuables.stale || s.screenTabs.some((x) => x.stale)
  const div = rate ? s.total.ex / rate : null
  return (
    <div className="w-top">
      <div className="w-total">
        <span className="ui-label">
          {t('wealth.p2.total')}
          {expert && (
            <span className="ui-q" title={t('wealth.p2.why.short')}>
              ?
            </span>
          )}
        </span>
        <div className="ui-figure">
          {div !== null ? (
            <b className="ui-figure__value">
              ≈ {df(div, lang, Math.abs(div) >= 100 ? 0 : 1)}
              <small className="ui-figure__unit">div</small>
            </b>
          ) : (
            <b className="ui-figure__value">
              {nf(s.total.ex, lang)}
              <small className="ui-figure__unit">ex</small>
            </b>
          )}
          {div !== null && (
            <span className="ui-figure__alt">
              <CoinIcon tag="exalted" lang={lang} />
              {nf(s.total.ex, lang)} ex · {t('wealth.p2.atRate')}
            </span>
          )}
        </div>
        {stale ? (
          <span className="ui-figure__note">{t('wealth.p2.total.stale')}</span>
        ) : s.delta && Math.abs(s.delta.ex) >= 0.5 ? (
          <span className={`ui-delta ${s.delta.ex >= 0 ? 'ui-delta--up' : 'ui-delta--down'}`}>
            <WIco name={s.delta.ex >= 0 ? 'arrow-up' : 'arrow-down'} />
            {signedMoney(s.delta.ex, rate, lang)}{' '}
            <span>{t(now - s.delta.fromAt >= DAY_MS - 60_000 ? 'wealth.p2.delta.day' : 'wealth.p2.delta.first')}</span>
          </span>
        ) : null}
      </div>
      <div className="w-snap">
        {s.latest && (
          <span>
            <WIco name="history" size="sm" /> {t('wealth.p2.updated', { t: when(t, s.latest.at, now, lang) })}
          </span>
        )}
        {rate ? (
          <span className="w-rate">
            1 div = {nf(rate, lang)} ex
            {s.prices.feedHour ? ` · ${t('wealth.p2.rate.ange', { t: timeOf(s.prices.feedHour + 3_600_000, lang, false) })}` : ''}
          </span>
        ) : (
          <span className="w-rate">{t(s.prices.loading ? 'wealth.p2.rate.loading' : 'wealth.p2.rate.none')}</span>
        )}
        {expert && s.prices.ninjaAt ? (
          <span className="w-rate">
            {s.prices.ninjaLeague
              ? t('wealth.p2.rate.ninjaLeague', { league: s.prices.ninjaLeague, d: timeOf(s.prices.ninjaAt, lang, true) })
              : t('wealth.p2.rate.ninja', { d: timeOf(s.prices.ninjaAt, lang, true) })}
          </span>
        ) : null}
        {s.prices.problem && <span className="w-rate">{t('wealth.p2.rate.problem')}</span>}
      </div>
    </div>
  )
}

function SrcRow({
  icon,
  title,
  meta,
  total,
  rate,
  lang,
  children,
  acts
}: {
  icon: WIcoName
  title: string
  meta: string
  total: Poe2SourceTotal
  rate: number | null
  lang: UiLang
  children?: React.ReactNode
  acts?: React.ReactNode
}) {
  const m = money(total.ex, rate, lang)
  return (
    <div className={`w2-src${total.stale ? ' is-stale' : ''}`}>
      <span className="w2-src__ico">
        <WIco name={icon} />
      </span>
      <span className="w2-src__t">
        <b>{title}</b>
        <span>{meta}</span>
      </span>
      <span className="w2-src__v">
        <b>{total.at === null ? '—' : m.main}</b>
        {total.at !== null && m.alt && <small>{m.alt}</small>}
      </span>
      {children}
      {acts && <div className="w2-src__acts">{acts}</div>}
    </div>
  )
}

function Sources({ s, t, lang, now, expert }: { s: Poe2WealthState; t: T; lang: UiLang; now: number; expert: boolean }) {
  const remove = usePoe2WealthStore((st) => st.removeItem)
  const removeTab = usePoe2WealthStore((st) => st.removeTab)
  const item = usePoe2Item(lang)
  const key = useScreenKey()
  const [retake, setRetake] = useState(false)
  const rate = s.exPerDivine
  const stale = s.screenTabs.filter((x) => x.stale)
  const last = s.sources.screen.at
  const screenMeta =
    last === null
      ? t('wealth.p2.src.screen.none')
      : [
          tabsCount(t, s.screenTabs.length, lang),
          t('wealth.p2.src.last', { t: when(t, last, now, lang) }),
          stale.length ? t('wealth.p2.src.someStale', { n: stale.length }) : ''
        ]
          .filter(Boolean)
          .join(' · ')
  const manualRows = s.manual.filter((r) => r.qty > 0)
  const manualMeta =
    s.sources.manual.at === null
      ? t('wealth.p2.src.empty')
      : `${t('wealth.p2.src.rows', { n: manualRows.length })} · ${when(t, s.sources.manual.at, now, lang)}`
  const itemsMeta = s.valuables.length ? t('wealth.p2.src.items.meta') : t('wealth.p2.src.items.none')
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="layers" size="sm" />
          {t('wealth.p2.src.title')}
        </span>
      </div>
      <div className="w2-srcs">
        <SrcRow
          icon="grid"
          title={t('wealth.p2.src.screen')}
          meta={screenMeta}
          total={s.sources.screen}
          rate={rate}
          lang={lang}
          acts={
            <>
              {stale.length > 0 && (
                <button type="button" className="ui-btn ui-btn--sm" aria-expanded={retake} onClick={() => setRetake(!retake)}>
                  <WIco name="refresh" />
                  {t('wealth.p2.src.retakeStale')}
                </button>
              )}
              {key && <Kbd k={key} />}
              {(retake || !s.screenTabs.length) && <span className="w2-src__hint">{tKey(t, 'wealth.p2.src.retakeHow', key)}</span>}
            </>
          }
        >
          {!expert && s.screenTabs.length > 0 && (
            <div className="w2-sub">
              {s.screenTabs.map((x) => (
                <div key={x.id} className={x.stale ? 'is-stale' : ''}>
                  <b>{layoutName(t, x.layout)}</b>
                  <span>
                    {when(t, x.at, now, lang)}
                    {x.stale ? ` · ${t('wealth.p2.stale')}` : ''}
                  </span>
                  <span className="grow" />
                  <span>{money(x.ex, rate, lang).main}</span>
                  <button
                    type="button"
                    className="w2-x"
                    title={t('wealth.p2.screen.remove')}
                    aria-label={t('wealth.p2.screen.remove')}
                    onClick={() => void removeTab(x.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </SrcRow>
        <SrcRow icon="edit" title={t('wealth.p2.src.manual')} meta={manualMeta} total={s.sources.manual} rate={rate} lang={lang} />
        <SrcRow
          icon="coins"
          title={t('wealth.p2.src.valuables', { n: s.valuables.length })}
          meta={itemsMeta}
          total={s.sources.valuables}
          rate={rate}
          lang={lang}
        >
          {s.valuables.length > 0 && (
            <div className="w2-sub">
              {s.valuables.map((v) => {
                const view = item(v.name, v.kind === 'unique' ? 'UNIQUE' : v.kind === 'gem' ? 'GEM' : 'ITEM')
                return (
                  <div key={v.id} className={v.stale ? 'is-stale' : ''} title={v.low ? t('wealth.p2.val.low') : undefined}>
                    <ItemIcon icon={view.icon} />
                    <span
                      className={`ui-item${v.kind === 'unique' ? ' ui-item--unique' : v.kind === 'rare' ? ' ui-item--rare' : v.kind === 'currency' ? ' ui-item--currency' : ''}`}
                    >
                      {v.qty > 1 ? `${v.qty} × ` : ''}
                      {view.name}
                    </span>
                    <span className="grow" />
                    <span>
                      {money(v.unit * v.qty, rate, lang).main}
                      {v.low ? ' ~' : ''}
                    </span>
                    <button
                      type="button"
                      className="w2-x"
                      title={t('wealth.p2.val.remove')}
                      aria-label={t('wealth.p2.val.remove')}
                      onClick={() => void remove(v.id)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </SrcRow>
      </div>
    </div>
  )
}

function ManualRow({ r, t, lang, expert, now }: { r: Poe2ManualRow; t: T; lang: UiLang; expert: boolean; now: number }) {
  const setManual = usePoe2WealthStore((s) => s.setManual)
  const item = usePoe2Item(lang)
  const view = item(r.name)
  const set = (n: number): void => void setManual(r.name, Math.max(0, n))
  return (
    <div className={`w2-mrow${r.covered ? ' is-covered' : ''}`}>
      <span className="w2-mrow__n">
        {r.tag ? <CoinIcon tag={r.tag} lang={lang} /> : <ItemIcon icon={view.icon} />}
        <span>{view.name}</span>
        {!expert && r.unit !== undefined && <small>{r.unit >= 10 ? nf(r.unit, lang) : df(r.unit, lang, 2)} ex</small>}
      </span>
      <span className="w2-step" role="group" aria-label={view.name}>
        <button type="button" aria-label={t('wealth.p2.manual.dec')} disabled={r.qty <= 0} onClick={() => set(r.qty - 1)}>
          −
        </button>
        <QtyInput value={r.qty} label={t('wealth.p2.manual.qty', { name: view.name })} onCommit={set} />
        <button type="button" title={t('wealth.p2.manual.inc', { n: 1 })} onClick={() => set(r.qty + 1)}>
          +1
        </button>
        <button type="button" title={t('wealth.p2.manual.inc', { n: 10 })} onClick={() => set(r.qty + 10)}>
          +10
        </button>
      </span>
      <span className="w2-mrow__v">
        {r.covered ? '—' : r.unit !== undefined && r.qty > 0 ? money(r.unit * r.qty, null, lang).main : ''}
      </span>
      {r.covered && (
        <span className="w2-mrow__cov">
          {t('wealth.p2.manual.covered', { tab: layoutName(t, r.covered.layout), t: when(t, r.covered.at, now, lang) })}
        </span>
      )}
    </div>
  )
}

/** «Добавить валюту»: поиск по имени RU/EN среди валют данных PoE 2 (tradeTag), строка — до первого ввода числа. */
function AddCurrency({ t, lang, onPick }: { t: T; lang: UiLang; onPick: (name: string) => void }) {
  const table = useCurrencyTable(useGameLang(lang))
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!table || s.length < 2) return []
    return [...table.values()].filter((c) => c.name.toLowerCase().includes(s) || c.refName.toLowerCase().includes(s)).slice(0, 8)
  }, [table, q])
  if (!open)
    return (
      <button type="button" className="ui-btn ui-btn--sm" onClick={() => setOpen(true)}>
        <WIco name="plus" />
        {t('wealth.p2.manual.add')}
      </button>
    )
  return (
    <div className="w2-addbox">
      <input
        className="ui-input"
        autoFocus
        placeholder={t('wealth.p2.manual.addPh')}
        aria-label={t('wealth.p2.manual.add')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {hits.map((c) => (
        <button
          key={c.tag}
          type="button"
          className="ui-chip"
          onClick={() => {
            onPick(c.refName)
            setOpen(false)
            setQ('')
          }}
        >
          <CoinIcon tag={c.tag} lang={lang} />
          {c.name}
        </button>
      ))}
    </div>
  )
}

function ManualBox({ s, t, lang, expert, now }: { s: Poe2WealthState; t: T; lang: UiLang; expert: boolean; now: number }) {
  const setGold = usePoe2WealthStore((st) => st.setGold)
  const [open, setOpen] = useState(true)
  const [added, setAdded] = useState<string[]>([])
  const rows: Poe2ManualRow[] = [
    ...s.manual,
    ...added
      .filter((n) => !s.manual.some((r) => r.name === n))
      .map((name): Poe2ManualRow => ({ name, group: 'extra', qty: 0, inScreen: 0 }))
  ]
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="edit" size="sm" />
          {t('wealth.p2.manual')}
        </span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-expanded={open}
          aria-label={t(open ? 'wealth.p2.collapse' : 'wealth.p2.expand')}
          onClick={() => setOpen(!open)}
        >
          <WIco name={open ? 'chev-d' : 'chev-r'} />
        </button>
      </div>
      {open && (
        <>
          <div className="w2-man">
            {rows.map((r) => (
              <ManualRow key={r.name} r={r} t={t} lang={lang} expert={expert} now={now} />
            ))}
          </div>
          <div className="w2-gold">
            <span className="w2-gold__n">
              <CoinIcon tag="gold" lang={lang} />
              {t('wealth.p2.gold')}
            </span>
            <span className="w2-step">
              <QtyInput wide value={s.gold.qty} format={(n) => nf(n, lang)} label={t('wealth.p2.gold')} onCommit={(n) => void setGold(n)} />
            </span>
            <small>{t('wealth.p2.gold.hint')}</small>
          </div>
          <div className="ui-box__foot">
            <div className="w2-add">
              <AddCurrency t={t} lang={lang} onPick={(n) => setAdded((a) => (a.includes(n) ? a : [...a, n]))} />
              {!expert && s.sources.manual.at !== null && (
                <span>{t('wealth.p2.manual.saved', { t: when(t, s.sources.manual.at, now, lang) })}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Chart({ s, t, lang, expert }: { s: Poe2WealthState; t: T; lang: UiLang; expert: boolean }) {
  // график в div (макет): точки без курса — в ex по последнему известному курсу
  const rate = s.exPerDivine ?? 0
  const points = s.history.map((p) => {
    const r = p.divineRate > 0 ? p.divineRate : rate
    return { at: p.at, chaos: r > 0 ? p.chaos / r : p.chaos, divineRate: 1 }
  })
  return (
    <WealthChart
      points={points}
      lang={lang}
      expert={expert}
      unit={rate > 0 ? 'div' : 'ex'}
      title={t('wealth.p2.chart')}
      empty={t('wealth.p2.chart.empty')}
    />
  )
}

function Empty({ s, t, lang, now, expert }: { s: Poe2WealthState; t: T; lang: UiLang; now: number; expert: boolean }) {
  const key = useScreenKey()
  const pcKey = useAppStore((st) => st.settings?.hotkeys.priceCheck.accel)
  return (
    <>
      {!expert && <Why t={t} />}
      <div className="ui-empty w2-empty">
        <WIco name="coins" size="lg" />
        <span className="ui-empty__title">{t('wealth.p2.empty.title')}</span>
        <span>{t('wealth.p2.empty.text')}</span>
      </div>
      <div className="w2-opts">
        <div className="w2-way">
          <WIco name="grid" />
          <b>
            {t('wealth.p2.way.snap')} {key && <Kbd k={key} />}
            <span className="ui-tag ui-tag--good">{t('wealth.p2.way.best')}</span>
          </b>
          <span className="w2-opt__d">{tKey(t, 'wealth.p2.way.snap.d', key)}</span>
        </div>
        <div className="w2-way">
          <WIco name="edit" />
          <b>{t('wealth.p2.way.manual')}</b>
          <span className="w2-opt__d">{t('wealth.p2.way.manual.d')}</span>
        </div>
        <div className="w2-way">
          <WIco name="coins" />
          <b>
            {t('wealth.p2.way.item')} {pcKey && <Kbd k={pcKey.replace('Control', 'Ctrl')} />}
          </b>
          <span className="w2-opt__d">{tKey(t, 'wealth.p2.way.item.d', pcKey)}</span>
        </div>
      </div>
      <ManualBox s={s} t={t} lang={lang} expert={expert} now={now} />
    </>
  )
}

export function Poe2WealthTab() {
  const t = useT()
  const lang = useAppStore((st) => st.settings?.uiLang ?? 'ru') as UiLang
  const expert = !useAppStore((st) => st.settings?.ui.simpleMode ?? true)
  const s = usePoe2WealthStore((st) => st.state)
  const init = usePoe2WealthStore((st) => st.init)
  const farm = useFarmStore((st) => st.state)
  const initFarm = useFarmStore((st) => st.init)
  const now = useNow()
  const [sub, setSub] = useState<'stash' | 'session'>('stash')

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
  // «Записать в богатство» из панели Alt+F — показать карточку
  useEffect(() => {
    if (s?.screenOpenAt) setSub('stash')
  }, [s?.screenOpenAt])

  if (!s) return <div className="wealth-tab" />
  const empty = !s.total.ex && !s.screenTabs.length && !s.valuables.length && !s.manual.some((r) => r.qty > 0) && !s.gold.qty && !s.screen
  const subs: Array<['stash' | 'session', 'grid' | 'map', string]> = [
    ['stash', 'grid', t('wealth.sub.stash')],
    ['session', 'map', t('wealth.sub.session')]
  ]
  return (
    <div className="wealth-tab">
      <div className="ui-tabs wl-subtabs" role="tablist">
        {subs.map(([id, icon, label]) => (
          <button key={id} type="button" className="ui-tab" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}>
            <WIco name={icon} />
            {label}
            {id === 'stash' && !!s.screen?.tabs.length && <span className="ui-count">{s.screen.tabs.length}</span>}
            {id === 'session' && farm?.session && (
              <span className="ui-count ui-count--live">{clock(sessionMs(farm, now), true).slice(0, -3)}</span>
            )}
          </button>
        ))}
      </div>
      <div className="wl-body ui-scroll">
        {sub === 'stash' ? (
          <div className="w-pad">
            {empty ? (
              <Empty s={s} t={t} lang={lang} now={now} expert={expert} />
            ) : (
              <>
                <ScreenCards s={s} lang={lang} now={now} />
                <Top s={s} t={t} lang={lang} now={now} expert={expert} />
                {!expert && <Why t={t} />}
                <div className="w-grid w2-grid">
                  <Sources s={s} t={t} lang={lang} now={now} expert={expert} />
                  <ManualBox s={s} t={t} lang={lang} expert={expert} now={now} />
                  <Chart s={s} t={t} lang={lang} expert={expert} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-pad">
            <FarmPanel />
          </div>
        )}
      </div>
    </div>
  )
}
