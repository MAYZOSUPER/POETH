import { useEffect, useState } from 'react'
import type { FarmRun, FarmState } from '@shared/types/farm'
import { useLang, useT } from '../../i18n'
import { farmTicking, useFarmStore } from '../../store/useFarmStore'
import { Ico, Rich, Switch, useSimple } from '../deals/common'
import { chaos, clock, currentRunMs, income, rate, runName, sessionMs, when } from './format'
import './farm.css'

// Раздел «Сессия фарма» (S11b) по макету дизайнера «Богатство»: без сессии — «Начать сессию» и
// прошлые сессии; во время сессии — плитки (доход в час, карт в час, среднее время карты, смерти)
// и забеги сессии с текущей картой сверху. Ниже — все забеги и включение виджета поверх игры.
// Самодостаточна (свой стор и словарь dict/farm.ts); ставит S11a во вкладку «Богатство».
// Доход — по прибыли забегов от учёта богатства S11a; без входа — «нужен вход» (needLogin).

export interface FarmPanelProps {
  /** S11a: тайник не читается без входа — плитка дохода «нужен вход» */
  needLogin?: boolean
  /** S11a: кнопка «Войти» в плитке дохода */
  onSignIn?: () => void
  /** S11a: курс div → chaos (доход в div); null — только chaos */
  chaosPerDivine?: number | null
}

const HOUR = 3_600_000

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function tierText(run: Pick<FarmRun, 'kind' | 'tier' | 'areaLevel'>, t: ReturnType<typeof useT>): string {
  if (run.kind === 'map' && run.tier !== null) return `T${run.tier}`
  return run.kind === 'other' ? t('farm.kind.other') : t('farm.level', { level: run.areaLevel })
}

function Deaths({ n }: { n: number }) {
  return n > 0 ? <span className="fm-death">{n}</span> : <span className="fm-zero">0</span>
}

// ---------------------------------------------------------------- без сессии

function IdleView({ state }: { state: FarmState }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const busy = useFarmStore((s) => s.busy)
  const start = useFarmStore((s) => s.start)
  return (
    <>
      <div className="ui-empty fm-empty">
        <Ico name="map" size="lg" />
        <span className="ui-empty__title">{t('farm.title')}</span>
        <span className="fm-empty__text">{t('farm.idle.text')}</span>
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => void start()}>
          {t('farm.session.start')}
        </button>
        {simple && <span className="fm-empty__hint">{t('farm.idle.hint')}</span>}
        {state.current && (
          <span className="fm-empty__hint">
            {t('farm.idle.inMap', { map: runName(state.current), time: clock(state.current.activeMs) })}
          </span>
        )}
      </div>
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.sessions.title')}
      </div>
      {state.sessions.length === 0 ? (
        <p className="fm-p">{t('farm.sessions.empty')}</p>
      ) : (
        <div className="fm-box fm-tablewrap">
          <table className="fm-tbl">
            <thead>
              <tr>
                <th>{t('farm.past.when')}</th>
                <th>{t('farm.past.length')}</th>
                <th className="fm-r">{t('farm.past.maps')}</th>
                <th className="fm-r">{t('farm.past.perHour')}</th>
                <th className="fm-r">{t('farm.past.total')}</th>
              </tr>
            </thead>
            <tbody>
              {state.sessions.map((s) => (
                <tr key={s.id}>
                  <td className="fm-nowrap">{when(s.startedAt, lang)}</td>
                  <td className="fm-num-l">{clock(s.stats.durationMs)}</td>
                  <td className="fm-num">{s.stats.maps}</td>
                  <td className="fm-num">
                    {s.stats.profitPerHour !== null ? t('farm.chaos', { n: chaos(s.stats.profitPerHour, lang) }) : '—'}
                  </td>
                  <td className={`fm-num fm-profit${s.stats.profitChaos !== null && s.stats.profitChaos < 0 ? ' fm-loss' : ''}`}>
                    {s.stats.profitChaos !== null ? t('farm.chaos', { n: chaos(s.stats.profitChaos, lang, true) }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- сессия идёт

function Kpis({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const lang = useLang()
  const stats = state.stats
  if (!stats) return null
  const dur = sessionMs(state, now)
  const rated = dur >= 60_000
  const na = '—'
  const perHour = rated && stats.profitChaos !== null ? stats.profitChaos / (dur / HOUR) : null
  const inc = perHour !== null ? income(perHour, props.chaosPerDivine ?? null, lang) : null
  return (
    <div className="fm-kpis">
      {props.needLogin ? (
        <div className="fm-kpi fm-kpi--hero fm-kpi--need">
          <span className="ui-label">{t('farm.stat.income')}</span>
          <b>{t('farm.stat.income.login')}</b>
          {props.onSignIn && (
            <span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={props.onSignIn}>
                <Ico name="external" />
                {t('farm.signIn')}
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="fm-kpi fm-kpi--hero" title={inc ? undefined : t('farm.stat.income.wait')}>
          <span className="ui-label">{t('farm.stat.income')}</span>
          <b>{inc ? inc.main : na}</b>
          <span>{inc ? inc.sub : t('farm.stat.income.waitShort')}</span>
        </div>
      )}
      <div className="fm-kpi">
        <span className="ui-label">{t('farm.stat.perHour')}</span>
        <b>{rated ? rate(stats.maps / (dur / HOUR), lang) : na}</b>
        <span>{t('farm.stat.perHour.sub', { n: stats.maps })}</span>
      </div>
      <div className="fm-kpi">
        <span className="ui-label">{t('farm.stat.avg')}</span>
        <b>{stats.avgMapMs !== null ? clock(stats.avgMapMs) : na}</b>
        <span>{stats.fastestMapMs !== null ? t('farm.stat.avg.sub', { time: clock(stats.fastestMapMs) }) : ' '}</span>
      </div>
      <div className="fm-kpi">
        <span className="ui-label">{t('farm.stat.deaths')}</span>
        <b>{stats.deaths}</b>
        <span>{t('farm.stat.deaths.sub', { n: stats.mapsWithDeaths, of: stats.maps })}</span>
      </div>
    </div>
  )
}

function SessionRuns({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const sid = state.session?.id
  const done = state.runs.filter((r) => r.sessionId === sid)
  const current = state.current && state.current.sessionId === sid ? state.current : null
  const total = done.reduce((a, r) => a + (r.profit?.chaos ?? 0), 0)
  const anyProfit = done.some((r) => r.profit) || !!current?.profit
  const expert = !simple
  const profitCell = (r: FarmRun, open: boolean) => {
    if (r.profit) {
      return (
        <td className={`fm-num fm-profit${r.profit.chaos < 0 ? ' fm-loss' : ''}`}>
          {t('farm.chaos', { n: chaos(r.profit.chaos, lang, true) })}
        </td>
      )
    }
    const text = open ? t('farm.run.running') : props.needLogin ? '—' : t('farm.run.counting')
    return <td className="fm-num fm-none">{text}</td>
  }
  const perMin = (r: FarmRun) =>
    r.profit && r.activeMs >= 60_000 ? rate(r.profit.chaos / (r.activeMs / 60_000), lang) : '—'

  return (
    <>
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.runs.session')}
        <span className="ui-label__grow" />
        {anyProfit && !props.needLogin && (
          <span className="fm-total">
            {t('farm.runs.total')} <b className={total < 0 ? 'fm-loss' : ''}>{t('farm.chaos', { n: chaos(total, lang, true) })}</b>
          </span>
        )}
      </div>
      {!current && done.length === 0 ? (
        <p className="fm-p">{t('farm.runs.sessionEmpty')}</p>
      ) : (
        <div className="fm-box fm-tablewrap">
          <table className="fm-tbl">
            <thead>
              <tr>
                <th className="fm-n">#</th>
                <th>{t('farm.col.map')}</th>
                <th className="fm-r">{t('farm.col.time')}</th>
                <th className="fm-r">{t('farm.col.profit')}</th>
                {expert && <th className="fm-r">{t('farm.col.perMin')}</th>}
                <th className="fm-r">{t('farm.col.deaths')}</th>
              </tr>
            </thead>
            <tbody>
              {current && (
                <tr className="fm-now">
                  <td className="fm-n">{done.length + 1}</td>
                  <td>
                    {runName(current)}
                    <span className="fm-tier">{tierText(current, t)}</span>
                  </td>
                  <td className="fm-num fm-now__t">{clock(currentRunMs(state, now))}</td>
                  {profitCell(current, true)}
                  {expert && <td className="fm-num">—</td>}
                  <td className="fm-num">
                    <Deaths n={current.deaths} />
                  </td>
                </tr>
              )}
              {done.map((r, i) => (
                <tr key={r.id}>
                  <td className="fm-n">{done.length - i}</td>
                  <td>
                    {runName(r)}
                    <span className="fm-tier">{tierText(r, t)}</span>
                  </td>
                  <td className="fm-num">{clock(r.activeMs)}</td>
                  {profitCell(r, false)}
                  {expert && <td className="fm-num">{perMin(r)}</td>}
                  <td className="fm-num">
                    <Deaths n={r.deaths} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function RunningView({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const simple = useSimple()
  const busy = useFarmStore((s) => s.busy)
  const pause = useFarmStore((s) => s.pause)
  const resume = useFarmStore((s) => s.resume)
  const stop = useFarmStore((s) => s.stop)
  const paused = state.session?.pausedAt !== null
  return (
    <>
      <div className="fm-sess-top">
        <span className="fm-run">
          <span className={`ui-dot${paused ? ' ui-dot--afk' : ''}`} />
          {t(paused ? 'farm.session.paused' : 'farm.session.running')} · <b>{clock(sessionMs(state, now))}</b>
        </span>
        <span className="fm-grow" />
        {paused ? (
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={() => void resume()}>
            {t('farm.session.resume')}
          </button>
        ) : (
          <button
            type="button"
            className={`ui-btn ui-btn--sm${simple ? '' : ' ui-btn--icon'}`}
            title={t('farm.session.pause')}
            aria-label={t('farm.session.pause')}
            disabled={busy}
            onClick={() => void pause()}
          >
            <Ico name="pause" />
            {simple && t('farm.session.pause')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => void stop()}>
          {t('farm.session.stop')}
        </button>
      </div>
      <Kpis state={state} now={now} props={props} />
      {simple && (
        <div className="ui-hint fm-hint">
          <Ico name="info" />
          <span>
            <Rich text={t('farm.hint.running')} />
          </span>
        </div>
      )}
      <SessionRuns state={state} now={now} props={props} />
    </>
  )
}

// ---------------------------------------------------------------- все забеги

function AllRuns({ runs }: { runs: FarmRun[] }) {
  const t = useT()
  const lang = useLang()
  const removeRun = useFarmStore((s) => s.removeRun)
  const clear = useFarmStore((s) => s.clear)
  if (runs.length === 0) return null
  const onClear = (): void => {
    if (window.confirm(t('farm.runs.clearConfirm'))) void clear()
  }
  return (
    <details className="fm-all">
      <summary className="ui-label">{t('farm.runs.all', { n: runs.length })}</summary>
      <div className="fm-all__bar">
        <span className="fm-p fm-faint">{t('farm.how')}</span>
        <span className="fm-grow" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClear}>
          <Ico name="trash" />
          {t('farm.runs.clear')}
        </button>
      </div>
      <div className="fm-box fm-tablewrap">
        <table className="fm-tbl">
          <thead>
            <tr>
              <th>{t('farm.col.when')}</th>
              <th>{t('farm.col.map')}</th>
              <th className="fm-r">{t('farm.col.time')}</th>
              <th className="fm-r" title={t('farm.col.entries.title')}>
                {t('farm.col.entries')}
              </th>
              <th className="fm-r">{t('farm.col.profit')}</th>
              <th className="fm-r">{t('farm.col.deaths')}</th>
              <th aria-label={t('farm.runs.remove')} />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="fm-nowrap fm-faint">{when(r.startTs, lang)}</td>
                <td>
                  {runName(r)}
                  <span className="fm-tier">{tierText(r, t)}</span>
                </td>
                <td className="fm-num">{clock(r.activeMs)}</td>
                <td className="fm-num">{r.entries}</td>
                <td className={`fm-num${r.profit ? ' fm-profit' : ' fm-none'}${r.profit && r.profit.chaos < 0 ? ' fm-loss' : ''}`}>
                  {r.profit ? t('farm.chaos', { n: chaos(r.profit.chaos, lang, true) }) : '—'}
                </td>
                <td className="fm-num">
                  <Deaths n={r.deaths} />
                </td>
                <td>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                    title={t('farm.runs.remove')}
                    aria-label={t('farm.runs.remove')}
                    onClick={() => void removeRun(r.id)}
                  >
                    <Ico name="trash" size="sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------- панель

export function FarmPanel(props: FarmPanelProps = {}) {
  const t = useT()
  const simple = useSimple()
  const ready = useFarmStore((s) => s.ready)
  const state = useFarmStore((s) => s.state)
  const log = useFarmStore((s) => s.log)
  const init = useFarmStore((s) => s.init)
  const setConfig = useFarmStore((s) => s.setConfig)
  const now = useNow(farmTicking(state))

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])

  if (!ready || !state) return <div className="ui-empty">{t('farm.loading')}</div>

  return (
    <div className="fm">
      {log && !log.supported && (
        <div className="ui-banner ui-banner--info">
          <Ico name="info" />
          <span>{t('farm.log.unsupported')}</span>
        </div>
      )}
      {log && log.supported && !log.connected && (
        <div className="ui-banner ui-banner--bad">
          <Ico name="warn" />
          <span>{t('farm.log.off')}</span>
        </div>
      )}

      {state.session ? <RunningView state={state} now={now} props={props} /> : <IdleView state={state} />}

      <AllRuns runs={state.runs} />

      <div className="fm-widget">
        <Switch on={state.config.overlayWidget} onChange={(v) => void setConfig({ overlayWidget: v })}>
          {t('farm.widget.toggle')}
        </Switch>
        {simple && <p className="fm-p fm-faint">{t('farm.widget.hint')}</p>}
      </div>
    </div>
  )
}
