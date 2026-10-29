import { useEffect, useLayoutEffect, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { viewToCss, type TreeView } from '@shared/build/treeOverlay'
import type { TreeDrawNode, TreeDrawing } from '@shared/build/treeOverlayDraw'
import type { TreeOverlayState, TreeOverlayViewEvent } from '@shared/build/treeOverlayState'
import { Icon } from '../Icon'
import { scheduleRectsFlush, useInteractive } from '../interactive'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import './tree.css'

// Дерево этапа билда поверх игрового дерева пассивок (S38). Хоткей buildTree (Alt+P) — main показывает и прячет,
// здесь только рисунок: кольца нод этапа (зелёные — взять, белые — были, приглушённые — уже взяты по журналу,
// красные — снять при переходе), пути между ними и подписи нотаблей. Ноды и пути — в координатах дерева под одним
// transform: панорама вслед за мышью (event:buildTree.view) меняет только его. Мышь проходит в игру везде, кроме
// плашки этапа сверху по центру: ← →, колесо над плашкой листает этапы, «В центр», спрятать.

/** Кольцо ноды на экране не меньше этого (CSS-пиксели) — при сильном отдалении ноды игры мельче. */
const MIN_RING_PX = 5
/** Подписи нотаблей — только когда дерево не слишком отдалено (иначе налезают друг на друга). */
const LABEL_MIN_SCALE = 0.07

function useTreeOverlay(): { st: TreeOverlayState | null; pos: TreeOverlayViewEvent | null } {
  const [st, setSt] = useState<TreeOverlayState | null>(null)
  const [pos, setPos] = useState<TreeOverlayViewEvent | null>(null)
  useEffect(() => {
    const api = window.overlayApi
    const apply = (s: TreeOverlayState): void => {
      setSt(s)
      setPos(s.view ? { view: s.view, drift: s.drift } : null)
    }
    const offState = api.onBuildTreeState(apply)
    const offView = api.onBuildTreeView(setPos)
    void api.buildTree.state().then(apply)
    return () => {
      offState()
      offView()
    }
  }, [])
  return { st, pos }
}

function ringRadius(n: TreeDrawNode, scale: number): number {
  return Math.max(n.r, MIN_RING_PX / scale)
}

function TreeSvg({ drawing, view, drift, lang }: { drawing: TreeDrawing; view: TreeView; drift: boolean; lang: string }) {
  const { scale, ox, oy } = view
  const labels = scale >= LABEL_MIN_SCALE ? drawing.nodes.filter((n) => n.label) : []
  return (
    <svg className={`bt-svg${drift ? ' is-drift' : ''}`} aria-hidden="true">
      <g transform={`matrix(${scale} 0 0 ${scale} ${ox} ${oy})`}>
        {drawing.edges.map((e) => (
          <path key={`${e.a}-${e.b}`} d={e.d} className={`bt-edge bt--${e.state}`} vectorEffect="non-scaling-stroke" />
        ))}
        {drawing.nodes.map((n) => (
          <circle
            key={n.hash}
            cx={n.x}
            cy={n.y}
            r={ringRadius(n, scale)}
            className={`bt-node bt--${n.state} bt-k--${n.kind}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {labels.map((n) => {
        const r = ringRadius(n, scale) * scale
        return (
          <text key={n.hash} x={n.x * scale + ox + r + 4} y={n.y * scale + oy} className={`bt-label bt--${n.state}`}>
            {lang === 'ru' ? n.ru : n.en}
          </text>
        )
      })}
    </svg>
  )
}

function Panel({ st, drift }: { st: TreeOverlayState; drift: boolean }) {
  const t = useOverlayT()
  const ref = useRef<HTMLDivElement>(null)
  useInteractive(ref)
  const api = window.overlayApi.buildTree

  // прямоугольник плашки — в main: над ней мышь попадает в оверлей и дерево игры не двигает
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const send = (): void => {
      const r = el.getBoundingClientRect()
      api.panel({ x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) })
      scheduleRectsFlush()
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    return () => {
      ro.disconnect()
      api.panel(null)
    }
  }, [api])

  const stage = st.stage
  const d = st.drawing
  const onWheel = (e: ReactWheelEvent): void => {
    if (e.deltaY !== 0) void api.step(e.deltaY > 0 ? 1 : -1)
  }
  const hint = st.problem
    ? t(`bt.problem.${st.problem}`)
    : drift
      ? t('bt.hint.zoom')
      : !st.aligned
        ? t('bt.hint.align')
        : null
  const version = st.build?.treeVersion && st.dataTree ? st.build.treeVersion.replace('_', '.') : null
  const oldTree = version && st.dataTree && !st.dataTree.startsWith(version) ? version : null

  return (
    <div ref={ref} className="ui-panel bt-panel" onWheel={onWheel} role="status">
      {stage && (
        <div className="bt-panel__row">
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm bt-flip"
            aria-label={t('bt.prev')}
            title={t('bt.prev')}
            disabled={stage.index === 0}
            onClick={() => void api.step(-1)}
          >
            <Icon name="chev-r" />
          </button>
          <span className="bt-panel__title">
            <Icon name="passive" />
            <b>{stage.title}</b>
            <span className="bt-panel__of">
              {t('bt.stage', { i: stage.index + 1, n: stage.count })}
              {stage.auto ? ` · ${t('bt.stage.auto')}` : ''}
            </span>
          </span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            aria-label={t('bt.next')}
            title={t('bt.next')}
            disabled={stage.index >= stage.count - 1}
            onClick={() => void api.step(1)}
          >
            <Icon name="chev-r" />
          </button>
          {d && (
            <span className="bt-legend">
              <span className="bt-chip bt--take">{t('bt.legend.take', { n: d.counts.take })}</span>
              {d.counts.taken > 0 && <span className="bt-chip bt--taken">{t('bt.legend.taken', { n: d.counts.taken })}</span>}
              {d.counts.remove > 0 && <span className="bt-chip bt--remove">{t('bt.legend.remove', { n: d.counts.remove })}</span>}
            </span>
          )}
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" title={t('bt.center.tip')} onClick={() => void api.reset()}>
            {t('bt.center')}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            aria-label={t('bt.close')}
            title={t('bt.close')}
            onClick={() => void api.hide()}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {!stage && (
        <div className="bt-panel__row">
          <Icon name="passive" />
          <span className="bt-panel__problem">{hint}</span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            aria-label={t('bt.close')}
            title={t('bt.close')}
            onClick={() => void api.hide()}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {stage && hint && <div className={`bt-panel__hint${drift || st.problem ? ' is-warn' : ''}`}>{hint}</div>}
      {stage && oldTree && <div className="bt-panel__hint">{t('bt.hint.version', { v: oldTree, d: st.dataTree ?? '' })}</div>}
      {stage && d && d.missing > 0 && <div className="bt-panel__hint">{t('bt.hint.missing', { n: d.missing })}</div>}
    </div>
  )
}

function TreeOverlay() {
  const { st, pos } = useTreeOverlay()
  if (!st?.enabled || !st.visible) return null
  const dpr = window.devicePixelRatio || 1
  const view = pos ? viewToCss(pos.view, dpr) : null
  const drift = !!pos?.drift
  return (
    <div className="bt-root">
      {st.drawing && view && <TreeSvg drawing={st.drawing} view={view} drift={drift} lang={st.lang} />}
      <Panel st={st} drift={drift} />
    </div>
  )
}

// ниже карточек и тостов: рисунок на всё окно, мышь — в игру
const widget: OverlayWidgetDef = { id: 'tree', layer: 'cards', order: -100, Component: TreeOverlay }
export default widget
