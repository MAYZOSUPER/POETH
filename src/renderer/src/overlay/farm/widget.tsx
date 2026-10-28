import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FarmState, FarmWidgetPos } from '@shared/types/farm'
import { useOverlayStore } from '../../store/useOverlayStore'
import { farmTicking, useFarmStore } from '../../store/useFarmStore'
import { chaos, clock, currentRunMs, latestDivineRate, rate, runName, sessionMs } from '../../panels/farm/format'
import { Icon } from '../Icon'
import { scheduleRectsFlush, useInteractive } from '../interactive'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import { CoinIcon, CurrencyTipBody, TipAnchor } from '../../components/Currency'
import './farm-overlay.css'

// Мини-виджет фарма поверх игры (S11b) по макету дизайнера: полоса 34 px сверху по центру —
// таймер карты (в убежище — время последней карты, на паузе — часы сессии), карт за сессию,
// доход в час (от учёта богатства S11a). Только во время сессии и если включён в разделе
// «Сессия фарма» (FarmConfig.overlayWidget). Клики проходят в игру везде, кроме «⋮⋮»
// (перетащить, позиция запоминается) и двух кнопок: «Пауза»/«Продолжить» и «Скрыть».
// Пока тянут, весь экран оверлея ловит мышь (иначе курсор уйдёт с ручки и фокус вернётся игре).

const DEFAULT_TOP_PX = 14
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

/** Простой режим из настроек (перечитываем, когда игрок вернулся в игру). */
function useSimpleMode(): boolean {
  const [simple, setSimple] = useState(true)
  useEffect(() => {
    const read = (): void => {
      void window.overlayApi.settings.get().then((s) => setSimple(s.ui.simpleMode))
    }
    read()
    return window.overlayApi.onOverlayFocus(read)
  }, [])
  return simple
}

/** Центр полосы и верх в px окна оверлея; без позиции — сверху по центру. */
function toPx(pos: FarmWidgetPos | null): { cx: number; top: number } {
  if (!pos) return { cx: window.innerWidth / 2, top: DEFAULT_TOP_PX }
  return { cx: pos.x * window.innerWidth, top: pos.y * window.innerHeight }
}

function FarmBar({ state, now }: { state: FarmState; now: number }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const simple = useSimpleMode()
  const pause = useFarmStore((s) => s.pause)
  const resume = useFarmStore((s) => s.resume)
  const setConfig = useFarmStore((s) => s.setConfig)
  const gripRef = useRef<HTMLSpanElement>(null)
  const btnsRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const shieldRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number; cx: number; top: number } | null>(null)
  const [, setViewport] = useState(0)

  useInteractive(gripRef)
  useInteractive(btnsRef)
  useInteractive(shieldRef, !!drag)

  useEffect(() => {
    const onResize = (): void => setViewport((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const base = toPx(state.config.widgetPos)
  const cx = drag ? drag.cx : base.cx
  const top = drag ? drag.top : base.top

  // полоса уехала (перетащили, сменилась ширина) — main должен узнать новые прямоугольники
  useLayoutEffect(() => {
    scheduleRectsFlush()
  }, [cx, top])

  const done = () => window.overlayApi.overlay.focusGame()

  const onGripDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    setDrag({ dx: e.clientX - cx, dy: e.clientY - top, cx, top })
  }

  useEffect(() => {
    if (!drag) return
    const { dx, dy } = drag
    const move = (e: PointerEvent): void => {
      const w = barRef.current?.offsetWidth ?? 0
      const h = barRef.current?.offsetHeight ?? 0
      const nx = Math.min(window.innerWidth - w / 2, Math.max(w / 2, e.clientX - dx))
      const ny = Math.min(window.innerHeight - h, Math.max(0, e.clientY - dy))
      setDrag((d) => (d ? { ...d, cx: nx, top: ny } : d))
    }
    const up = (): void => {
      setDrag((d) => {
        if (d) void setConfig({ widgetPos: { x: d.cx / window.innerWidth, y: d.top / window.innerHeight } })
        return null
      })
      done()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // смещение курсора от ручки фиксируется в начале перетаскивания
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.dx, drag?.dy])

  const stats = state.stats
  const paused = state.session?.pausedAt !== null
  const run = state.current && state.current.sessionId === state.session?.id ? state.current : null
  const last = state.runs.find((r) => r.sessionId === state.session?.id) ?? null
  const dur = sessionMs(state, now)
  const perHour = stats && stats.profitChaos !== null && dur >= 60_000 ? stats.profitChaos / (dur / HOUR) : null
  // как на плитке: от 1 div в час — div/ч (курс из прибылей S11a), меньше или без курса — c/ч
  const rateDiv = latestDivineRate(state.runs.filter((r) => r.sessionId === state.session?.id))
  const divRate = rateDiv && perHour !== null && Math.abs(perHour / rateDiv) >= 1 ? rateDiv : null
  const incomeText = perHour === null ? '—' : divRate ? rate(perHour / divRate, lang) : chaos(perHour, lang)

  let first
  if (paused) {
    first = (
      <span className="ui-hud__seg">
        <Icon name="pause" />
        <span className="ui-hud__state">{t('farm.ov.paused')}</span>
        <b className="ui-hud__time">{clock(dur, true)}</b>
      </span>
    )
  } else if (run && state.inside) {
    first = (
      <span className="ui-hud__seg" title={t('farm.ov.map')}>
        <Icon name="map" />
        {simple && <span className="ui-hud__name">{runName(run)}</span>}
        <b className="ui-hud__time">{clock(currentRunMs(state, now))}</b>
      </span>
    )
  } else {
    // в убежище (или вышли из карты через портал): время последней карты
    const lastMs = run ? currentRunMs(state, now) : last?.activeMs
    first = (
      <span className="ui-hud__seg">
        <Icon name="home" />
        <span className="ui-hud__state">{t('farm.ov.hideout')}</span>
        {lastMs !== undefined && (
          <>
            {simple && <span className="ui-hud__lbl">{t('farm.ov.last')}</span>}
            <b>{clock(lastMs)}</b>
          </>
        )}
      </span>
    )
  }

  return (
    <>
      {drag && <div ref={shieldRef} className="ov-farm-shield" />}
      <div
        ref={barRef}
        className={`ui-panel ui-hud ov-farm${paused ? ' ui-hud--pause' : ''}`}
        role="status"
        aria-label={t('farm.ov.label')}
        style={{ left: Math.round(cx), top: Math.round(top) }}
      >
        <span ref={gripRef} className="ui-hud__grip ov-farm__grip" title={t('farm.ov.drag')} onPointerDown={onGripDown}>
          <Icon name="drag" />
        </span>
        {first}
        <span className="ui-hud__sep" />
        <span className="ui-hud__seg" title={t('farm.ov.maps.title')}>
          {simple ? <span className="ui-hud__lbl">{t('farm.ov.maps')}</span> : <Icon name="grid" />}
          <b>{stats?.maps ?? 0}</b>
        </span>
        <span className="ui-hud__sep" />
        {/* S18: иконка игры; в подсказке — что за валюта (полоса узкая — подпись короткая и в простом режиме) */}
        <TipAnchor
          className="ui-hud__seg"
          tip={<CurrencyTipBody tag={divRate ? 'divine' : 'chaos'} lang={lang} extra={<b>{t('farm.ov.income.title')}</b>} />}
        >
          <CoinIcon tag={divRate ? 'divine' : 'chaos'} lang={lang} />
          <b>{incomeText}</b>
          <span className="ui-hud__lbl">{`${divRate ? 'div' : 'c'}${t('farm.ov.perHour')}`}</span>
        </TipAnchor>
        <span ref={btnsRef} className="ov-farm__btns">
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            aria-label={t(paused ? 'farm.ov.resume' : 'farm.ov.pause')}
            title={t(paused ? 'farm.ov.resume' : 'farm.ov.pause')}
            onClick={() => void (paused ? resume() : pause()).finally(done)}
          >
            <Icon name={paused ? 'play' : 'pause'} />
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            aria-label={t('farm.ov.hide')}
            title={t('farm.ov.hide')}
            onClick={() => void setConfig({ overlayWidget: false }).finally(done)}
          >
            <Icon name="min" />
          </button>
        </span>
      </div>
    </>
  )
}

function FarmWidget() {
  const init = useFarmStore((s) => s.init)
  const state = useFarmStore((s) => s.state)
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

  // только во время сессии и если виджет включён
  if (!state?.config.overlayWidget || !state.session) return null
  return <FarmBar state={state} now={now} />
}

// своё место (сверху по центру, перетаскивается) — в слое popup, без стопок
const widget: OverlayWidgetDef = { id: 'farm', layer: 'popup', order: -10, Component: FarmWidget }
export default widget
