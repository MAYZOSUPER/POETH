import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { WealthDiff, WealthItemNs, WealthLine, WealthSnapshot, WealthState } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data } from '@shared/poe1/data'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { SiteCheckBanner } from './account/SiteCheckBanner'
import { useWealthStore } from './wealth/useWealthStore'
import { WealthChart } from './wealth/Chart'
import { Coin, WIco, WSwitch } from './wealth/ui'
import { ago, duration, fmtNum, fmtSigned, lineFacts, toDivine, until } from './wealth/format'
import './wealth/wealth.css'

// Вкладка «Богатство» компаньона (PoE1, S11a): сумма выбранных вкладок стэша в chaos и divine,
// сессия фарма с крупным «доход в час», график по времени, итоги по вкладкам, самое ценное,
// выбор вкладок и настройки. Макет дизайнера ещё в работе — пока по docs/design-system.md.

type T = ReturnType<typeof useT>

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Имя предмета на языке интерфейса (английское — как пришло с сайта, русское — по данным APT). */
function useNameOf(lang: string): (l: { name: string; ns: WealthItemNs }) => string {
  const [data, setData] = useState<Poe1Data | null>(null)
  useEffect(() => {
    if (lang !== 'ru') {
      setData(null)
      return
    }
    let alive = true
    getDefaultPoe1DataStore()
      .ensureLanguage('ru')
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [lang])
  return useCallback((l: { name: string; ns: WealthItemNs }) => data?.itemByRef(l.ns, l.name)?.[0]?.name ?? l.name, [data])
}

function Price({ chaos, rate, lang, big }: { chaos: number; rate?: number; lang: string; big?: boolean }) {
  const div = toDivine(chaos, rate)
  return (
    <span className={big ? 'wl-price wl-price--big' : 'wl-price'}>
      <span>
        <Coin unit="chaos" />
        {fmtNum(chaos, lang)}
      </span>
      {div !== null && (
        <span className="wl-price__div">
          <Coin unit="divine" />
          {fmtNum(div, lang)}
        </span>
      )}
    </span>
  )
}

function Problems({ s, t, now }: { s: WealthState; t: T; now: number }) {
  const err = s.status.error
  if (!s.loggedIn) {
    return (
      <div className="ui-banner wl-banner" role="status">
        <WIco name="lock" />
        <span>
          <b>{t('wealth.auth.title')}</b> {t('wealth.auth.text')}
        </span>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => void window.overlayApi.auth.login()}>
          {t('wealth.auth.btn')}
        </button>
      </div>
    )
  }
  if (!err) return null
  if (err.code === 'blocked') return <SiteCheckBanner context="account" />
  const text =
    err.code === 'rate-limited'
      ? t('wealth.err.rate-limited', { t: err.retryAt ? until(t, err.retryAt, now) : t('wealth.in.min', { n: 1 }) })
      : t(`wealth.err.${err.code}`, { league: s.league ?? '' })
  return (
    <div className={`ui-banner ${err.code === 'rate-limited' ? '' : 'ui-banner--bad '}wl-banner`} role="status">
      <WIco name={err.code === 'rate-limited' ? 'pause' : 'warn'} />
      <span>{text}</span>
    </div>
  )
}

function Header({ s, t, lang, now, busy }: { s: WealthState; t: T; lang: string; now: number; busy: boolean }) {
  const snapshot = useWealthStore((st) => st.snapshot)
  const latest = s.latest
  const running = s.status.phase !== 'idle'
  const rate = latest?.divineRate || s.prices.divineRate
  return (
    <div className="wl-head">
      <div className="wl-total">
        <span className="ui-label">{latest ? t('wealth.total') : t('wealth.total.none')}</span>
        {latest && <Price chaos={latest.chaos} rate={rate} lang={lang} big />}
        <span className="wl-meta">
          {latest && <span>{t('wealth.meta.at', { ago: ago(t, latest.at, now) })}</span>}
          {s.league && <span>{t('wealth.meta.league', { league: s.league })}</span>}
          {rate ? <span>{t('wealth.meta.rate', { n: fmtNum(rate, lang) })}</span> : null}
          {latest && latest.unpriced > 0 && <span>{t('wealth.meta.unpriced', { n: latest.unpriced })}</span>}
        </span>
      </div>
      <div className="wl-act">
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={busy || running || !s.loggedIn}
          title={t('wealth.snap.title', { n: s.budget.requests })}
          onClick={() => void snapshot()}
        >
          <WIco name="refresh" />
          {t('wealth.snap')}
        </button>
        {s.status.phase === 'snapshot' && s.status.progress && (
          <span className="wl-progress">
            {t('wealth.progress', { done: s.status.progress.done, total: s.status.progress.total })}
            {s.status.waitUntil && s.status.waitUntil > now && (
              <> · {t('wealth.progress.wait', { t: until(t, s.status.waitUntil, now) })}</>
            )}
          </span>
        )}
        {s.status.phase === 'tabs' && <span className="wl-progress">{t('wealth.progress.tabs')}</span>}
        {!running && s.nextAutoAt && <span className="wl-progress">{t('wealth.next', { t: until(t, s.nextAutoAt, now) })}</span>}
      </div>
    </div>
  )
}

function DiffList({ diff, t, lang, nameOf, max }: { diff: WealthDiff; t: T; lang: string; nameOf: (l: { name: string; ns: WealthItemNs }) => string; max: number }) {
  const lines = diff.lines.filter((l) => l.qtyDelta !== 0).slice(0, max)
  if (!lines.length) return <div className="wl-empty">{t('wealth.diff.empty')}</div>
  return (
    <ul className="wl-diff">
      {lines.map((l) => (
        <li key={l.key}>
          <span className={l.qtyDelta > 0 ? 'wl-up' : 'wl-down'}>{fmtSigned(l.qtyDelta, lang)}</span>
          <span className="wl-diff__name">
            {nameOf(l)}
            {lineFacts(t, l).map((f) => (
              <span key={f} className="ui-tag">
                {f}
              </span>
            ))}
          </span>
          <span className={l.chaosDelta >= 0 ? 'wl-up' : 'wl-down'}>
            <Coin unit="chaos" />
            {fmtSigned(l.chaosDelta, lang)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Farm({ s, t, lang, now, busy, diff, nameOf, simple }: { s: WealthState; t: T; lang: string; now: number; busy: boolean; diff: WealthDiff | null; nameOf: (l: { name: string; ns: WealthItemNs }) => string; simple: boolean }) {
  const startFarm = useWealthStore((st) => st.startFarm)
  const stopFarm = useWealthStore((st) => st.stopFarm)
  const f = s.farm
  const session = f.session
  const active = !!session && session.stoppedAt === undefined
  const rate = s.latest?.divineRate || s.prices.divineRate
  const disabled = busy || s.status.phase !== 'idle' || !s.loggedIn
  return (
    <section className="wl-box wl-farm">
      <div className="ui-label">
        <WIco name="history" size="sm" />
        {t('wealth.farm')}
        {session && (
          <span className="wl-farm__time">
            {active ? t('wealth.farm.time', { t: duration(now - session.startedAt) }) : t('wealth.farm.done', { t: duration((session.stoppedAt ?? now) - session.startedAt) })}
          </span>
        )}
      </div>
      {session ? (
        <>
          <div className="wl-farm__big">
            {f.perHour !== undefined ? (
              <>
                <span className={f.perHour >= 0 ? 'wl-up' : 'wl-down'}>
                  <Coin unit="chaos" />
                  {fmtSigned(f.perHour, lang)}
                </span>
                {toDivine(f.perHour, rate) !== null && (
                  <span className="wl-farm__div">
                    <Coin unit="divine" />
                    {fmtSigned(toDivine(f.perHour, rate) ?? 0, lang)}
                  </span>
                )}
                <span className="wl-farm__unit">{t('wealth.farm.perHour')}</span>
              </>
            ) : (
              <span className="wl-farm__short">{t('wealth.farm.short')}</span>
            )}
          </div>
          <div className="wl-farm__row">
            <span>
              {t('wealth.farm.gain')}: <b>{fmtSigned(f.gain ?? 0, lang)}</b> c
            </span>
            {f.lastHour !== undefined && f.lastHour !== null && (
              <span>
                {t('wealth.farm.lastHour')}: <b>{fmtSigned(f.lastHour, lang)}</b> c
              </span>
            )}
            <span>{t('wealth.farm.snaps', { n: f.snapshots })}</span>
          </div>
        </>
      ) : (
        <p className="wl-farm__idle">{t('wealth.farm.idle')}</p>
      )}
      <div className="wl-farm__act">
        {active ? (
          <button type="button" className="ui-btn ui-btn--danger" disabled={disabled} onClick={() => void stopFarm()}>
            <WIco name="pause" />
            {t('wealth.farm.stop')}
          </button>
        ) : (
          <button type="button" className="ui-btn ui-btn--primary" disabled={disabled} onClick={() => void startFarm()}>
            <WIco name="history" />
            {session ? t('wealth.farm.new') : t('wealth.farm.start')}
          </button>
        )}
      </div>
      {diff && (
        <div className="wl-farm__diff">
          <div className="ui-label">
            {t('wealth.diff')}
            <span className="wl-farm__time">{session && diff.fromId === session.startId ? t('wealth.diff.since') : t('wealth.diff.sincePrev')}</span>
          </div>
          <DiffList diff={diff} t={t} lang={lang} nameOf={nameOf} max={simple ? 6 : 15} />
        </div>
      )}
    </section>
  )
}

function TabTotals({ s, t, lang }: { s: WealthState; t: T; lang: string }) {
  const latest = s.latest
  if (!latest || !latest.tabs.length) return null
  const max = Math.max(1, ...latest.tabs.map((x) => x.chaos))
  const tabs = [...latest.tabs].sort((a, b) => b.chaos - a.chaos)
  return (
    <section className="wl-box">
      <div className="ui-label">
        <WIco name="layers" size="sm" />
        {t('wealth.tabs')}
      </div>
      <ul className="wl-tabs">
        {tabs.map((x) => (
          <li key={x.id} style={{ ['--v' as string]: `${(Math.max(0, x.chaos) / max) * 100}%` }}>
            <span className="wl-tabs__name" title={x.name}>
              {x.name}
            </span>
            <span className="wl-tabs__bar" />
            <span className="wl-tabs__items">{t('wealth.tabs.items', { n: x.items })}</span>
            <Price chaos={x.chaos} rate={latest.divineRate} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Items({ detail, t, lang, nameOf, simple }: { detail: WealthSnapshot; t: T; lang: string; nameOf: (l: { name: string; ns: WealthItemNs }) => string; simple: boolean }) {
  const lines = detail.lines.slice(0, simple ? 10 : 60)
  const reason = (l: WealthLine): string => (l.reason ? t(`wealth.reason.${l.reason}`) : '')
  return (
    <section className="wl-box">
      <div className="ui-label">
        <WIco name="coins" size="sm" />
        {t('wealth.items')}
      </div>
      <table className="wl-tbl">
        <thead>
          <tr>
            <th>{t('wealth.col.item')}</th>
            <th>{t('wealth.col.qty')}</th>
            {!simple && <th>{t('wealth.col.unit')}</th>}
            <th>{t('wealth.col.total')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>
                <span className="wl-item">{nameOf(l)}</span>
                {lineFacts(t, l).map((f) => (
                  <span key={f} className="ui-tag">
                    {f}
                  </span>
                ))}
                {!simple && l.source && <span className="wl-src">{t(`wealth.src.${l.source}`)}</span>}
              </td>
              <td className="num">{fmtNum(l.qty, lang)}</td>
              {!simple && <td className="num">{l.unit !== undefined ? fmtNum(l.unit, lang) : ''}</td>}
              <td className="num">
                {l.unit !== undefined ? (
                  <span title={l.low ? t('wealth.low') : undefined}>
                    <Coin unit="chaos" />
                    {l.low ? '~' : ''}
                    {fmtNum(l.total, lang)}
                  </span>
                ) : (
                  <span className="wl-unpriced" title={reason(l)}>
                    {t('wealth.unpriced')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TabPicker({ s, t, busy }: { s: WealthState; t: T; busy: boolean }) {
  const setTabs = useWealthStore((st) => st.setTabs)
  const refreshTabs = useWealthStore((st) => st.refreshTabs)
  const selected = s.tabs.filter((x) => x.selected).map((x) => x.id)
  const toggle = (id: string, on: boolean): void => {
    void setTabs(on ? [...selected, id] : selected.filter((x) => x !== id))
  }
  const n = selected.length
  return (
    <div className="wl-pick">
      <div className="wl-pick__head">
        <span className="ui-field__label">{t('wealth.tabs.pick')}</span>
        {s.tabs.length > 0 && <span className={n > s.maxTabs ? 'wl-warn' : 'wl-muted'}>{t('wealth.tabs.count', { n, max: s.maxTabs })}</span>}
        <span className="wl-grow" />
        {s.tabs.length > 0 && (
          <>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void setTabs(s.tabs.filter((x) => !x.unsupported).map((x) => x.id))}>
              {t('wealth.tabs.all')}
            </button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void setTabs([])}>
              {t('wealth.tabs.none')}
            </button>
          </>
        )}
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy || s.status.phase !== 'idle' || !s.loggedIn} onClick={() => void refreshTabs()}>
          <WIco name="refresh" />
          {s.tabs.length ? t('wealth.tabs.refresh') : t('wealth.tabs.load')}
        </button>
      </div>
      {s.tabs.length ? (
        <div className="wl-pick__list">
          {s.tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              className="ui-chip wl-chip"
              aria-pressed={x.selected}
              disabled={x.unsupported}
              title={x.unsupported ? t('wealth.tabs.unsupported.title') : x.type}
              style={x.colour ? { ['--tab' as string]: `rgb(${x.colour})` } : undefined}
              onClick={() => toggle(x.id, !x.selected)}
            >
              <i className="wl-chip__dot" />
              {x.name}
              {x.unsupported && <span className="wl-muted"> · {t('wealth.tabs.unsupported')}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="wl-empty">{t('wealth.tabs.empty')}</div>
      )}
      {n > s.maxTabs && <span className="ui-field__error">{t('wealth.tabs.over', { max: s.maxTabs })}</span>}
      {n > 0 && <span className="ui-field__help">{t('wealth.tabs.budget', { n: s.budget.requests, m: s.budget.minIntervalMin })}</span>}
    </div>
  )
}

function Account({ s, t }: { s: WealthState; t: T }) {
  const setAccount = useWealthStore((st) => st.setAccount)
  const accountError = useWealthStore((st) => st.accountError)
  const [value, setValue] = useState(s.account.source === 'manual' ? (s.account.name ?? '') : '')
  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (value.trim()) await setAccount(value.trim())
  }
  return (
    <form className="ui-field wl-account" onSubmit={(e) => void onSubmit(e)}>
      <label className="ui-field__label" htmlFor="wl-account">
        {t('wealth.account')}
        {s.account.name && (
          <span className="wl-muted">
            {' '}
            · {s.account.name} · {s.account.source === 'manual' ? t('wealth.account.manual') : t('wealth.account.session')}
          </span>
        )}
      </label>
      <div className="wl-account__row">
        <input
          id="wl-account"
          className="ui-input"
          placeholder={t('wealth.account.placeholder')}
          spellCheck={false}
          autoComplete="off"
          maxLength={48}
          aria-invalid={accountError ? true : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="ui-btn ui-btn--sm" disabled={!value.trim()}>
          {t('wealth.account.save')}
        </button>
        {s.account.source === 'manual' && (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost"
            onClick={() => {
              setValue('')
              void setAccount(null)
            }}
          >
            {t('wealth.account.clear')}
          </button>
        )}
      </div>
      {accountError && <span className="ui-field__error">{t('wealth.account.bad')}</span>}
    </form>
  )
}

const INTERVALS = [15, 20, 30, 45, 60]

function Settings({ s, t, lang, now, busy, simple }: { s: WealthState; t: T; lang: string; now: number; busy: boolean; simple: boolean }) {
  const setOptions = useWealthStore((st) => st.setOptions)
  const o = s.options
  const p = s.prices
  return (
    <section className="wl-box wl-settings">
      <div className="ui-label">
        <WIco name="gear" size="sm" />
        {t('wealth.settings')}
      </div>
      <TabPicker s={s} t={t} busy={busy} />
      <div className="wl-opts">
        <WSwitch on={o.autoEnabled} label={t('wealth.opt.auto')} onChange={(v) => void setOptions({ autoEnabled: v })} />
        <label className="wl-interval">
          {t('wealth.opt.interval')}
          <select className="ui-select" value={o.autoIntervalMin} onChange={(e) => void setOptions({ autoIntervalMin: Number(e.target.value) })}>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {t('wealth.opt.min', { n: Math.max(m, s.budget.minIntervalMin) })}
              </option>
            ))}
          </select>
        </label>
        <WSwitch on={o.poeWatch} label={t('wealth.opt.poewatch')} onChange={(v) => void setOptions({ poeWatch: v })} />
      </div>
      {simple && <span className="ui-field__help">{t('wealth.opt.poewatch.help')}</span>}
      {(s.status.error?.code === 'no-account' || s.status.error?.code === 'forbidden' || s.account.source !== 'session' || !simple) && <Account s={s} t={t} />}
      {!simple && (
        <span className="ui-field__help">
          {t('wealth.sources', {
            ex: p.exchangeItems,
            h: p.exchangeHour ? ago(t, p.exchangeHour + 3_600_000, now) : '—',
            pw: p.poeWatchItems
          })}
          {p.divineRate ? ` · ${t('wealth.meta.rate', { n: fmtNum(p.divineRate, lang) })}` : ''}
        </span>
      )}
      {p.problem && <span className="ui-field__error">{t('wealth.prices.problem')}</span>}
    </section>
  )
}

export function WealthTab() {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const s = useWealthStore((st) => st.state)
  const detail = useWealthStore((st) => st.detail)
  const diff = useWealthStore((st) => st.diff)
  const busy = useWealthStore((st) => st.busy)
  const init = useWealthStore((st) => st.init)
  const nameOf = useNameOf(lang)
  const now = useNow()

  useEffect(() => init(), [init])

  if (!s) return <div className="wealth-tab" />
  if (!s.supported) {
    return (
      <div className="wealth-tab">
        <div className="ui-empty wl-box">
          <span>{t('wealth.err.unsupported-game')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="wealth-tab ui-scroll">
      <Header s={s} t={t} lang={lang} now={now} busy={busy} />
      <Problems s={s} t={t} now={now} />
      <div className="wl-grid">
        <Farm s={s} t={t} lang={lang} now={now} busy={busy} diff={diff} nameOf={nameOf} simple={simple} />
        <section className="wl-box">
          <div className="ui-label">
            <WIco name="history" size="sm" />
            {t('wealth.chart')}
          </div>
          <WealthChart points={s.history} lang={lang} now={now} sessionStart={s.farm.session?.startedAt} />
        </section>
      </div>
      <TabTotals s={s} t={t} lang={lang} />
      {detail && <Items detail={detail} t={t} lang={lang} nameOf={nameOf} simple={simple} />}
      <Settings s={s} t={t} lang={lang} now={now} busy={busy} simple={simple} />
      {simple && (
        <div className="ui-hint wl-hint">
          <WIco name="help" />
          <span>{t('wealth.hint')}</span>
        </div>
      )}
      <p className="wl-note">
        <WIco name="info" size="sm" />
        {t('wealth.session.note')}
      </p>
    </div>
  )
}
