import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Deal, DealCardAction, UiLang } from '@shared/types'
import { activeCards, ageParts, cardActions, cardsFit } from '@shared/deals/cards'
import { isKnownQuadTab } from '@shared/deals/history'
import { calibrationFromCorners, stashCellRect, stashGridRect, type Point } from '@shared/deals/stashGrid'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { Icon, type IconName } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import { blacklistWarning, coinClass } from '../../panels/deals/format'
import { useDealsOverlay } from './store'
import './deals-overlay.css'

// Карточки сделок поверх игры (S8, фаза 2) по утверждённому макету: стопка справа снизу
// (слой cards), свежие сверху. Каждая кнопка — ровно одна команда в чат игры (main строит её из
// истории и шаблонов и печатает через typeInChat S1). Карточки кликабельны без активации
// оверлея (OverlayWidget → interactive rects S1), после клика фокус возвращается игре.
// Здесь же — подсветка ячейки тайника и калибровка сетки двумя кликами.

const ACTION_ICON: Record<DealCardAction, IconName> = {
  invite: 'invite',
  trade: 'trade',
  kick: 'kick',
  whois: 'search',
  hideout: 'home',
  thanks: 'heart',
  sold: 'sold',
  still: 'ask',
  wait: 'pause'
}

/** Второстепенные — только иконкой и в простом режиме (меньше шума на карточке). */
const SECONDARY: DealCardAction[] = ['wait', 'whois']

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), stepMs)
    return () => window.clearInterval(t)
  }, [stepMs])
  return now
}

function DealsWidget() {
  const init = useDealsOverlay((s) => s.init)
  const ready = useDealsOverlay((s) => s.ready)
  const state = useDealsOverlay((s) => s.state)
  const settings = useDealsOverlay((s) => s.settings)
  const t = useOverlayT()
  const now = useNow(5000)

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])

  if (!ready || !state || !settings) return null
  const enabled = settings.deals.enabled
  const cards = enabled ? activeCards(state.deals, state.config, now) : []
  const shown = cards.slice(0, cardsFit(window.innerHeight))
  const more = cards.length - shown.length

  return (
    <>
      {shown.map((d) => (
        <OverlayWidget key={d.id} className="dl-ov-card">
          <DealCard deal={d} now={now} />
        </OverlayWidget>
      ))}
      {more > 0 && <div className="dl-ov-more ui-tag">{t('deals.card.more', { n: more })}</div>}
      {enabled && state.config.highlightStash && <StashHighlight cards={cards} />}
      <Calibration />
    </>
  )
}

function DealCard({ deal: d, now }: { deal: Deal; now: number }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const simple = useDealsOverlay((s) => s.settings?.simpleMode ?? true)
  const highlightId = useDealsOverlay((s) => s.highlightId)
  const note = useDealsOverlay((s) => s.notes[d.id])
  const busy = useDealsOverlay((s) => s.busyId === d.id)
  const { act, hide, ignore, toggleHighlight, startCalibration } = useDealsOverlay.getState()
  const age = ageParts(d.ts, now)
  const actions = cardActions(d)
  const warn = !!d.blacklist && d.dir === 'in'
  const where =
    d.pos && t('deals.where', { tab: d.tab ? d.tab : t('deals.where.noTab'), left: d.pos.left, top: d.pos.top })

  const who =
    d.dir === 'in'
      ? t(d.status === 'invited' ? 'deals.card.in.invited' : 'deals.card.in.wants')
      : t('deals.card.out.waiting')

  const button = (a: DealCardAction): JSX.Element => {
    const label = t(warn && a === 'invite' ? 'deals.card.inviteAnyway' : `deals.cmd.${a}`)
    const iconOnly = !simple || SECONDARY.includes(a)
    const cls = [
      'ui-btn ui-btn--sm',
      a === 'kick' ? 'ui-btn--danger' : '',
      warn && a === 'invite' ? 'ui-btn--ghost' : '',
      iconOnly ? 'ui-btn--icon' : ''
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <button
        key={a}
        type="button"
        className={cls}
        disabled={busy}
        title={`${label} — ${t('deals.card.oneCommand')}`}
        aria-label={label}
        onClick={() => void act(d.id, a)}
      >
        <Icon name={ACTION_ICON[a]} />
        {!iconOnly && label}
      </button>
    )
  }

  return (
    <section className={`ui-panel dl-ov-deal${d.dir === 'out' ? ' ui-deal--out' : ''}${warn ? ' ui-deal--warn' : ''}`}>
      <header className="ui-panel__head ui-panel__head--plain">
        <span className="ui-deal__kind">{t(d.dir === 'in' ? 'deals.cmd.in' : 'deals.cmd.out')}</span>
        <span className="ui-deal__time">{t(`deals.card.age.${age.unit}`, { n: age.n })}</span>
        <span className="dl-ov-grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={t('deals.card.hide')}
          aria-label={t('deals.card.hide')}
          onClick={() => void hide(d.id)}
        >
          <Icon name="close" />
        </button>
      </header>
      {warn && d.blacklist && (
        <div className="ui-banner ui-banner--bad dl-ov-banner">
          <Icon name="warn" />
          <span>
            <b>{blacklistWarning(d.blacklist, lang as UiLang)}</b> {t('deals.card.checkTrade')}
          </span>
          <span />
        </div>
      )}
      <div className="ui-deal__body">
        <div className="ui-deal__who">
          {d.player} <span>{who}</span>
        </div>
        <div className="ui-deal__item">
          <span className={`dl-ov-item${d.gem ? ' dl-ov-item--gem' : d.bulk ? ' dl-ov-item--cur' : ''}`}>
            {d.itemAmount !== undefined ? `${d.itemAmount} × ` : ''}
            {d.item}
            {d.gem && ` (${d.gem.level}/${d.gem.quality}%)`}
          </span>
          {d.price && (
            <span className="ui-toast__price">
              <i className={coinClass(d.priceValue?.currency)} />
              {d.price}
            </span>
          )}
        </div>
        {where && (
          <div className="ui-deal__where">
            <Icon name="grid" size="sm" />
            <span>{where}</span>
          </div>
        )}
        {d.message && <div className="dl-ov-msg">«{d.message}»</div>}
        {!simple && d.raw && <div className="dl-ov-raw">{d.raw}</div>}
      </div>
      <div className="ui-deal__actions">
        {warn && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void ignore(d.id)}>
            <Icon name="close" />
            {t('deals.act.ignore')}
          </button>
        )}
        {actions.map(button)}
        {d.dir === 'in' && d.pos && (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost"
            aria-pressed={highlightId === d.id}
            onClick={() => toggleHighlight(d.id)}
          >
            <Icon name="grid" />
            {simple && t(highlightId === d.id ? 'deals.card.stashHide' : 'deals.card.stashShow')}
          </button>
        )}
        {d.dir === 'in' && d.pos && highlightId === d.id && !simple && (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
            title={t('deals.card.calibrate')}
            aria-label={t('deals.card.calibrate')}
            onClick={() => {
              window.overlayApi.overlay.activate()
              startCalibration()
            }}
          >
            <Icon name="edit" />
          </button>
        )}
      </div>
      {note && (
        <div className={`dl-ov-note${note.kind === 'error' ? ' dl-ov-note--bad' : ''}`} role="status">
          <Icon name={note.kind === 'ok' ? 'check' : 'warn'} size="sm" />
          {t(note.key)}
        </div>
      )}
    </section>
  )
}

/** Размер клиентской области игры в физических пикселях (калибровка и скриншоты — в них). */
function clientPhysical(): { width: number; height: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1
  return { width: Math.round(window.innerWidth * dpr), height: Math.round(window.innerHeight * dpr), dpr }
}

function StashHighlight({ cards }: { cards: Deal[] }) {
  const t = useOverlayT()
  const highlightId = useDealsOverlay((s) => s.highlightId)
  const settings = useDealsOverlay((s) => s.settings)
  const state = useDealsOverlay((s) => s.state)
  const [, setTick] = useState(0)
  useEffect(() => {
    const onResize = (): void => setTick((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const deal = cards.find((d) => d.id === highlightId)
  if (!deal?.pos || !settings || !state) return null
  const c = clientPhysical()
  const cell = stashCellRect(c, deal.pos, {
    mode: settings.deals.stashGrid,
    calibration: settings.deals.calibration,
    inFolder: state.config.stashInFolder,
    knownQuad: isKnownQuadTab(state.quadTabs, deal.tab)
  })
  if (!cell) return null
  const x = cell.x / c.dpr
  const y = cell.y / c.dpr
  const w = cell.width / c.dpr
  const h = cell.height / c.dpr
  return (
    <>
      <div className="ui-stash-hit dl-ov-hit" style={{ left: x, top: y, width: w, height: h }} />
      <div className="dl-ov-hitlabel" style={{ left: x + w / 2, top: y }}>
        <div className="ui-panel ui-panel--solid">
          {deal.item} · {t('deals.card.cellShort', { left: deal.pos.left, top: deal.pos.top })}
        </div>
      </div>
    </>
  )
}

/** Калибровка: клик в левый-верхний угол первой ячейки, затем в правый-нижний угол последней. */
function Calibration() {
  const t = useOverlayT()
  const calibrating = useDealsOverlay((s) => s.calibrating)
  const end = useDealsOverlay((s) => s.endCalibration)
  const [first, setFirst] = useState<Point | null>(null)
  const [result, setResult] = useState<'saved' | 'invalid' | null>(null)

  useEffect(() => {
    if (!calibrating) {
      setFirst(null)
      setResult(null)
    }
  }, [calibrating])

  if (!calibrating) return null

  const finish = (): void => {
    end()
    window.overlayApi.overlay.focusGame()
  }

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    if (result === 'saved') return
    const c = clientPhysical()
    const p = { x: e.clientX * c.dpr, y: e.clientY * c.dpr }
    if (!first) {
      setFirst(p)
      setResult(null)
      return
    }
    const cal = calibrationFromCorners(first, p, c)
    if (!cal) {
      setFirst(null)
      setResult('invalid')
      return
    }
    void window.overlayApi.settings.set({ deals: { calibration: cal } }).then(async () => {
      await useDealsOverlay.getState().refreshSettings()
      setResult('saved')
      window.setTimeout(finish, 1400)
    })
  }

  const settings = useDealsOverlay.getState().settings
  const c = clientPhysical()
  const grid = result === 'saved' && settings?.deals.calibration ? stashGridRect(c, { calibration: settings.deals.calibration }) : null

  return createPortal(
    <div className="dl-ov-calib" onMouseDown={(e) => e.stopPropagation()} onClick={onClick}>
      <div className="ui-panel ui-panel--solid dl-ov-calib__box" onClick={(e) => e.stopPropagation()}>
        <header className="ui-panel__head">
          <span className="ui-panel__title">{t('deals.calib.title')}</span>
        </header>
        <div className="ui-panel__body dl-ov-calib__body">
          <p>{t(first ? 'deals.calib.step2' : 'deals.calib.step1')}</p>
          {result === 'invalid' && <p className="ui-field__error">{t('deals.stash.calib.invalid')}</p>}
          {result === 'saved' && <p className="dl-ov-ok">{t('deals.stash.calib.saved')}</p>}
          <div className="dl-ov-row">
            <button type="button" className="ui-btn ui-btn--sm" onClick={finish}>
              {t('deals.calib.cancel')}
            </button>
            {settings?.deals.calibration && (
              <button
                type="button"
                className="ui-btn ui-btn--sm ui-btn--ghost"
                onClick={() =>
                  void window.overlayApi.settings
                    .set({ deals: { calibration: null } })
                    .then(() => useDealsOverlay.getState().refreshSettings())
                    .then(finish)
                }
              >
                {t('deals.stash.calib.reset')}
              </button>
            )}
          </div>
        </div>
      </div>
      {first && (
        <div className="dl-ov-calib__pt" style={{ left: first.x / c.dpr, top: first.y / c.dpr }} aria-hidden="true" />
      )}
      {grid && (
        <div
          className="dl-ov-calib__grid"
          style={{ left: grid.x / c.dpr, top: grid.y / c.dpr, width: grid.width / c.dpr, height: grid.height / c.dpr }}
        />
      )}
    </div>,
    document.body
  )
}

const widget: OverlayWidgetDef = { id: 'deals', layer: 'cards', Component: DealsWidget }
export default widget
