import { useEffect, useState } from 'react'
import type { FarmRun, FarmState } from '@shared/types/farm'
import { useLang, useT } from '../../i18n'
import { farmTicking, useFarmStore } from '../../store/useFarmStore'
import { Ico, Rich, Switch, useSimple } from '../deals/common'
import { chaos, clock, currentRunMs, rate, runName, sessionMs, when } from './format'
import './farm.css'

// Панель «Карты» (S11b): сессия фарма «Начать / Пауза / Стоп», статистика (карт в час, среднее
// время карты, смерти, доход в час от учёта богатства S11a), текущая карта, история забегов и
// прошлых сессий, включение виджета поверх игры. Самодостаточна (свой стор и словарь dict/farm.ts) —
// ставится во вкладку «Богатство» (S11a). Забеги считает main по логу игры, только чтение.

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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="fm-stat" title={hint}>
      <span className="fm-stat__v">{value}</span>
      <span className="fm-stat__l">{label}</span>
    </div>
  )
}

function tierText(run: Pick<FarmRun, 'kind' | 'tier' | 'areaLevel'>, t: ReturnType<typeof useT>): string {
  if (run.kind === 'map' && run.tier !== null) return t('farm.tier', { tier: run.tier })
  return run.kind === 'other' ? t('farm.kind.other') : t('farm.level', { level: run.areaLevel })
}

function SessionBox({ state, now }: { state: FarmState; now: number }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const busy = useFarmStore((s) => s.busy)
  const start = useFarmStore((s) => s.start)
  const pause = useFarmStore((s) => s.pause)
  const resume = useFarmStore((s) => s.resume)
  const stop = useFarmStore((s) => s.stop)
  const session = state.session
  const stats = state.stats
  const paused = !!session && session.pausedAt !== null
  const na = '—'
  const status = !session ? 'idle' : paused ? 'paused' : 'running'
  const dur = sessionMs(state, now)

  return (
    <section className="fm-box" aria-label={t('farm.title')}>
      <div className="fm-box__h">
        <Ico name="map" />
        <span className="ui-label">{t('farm.title')}</span>
        <span className={`fm-status fm-status--${status}`}>{t(`farm.session.${status}`)}</span>
        <span className="ui-label__grow" />
        {!session && (
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={() => void start()}>
            {t('farm.session.start')}
          </button>
        )}
        {session && !paused && (
          <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => void pause()}>
            <Ico name="pause" />
            {t('farm.session.pause')}
          </button>
        )}
        {session && paused && (
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={() => void resume()}>
            {t('farm.session.resume')}
          </button>
        )}
        {session && (
          <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" disabled={busy} onClick={() => void stop()}>
            {t('farm.session.stop')}
          </button>
        )}
      </div>
      <div className="fm-box__b">
        {!session && simple && (
          <p className="fm-p">
            <Rich text={t('farm.session.hint')} />
          </p>
        )}
        {session && stats && (
          <div className="fm-stats">
            <Stat label={t('farm.stat.time')} value={clock(dur)} />
            <Stat label={t('farm.stat.maps')} value={String(stats.maps)} />
            <Stat
              label={t('farm.stat.perHour')}
              value={dur >= 60_000 ? rate(stats.maps / (dur / 3_600_000), lang) : na}
            />
            <Stat label={t('farm.stat.avg')} value={stats.avgMapMs !== null ? clock(stats.avgMapMs) : na} />
            <Stat label={t('farm.stat.deaths')} value={String(stats.deaths)} />
            <Stat
              label={t('farm.stat.income')}
              value={
                stats.profitChaos !== null && dur >= 60_000
                  ? t('farm.chaos', { n: chaos(stats.profitChaos / (dur / 3_600_000), lang) })
                  : na
              }
              hint={stats.profitChaos === null ? t('farm.stat.income.wait') : undefined}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function CurrentRun({ state, now }: { state: FarmState; now: number }) {
  const t = useT()
  const run = state.current
  if (!run) return <p className="fm-p fm-current fm-current--none">{t('farm.current.none')}</p>
  const where = !state.inside
    ? t('farm.current.outside')
    : state.ticking
      ? t('farm.current.inside')
      : t('farm.current.paused')
  return (
    <div className={`fm-current${state.inside ? ' fm-current--in' : ''}`}>
      <span className="fm-current__timer">{clock(currentRunMs(state, now))}</span>
      <span className="fm-current__name">{runName(run)}</span>
      <span className="ui-tag">{tierText(run, t)}</span>
      <span className="fm-muted">{where}</span>
      <span className="fm-grow" />
      <span className="fm-muted">{t('farm.current.deaths', { n: run.deaths })}</span>
      <span className="fm-muted">{t('farm.current.entries', { n: run.entries })}</span>
    </div>
  )
}

function RunsTable({ runs }: { runs: FarmRun[] }) {
  const t = useT()
  const lang = useLang()
  const removeRun = useFarmStore((s) => s.removeRun)
  if (runs.length === 0) return <p className="fm-p">{t('farm.runs.empty')}</p>
  return (
    <div className="fm-tablewrap">
      <table className="fm-tbl">
        <thead>
          <tr>
            <th>{t('farm.col.when')}</th>
            <th>{t('farm.col.map')}</th>
            <th>{t('farm.col.tier')}</th>
            <th>{t('farm.col.time')}</th>
            <th>{t('farm.col.deaths')}</th>
            <th title={t('farm.col.entries.title')}>{t('farm.col.entries')}</th>
            <th>{t('farm.col.profit')}</th>
            <th aria-label={t('farm.runs.remove')} />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className={r.deaths > 0 ? 'fm-row--died' : undefined}>
              <td className="fm-muted fm-nowrap">{when(r.startTs, lang)}</td>
              <td className="fm-name">{runName(r)}</td>
              <td className="fm-nowrap">{tierText(r, t)}</td>
              <td className="fm-num">{clock(r.activeMs)}</td>
              <td className="fm-num">{r.deaths}</td>
              <td className="fm-num">{r.entries}</td>
              <td className={`fm-num${r.profit && r.profit.chaos < 0 ? ' fm-loss' : ''}`}>
                {r.profit ? t('farm.chaos', { n: chaos(r.profit.chaos, lang) }) : '—'}
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
  )
}

export function FarmPanel() {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const ready = useFarmStore((s) => s.ready)
  const state = useFarmStore((s) => s.state)
  const log = useFarmStore((s) => s.log)
  const init = useFarmStore((s) => s.init)
  const setConfig = useFarmStore((s) => s.setConfig)
  const clear = useFarmStore((s) => s.clear)
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

  const onClear = (): void => {
    if (window.confirm(t('farm.runs.clearConfirm'))) void clear()
  }

  return (
    <div className="fm">
      {log && !log.supported && <div className="ui-banner ui-banner--info">{t('farm.log.unsupported')}</div>}
      {log && log.supported && !log.connected && <div className="ui-banner ui-banner--bad">{t('farm.log.off')}</div>}

      <SessionBox state={state} now={now} />

      <section className="fm-box">
        <div className="fm-box__h">
          <span className="ui-label">{t('farm.current.title')}</span>
        </div>
        <div className="fm-box__b">
          <CurrentRun state={state} now={now} />
          {simple && <p className="fm-p fm-faint">{t('farm.how')}</p>}
        </div>
      </section>

      <section className="fm-box">
        <div className="fm-box__h">
          <Ico name="history" />
          <span className="ui-label">{t('farm.runs.title')}</span>
          <span className="ui-label__grow" />
          {state.runs.length > 0 && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClear}>
              <Ico name="trash" />
              {t('farm.runs.clear')}
            </button>
          )}
        </div>
        <div className="fm-box__b">
          <RunsTable runs={state.runs} />
          {state.sessions.length > 0 && (
            <details className="fm-sessions">
              <summary className="ui-label">{t('farm.sessions.title')}</summary>
              <ul>
                {state.sessions.map((s) => (
                  <li key={s.id}>
                    <span className="fm-muted fm-nowrap">{when(s.startedAt, lang)}</span>{' '}
                    {t('farm.sessions.row', {
                      maps: s.stats.maps,
                      time: clock(s.stats.durationMs),
                      rate: s.stats.mapsPerHour !== null ? rate(s.stats.mapsPerHour, lang) : '—',
                      deaths: s.stats.deaths
                    })}
                    {s.stats.profitChaos !== null && (
                      <>
                        {' · '}
                        {t('farm.chaos', { n: chaos(s.stats.profitChaos, lang) })}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      <section className="fm-box">
        <div className="fm-box__b">
          <Switch on={state.config.overlayWidget} onChange={(v) => void setConfig({ overlayWidget: v })}>
            {t('farm.widget.toggle')}
          </Switch>
          {simple && <p className="fm-p fm-faint">{t('farm.widget.hint')}</p>}
        </div>
      </section>
    </div>
  )
}
