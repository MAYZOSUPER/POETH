import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { PricePopupPosition } from '@shared/types'
import { clampToArea, placeWidget, type Point, type Rect, type Size } from './placement'
import { scheduleRectsFlush, useInteractive } from './interactive'
import { useOverlayStore } from '../store/useOverlayStore'

// Обёртка виджета оверлея: позиционирует себя (у курсора, у края окна игры или там, куда его
// перетащили, — в пределах окна игры и монитора, см. placement.ts) и регистрирует свой прямоугольник
// как кликабельный, пока оверлей пассивен. Без placement — место задаёт слой (стопки тостов и карточек).
//
// keepFocus (окно цены): нажатие внутри активирует оверлей — фокус и окно остаются, пока игрок сам не
// закроет (Esc, клик мимо, повторный Ctrl+D), как в APT. Перетаскивание — за любой элемент с атрибутом
// data-drag-handle (шапку), кроме кнопок и полей внутри него; итог — placement.onMoved.

export interface WidgetPlacement {
  mode: PricePopupPosition
  /** курсор в момент Ctrl+D (CapturedItem.cursor) */
  anchor: Point
  /** монитор под курсором (CapturedItem.area) */
  area?: Rect | null
  /** куда окно перетащили в прошлый раз (для mode 'saved') */
  saved?: Point | null
  /** окно перетащили за data-drag-handle — новый левый верхний угол */
  onMoved?: (p: Point) => void
}

interface Props {
  placement?: WidgetPlacement
  /** ловить мышь над виджетом, не активируя оверлей (по умолчанию да) */
  interactive?: boolean
  /** нажатие внутри активирует оверлей и не отдаёт фокус игре после клика */
  keepFocus?: boolean
  className?: string
  children: ReactNode
}

/** Элементы, которые не начинают перетаскивание, даже если лежат в шапке. */
const NO_DRAG = 'button, a, input, select, textarea, label, [role="checkbox"], [role="switch"], [data-no-drag]'
/** Сдвиг, после которого нажатие — уже перетаскивание, а не клик. */
const DRAG_THRESHOLD = 3

function useViewport(): Size {
  const [size, setSize] = useState<Size>({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function OverlayWidget({ placement, interactive = true, keepFocus = false, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const viewport = useViewport()
  const [size, setSize] = useState<Size | null>(null)
  const [dragPos, setDragPos] = useState<Point | null>(null)

  useInteractive(ref, interactive)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const width = el.offsetWidth
      const height = el.offsetHeight
      setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const placed = placement && size ? placeWidget({ ...placement, size, viewport }) : null
  const pos = dragPos ?? placed

  // виджет переехал — main должен узнать новый прямоугольник
  useLayoutEffect(() => {
    if (interactive) scheduleRectsFlush()
  }, [interactive, pos?.x, pos?.y])

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    // окно цены: нажатие внутри — оверлей активен, фокус не уходит игре (клавиатура для полей тоже)
    if (keepFocus && !useOverlayStore.getState().focus.overlay) window.overlayApi.overlay.activate()

    const target = e.target as Element
    if (!placement?.onMoved || !placed || !size || !target.closest('[data-drag-handle]') || target.closest(NO_DRAG)) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const from = placed
    let moved = false
    let last = from
    const onMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      moved = true
      last = clampToArea({ x: from.x + dx, y: from.y + dy }, size, viewport, placement.area)
      setDragPos(last)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (moved) placement.onMoved?.(last)
      setDragPos(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const style = placement
    ? {
        left: pos ? Math.round(pos.x) : 0,
        top: pos ? Math.round(pos.y) : 0,
        visibility: pos ? ('visible' as const) : ('hidden' as const)
      }
    : undefined

  return (
    <div
      ref={ref}
      className={`ov-widget${className ? ` ${className}` : ''}${dragPos ? ' is-dragging' : ''}`}
      style={style}
      data-keep-focus={keepFocus || undefined}
      onMouseDown={keepFocus || placement?.onMoved ? onMouseDown : undefined}
    >
      {children}
    </div>
  )
}
