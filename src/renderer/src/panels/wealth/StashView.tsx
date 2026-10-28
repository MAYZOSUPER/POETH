import { useState, type FormEvent } from 'react'
import type { UiLang, WealthItemNs, WealthState } from '@shared/types'
import { useT } from '../../i18n'
import { CurrencyTipBody, TipAnchor, useCurrencyNames } from '../../components/Currency'
import { SiteCheckBanner } from '../account/SiteCheckBanner'
import { useWealthStore } from './useWealthStore'
import { WealthChart } from './Chart'
import { Gains } from './Gains'
import { Coin, WIco, WSwitch } from './ui'
import { ago, df, nf, sg, span, timeOf, toDivine, until } from './format'

// Подвкладка «Тайник» по утверждённому макету «Богатство» v2: крупный итог в chaos и ≈ div с изменением
// за сутки, «Снимок N мин назад» и «Обновить», строка «Считать» (чипы вкладок), подсказка новичку,
// график, разбивка по вкладкам, «Что прибавилось с прошлого снимка». Без входа и без снимков —
// пустое состояние со входом на pathofexile.com.

type T = ReturnType<typeof useT>
type NameOf = (l: { name: string; ns: WealthItemNs }) => string

function LoginEmpty({ s, t }: { s: WealthState; t: T }) {
  const [why, setWhy] = useState(false)
  return (
    <div className="ui-empty" style={{ paddingTop: 64 }}>
      <WIco name="lock" size="lg" />
      <span className="ui-empty__title">{t('wealth.login.title')}</span>
      <span style={{ maxWidth: '52ch' }}>{t('wealth.login.text')}</span>
      <div className="wl-btns" style={{ justifyContent: 'center' }}>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => void window.overlayApi.auth.login()}>
          <WIco name="external" />
          {t('wealth.login.btn')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost" aria-expanded={why} onClick={() => setWhy(!why)}>
          <WIco name="shield" />
          {t('wealth.login.why')}
        </button>
      </div>
      {why && <span className="wl-why">{t('wealth.login.whyText')}</span>}
      {s.farmLinked && (
        <>
          <div className="ui-divider" style={{ width: 200 }} />
          <span style={{ fontSize: 'var(--fs-sm)' }}>{t('wealth.login.farm')}</span>
        </>
      )}
    </div>
  )
}

function AccountForm({ s, t }: { s: WealthState; t: T }) {
  const setAccount = useWealthStore((st) => st.setAccount)
  const accountError = useWealthStore((st) => st.accountError)
  const [value, setValue] = useState(s.account.source === 'manual' ? (s.account.name ?? '') : '')
  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (value.trim()) await setAccount(value.trim())
  }
  return (
    <form className="ui-field" onSubmit={(e) => void onSubmit(e)}>
      <label className="ui-field__label" htmlFor="wl-account">
        {t('wealth.account')}
        {s.account.name && (
          <span className="wl-muted">
            {' '}
            · {s.account.name} · {t(s.account.source === 'manual' ? 'wealth.account.manual' : 'wealth.account.session')}
          </span>
        )}
      </label>
      <div className="wl-account">
        <input
          id="wl-account"
          className="ui-input"
          placeholder="Name#1234"
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

function Problems({ s, t, now }: { s: WealthState; t: T; now: number }) {
  const err = s.status.error
  if (!s.loggedIn) {
    // история есть, но вход пропал — данные видны, сверху баннер
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
  if (!err) return s.prices.problem ? <div className="w-wait">{t('wealth.prices.problem')}</div> : null
  if (err.code === 'blocked') return <SiteCheckBanner context="account" />
  const text =
    err.code === 'rate-limited'
      ? t('wealth.err.rate-limited', { t: err.retryAt ? until(t, err.retryAt, now) : t('wealth.in.min', { n: 1 }) })
      : t(`wealth.err.${err.code}`, { league: s.league ?? '' })
  const account = err.code === 'no-account' || err.code === 'forbidden'
  return (
    <div className={`ui-banner ${err.code === 'rate-limited' ? '' : 'ui-banner--bad '}wl-banner`} role="status">
      <WIco name={err.code === 'rate-limited' ? 'pause' : 'warn'} />
      <span style={account ? { display: 'grid', gap: 'var(--sp-4)' } : undefined}>
        {text}
        {account && <AccountForm s={s} t={t} />}
      </span>
    </div>
  )
}

function Top({ s, t, lang, now, expert }: { s: WealthState; t: T; lang: string; now: number; expert: boolean }) {
  const refresh = useWealthStore((st) => st.refresh)
  const setOptions = useWealthStore((st) => st.setOptions)
  const busy = useWealthStore((st) => st.busy)
  const latest = s.latest
  const first = !!latest && s.history.length < 2
  const ul = lang as UiLang
  const cur = useCurrencyNames(ul)
  const rate = latest?.divineRate || s.prices.divineRate
  const running = s.status.phase !== 'idle'
  const wait = s.refreshAt && s.refreshAt > now ? s.refreshAt : undefined
  const interval = !s.options.autoEnabled ? 'manual' : s.options.autoIntervalMin >= 30 ? '30' : '15'

  let delta = null
  if (!latest) delta = <span className="w-wait">{t('wealth.first.none')}</span>
  else if (s.delta) {
    const up = s.delta.chaos >= 0
    const pct = s.delta.pct === null ? '' : ` (${up ? '+' : '−'}${df(Math.abs(s.delta.pct), lang, 0)}%)`
    delta = (
      <span className={`ui-delta ${up ? 'ui-delta--up' : 'ui-delta--down'}`}>
        <WIco name={up ? 'arrow-up' : 'arrow-down'} />
        {sg(s.delta.chaos, lang)} chaos{pct} <span>{span(t, latest.at - s.delta.fromAt)}</span>
      </span>
    )
  } else
    delta = (
      <span className="w-wait">
        {s.nextAutoAt ? t('wealth.first.next', { t: until(t, s.nextAutoAt, now) }) : t('wealth.first.nextManual')}
      </span>
    )

  let status: string
  if (s.status.phase === 'snapshot' && s.status.progress) {
    status = t('wealth.progress', { done: s.status.progress.done, total: s.status.progress.total })
    if (s.status.waitUntil && s.status.waitUntil > now) status += ` · ${t('wealth.progress.wait', { t: until(t, s.status.waitUntil, now) })}`
  } else if (s.status.phase === 'tabs') status = t('wealth.progress.tabs')
  else if (latest) status = t(first ? 'wealth.snap.first' : 'wealth.snap.at', { ago: ago(t, latest.at, now) })
  else status = t('wealth.snap.none')

  // источник курса — только когда он известен (час фида биржи GGG)
  const rateSrc = expert && s.prices.exchangeHour ? ` · ${t('wealth.src.exchange')}, ${timeOf(s.prices.exchangeHour + 3_600_000, lang, false)}` : ''

  return (
    <div className="w-top">
      <div className="w-total">
        <span className="ui-label">{t('wealth.total')}</span>
        <div className="ui-figure">
          {/* S18: иконки игры, полное название в простом режиме, подсказка новичку о chaos/divine */}
          <TipAnchor className="ui-figure__value ui-cur" focusable tip={<CurrencyTipBody tag="chaos" lang={ul} />}>
            {latest ? nf(latest.chaos, lang) : '—'}
            <span className="ui-figure__unit">{latest && !expert ? cur.after('chaos', nf(latest.chaos, lang)) : 'chaos'}</span>
          </TipAnchor>
          {latest && toDivine(latest.chaos, rate) !== null && (
            <TipAnchor className="ui-figure__alt ui-cur" tip={<CurrencyTipBody tag="divine" lang={ul} />}>
              <Coin unit="divine" lang={ul} />≈ {df(toDivine(latest.chaos, rate) ?? 0, lang)}{' '}
              {expert ? 'div' : cur.after('divine', df(toDivine(latest.chaos, rate) ?? 0, lang))}
            </TipAnchor>
          )}
        </div>
        {delta}
      </div>
      <div className="w-snap">
        <span>
          <WIco name="history" size="sm" /> {status}
        </span>
        <div className="wl-btns">
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            disabled={busy || running || !!wait || !s.loggedIn}
            title={wait ? t('wealth.refresh.wait', { t: until(t, wait, now) }) : t('wealth.refresh.title', { n: s.budget.requests })}
            onClick={() => void refresh()}
          >
            <WIco name="refresh" />
            {t('wealth.refresh')}
          </button>
          {expert && (
            <select
              className="ui-select"
              style={{ width: 'auto', height: 28 }}
              aria-label={t('wealth.interval')}
              title={s.options.autoEnabled && s.budget.intervalMin > s.options.autoIntervalMin ? t('wealth.interval.limit', { m: s.budget.intervalMin }) : undefined}
              value={interval}
              onChange={(e) => {
                const v = e.target.value
                void setOptions(v === 'manual' ? { autoEnabled: false } : { autoEnabled: true, autoIntervalMin: Number(v) })
              }}
            >
              <option value="15">{t('wealth.interval.min', { n: 15 })}</option>
              <option value="30">{t('wealth.interval.min', { n: 30 })}</option>
              <option value="manual">{t('wealth.interval.manual')}</option>
            </select>
          )}
        </div>
        {rate ? (
          <span className="w-rate">
            1 div = {nf(rate, lang)} chaos{rateSrc}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Filter({ s, t }: { s: WealthState; t: T }) {
  const setTabs = useWealthStore((st) => st.setTabs)
  if (!s.tabs.length) return null
  const selected = s.tabs.filter((x) => x.selected).map((x) => x.id)
  const toggle = (id: string, on: boolean): void => void setTabs(on ? [...selected, id] : selected.filter((x) => x !== id))
  return (
    <div className="ui-chips ui-chips--include">
      <span className="ui-label">{t('wealth.count')}</span>
      {s.tabs.map((x) => (
        <button
          key={x.id}
          type="button"
          className="ui-chip"
          aria-pressed={x.selected}
          disabled={x.unsupported}
          title={x.unsupported ? t('wealth.tabs.unsupported') : x.removeOnly ? t('wealth.tabs.removeOnly') : undefined}
          onClick={() => toggle(x.id, !x.selected)}
        >
          {x.name}
        </button>
      ))}
      <span className="ui-q" title={t('wealth.count.q')}>
        ?
      </span>
    </div>
  )
}

function Breakdown({ s, t, lang, expert }: { s: WealthState; t: T; lang: string; expert: boolean }) {
  const latest = s.latest
  const totals = new Map((latest?.tabs ?? []).map((x) => [x.id, x]))
  const on = s.tabs.filter((x) => x.selected).sort((a, b) => (totals.get(b.id)?.chaos ?? 0) - (totals.get(a.id)?.chaos ?? 0))
  const off = s.tabs.filter((x) => !x.selected)
  // список вкладок ещё не загружен — разбивка по итогам снимка
  const rows = s.tabs.length ? on : (latest?.tabs ?? []).map((x) => ({ id: x.id, name: x.name, selected: true }))
  const max = Math.max(1, ...rows.map((x) => totals.get(x.id)?.chaos ?? 0))
  if (!rows.length && !off.length) return null
  const cls = (extra: string): string => `ui-bars__row${expert ? ' ui-bars__row--delta' : ''}${extra}`
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="layers" size="sm" />
          {t('wealth.tabs')}
        </span>
        <span className="ui-label__grow" />
        {expert && <span className="ui-label">{t('wealth.tabs.day')}</span>}
      </div>
      <div className="ui-box__body">
        <div className="ui-bars">
          {rows.map((x) => {
            const tot = totals.get(x.id)
            const noval = !!tot && tot.chaos <= 0 && tot.unpriced > 0
            const name = (
              <span className="ui-bars__name">
                <b title={x.name}>{x.name}</b>
                {(expert || noval) && tot && <span>{t('wealth.tabs.items', { n: tot.items })}</span>}
              </span>
            )
            if (!tot || noval) {
              return (
                <div key={x.id} className={cls('')}>
                  {name}
                  {noval ? (
                    <span className="ui-tag ui-bars__note" title={t('wealth.unpriced.rare')}>
                      {t('wealth.unpriced')}
                    </span>
                  ) : (
                    <span className="ui-bars__value" style={{ fontWeight: 400, justifySelf: 'start' }}>
                      {t('wealth.tabs.next')}
                    </span>
                  )}
                  <span />
                  {expert && <span />}
                </div>
              )
            }
            const d = s.tabDelta?.[x.id]
            return (
              <div key={x.id} className={cls('')}>
                {name}
                <span className="ui-bars__track">
                  <i style={{ width: `${((Math.max(0, tot.chaos) / max) * 100).toFixed(1)}%` }} />
                </span>
                <span className="ui-bars__value">
                  {nf(tot.chaos, lang)} <small>c</small>
                </span>
                {expert && (
                  <span className={`ui-bars__delta${d ? (d > 0 ? ' ui-bars__delta--up' : ' ui-bars__delta--down') : ''}`}>
                    {d === undefined ? '' : sg(d, lang)}
                  </span>
                )}
              </div>
            )
          })}
          {off.map((x) => (
            <div key={x.id} className={cls(' ui-bars__row--off')}>
              <span className="ui-bars__name">
                <b title={x.name}>{x.name}</b>
              </span>
              <span className="ui-bars__value" style={{ fontWeight: 400, justifySelf: 'start' }}>
                {t(x.unsupported ? 'wealth.tabs.unsupportedShort' : 'wealth.tabs.off')}
              </span>
              <span />
              {expert && <span />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ExpertSettings({ s, t }: { s: WealthState; t: T }) {
  const setOptions = useWealthStore((st) => st.setOptions)
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="gear" size="sm" />
          {t('wealth.settings')}
        </span>
      </div>
      <div className="ui-box__body">
        <div className="wl-settings">
          <WSwitch on={s.options.poeWatch} label={t('wealth.opt.poewatch')} onChange={(v) => void setOptions({ poeWatch: v })} />
          <span className="ui-field__help">
            {t('wealth.budget', { n: s.budget.requests, m: s.budget.minIntervalMin })} {t('wealth.sources', { ex: s.prices.exchangeItems, pw: s.prices.poeWatchItems })}
          </span>
        </div>
        <AccountForm s={s} t={t} />
      </div>
    </div>
  )
}

export function StashView({
  s,
  t,
  lang,
  now,
  expert,
  nameOf
}: {
  s: WealthState
  t: T
  lang: string
  now: number
  expert: boolean
  nameOf: NameOf
}) {
  const diff = useWealthStore((st) => st.diff)
  if (!s.loggedIn && !s.latest) return <LoginEmpty s={s} t={t} />
  const first = !!s.latest && s.history.length < 2
  return (
    <div className="w-pad">
      <Top s={s} t={t} lang={lang} now={now} expert={expert} />
      <Problems s={s} t={t} now={now} />
      <Filter s={s} t={t} />
      {!expert && (
        <div className="ui-hint" style={{ padding: 0 }}>
          <WIco name="help" />
          <span>{t(s.options.autoEnabled ? 'wealth.hint' : 'wealth.hint.manual', { n: s.budget.intervalMin })}</span>
        </div>
      )}
      <div className="w-grid">
        {first || !s.latest ? (
          <div className="ui-box">
            <div className="ui-box__head">
              <span className="ui-label">
                <WIco name="chart" size="sm" />
                {t('wealth.chart')}
              </span>
            </div>
            <div className="ui-empty">
              <WIco name="chart" size="lg" />
              <span>{t('wealth.chart.empty')}</span>
            </div>
          </div>
        ) : (
          <WealthChart points={s.history} lang={lang} expert={expert} />
        )}
        <Breakdown s={s} t={t} lang={lang} expert={expert} />
      </div>
      {s.latest && <Gains title={t('wealth.gains')} diff={diff} first={first} lang={lang} expert={expert} nameOf={nameOf} />}
      {expert && <ExpertSettings s={s} t={t} />}
      <p className="wl-note">
        <WIco name="info" size="sm" />
        {t('wealth.session.note')}
      </p>
    </div>
  )
}
