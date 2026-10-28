import { useEffect, useState } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { farmTicking, useFarmStore } from '../../store/useFarmStore'
import { chaos, clock, currentRunMs, rate, runName, sessionMs } from '../../panels/farm/format'
import { OverlayWidget } from '../OverlayWidget'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import './farm-overlay.css'

// Виджет трекера карт поверх игры (S11b): таймер текущей карты, карт за сессию, карт в час и
// доход в час (от учёта богатства S11a, когда посчитан). Включается в панели «Карты»
// (FarmConfig.overlayWidget, по умолчанию выключен). Не кликабельный — мышь проходит в игру.

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

function FarmWidget() {
  const init = useFarmStore((s) => s.init)
  const state = useFarmStore((s) => s.state)
  const lang = useOverlayStore((s) => s.lang)
  const t = useOverlayT()
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

  if (!state?.config.overlayWidget || (!state.session && !state.current)) return null

  const run = state.current
  const stats = state.stats
  const paused = !!state.session && state.session.pausedAt !== null
  const dur = sessionMs(state, now)
  const hours = dur / 3_600_000
  const rated = dur >= 60_000

  return (
    <OverlayWidget interactive={false}>
      <div className={`ui-panel ov-farm${state.ticking ? ' ov-farm--on' : ''}`} role="status">
        <span className="ov-farm__timer">{run ? clock(currentRunMs(state, now)) : '—'}</span>
        {run && (
          <span className="ov-farm__map">
            {runName(run)}
            {run.tier !== null && <span className="ov-farm__tier">T{run.tier}</span>}
          </span>
        )}
        {run && !state.inside && <span className="ov-farm__muted">{t('farm.ov.out')}</span>}
        {paused && <span className="ov-farm__warn">{t('farm.ov.paused')}</span>}
        {stats && (
          <>
            <span className="ov-farm__sep" aria-hidden="true" />
            <span>{t('farm.ov.maps', { n: stats.maps })}</span>
            {rated && <span className="ov-farm__muted">{t('farm.ov.perHour', { v: rate(stats.maps / hours, lang) })}</span>}
            {rated && stats.profitChaos !== null && (
              <span className="ov-farm__gold">
                {t('farm.ov.perHour', { v: t('farm.chaos', { n: chaos(stats.profitChaos / hours, lang) }) })}
              </span>
            )}
          </>
        )}
      </div>
    </OverlayWidget>
  )
}

// в стопке справа сверху — выше уведомлений и тостов live (order)
const widget: OverlayWidgetDef = { id: 'farm', layer: 'toasts', order: -20, Component: FarmWidget }
export default widget
