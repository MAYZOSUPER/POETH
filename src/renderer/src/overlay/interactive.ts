import { useLayoutEffect, type RefObject } from 'react'
import type { InteractiveRect } from '@shared/types'

// Реестр интерактивных элементов оверлея. Пока оверлей пассивен (мышь — в игру), main
// ловит мышь только над этими прямоугольниками (focus/interactiveAreas.ts). Сюда
// попадают все виджеты <OverlayWidget interactive>; координаты — окна оверлея (CSS px).

const elements = new Set<HTMLElement>()
let timer: number | null = null
let lastSent = ''

function collect(): InteractiveRect[] {
  const out: InteractiveRect[] = []
  for (const el of elements) {
    if (!el.isConnected) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    out.push({
      x: Math.floor(r.left),
      y: Math.floor(r.top),
      width: Math.ceil(r.width),
      height: Math.ceil(r.height)
    })
  }
  return out
}

function flush(): void {
  timer = null
  const rects = collect()
  const key = JSON.stringify(rects)
  if (key === lastSent) return
  lastSent = key
  window.overlayApi.overlay.updateInteractiveRects(rects)
}

/** Пересчитать прямоугольники (после перемещения/изменения виджета); вызовы склеиваются. */
export function scheduleRectsFlush(): void {
  // setTimeout, а не requestAnimationFrame: rAF не тикает, пока окно оверлея скрыто
  if (timer === null) timer = window.setTimeout(flush, 16)
}

/** Сделать элемент кликабельным в пассивном режиме оверлея. */
export function useInteractive(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    elements.add(el)
    scheduleRectsFlush()
    const ro = new ResizeObserver(scheduleRectsFlush)
    ro.observe(el)
    return () => {
      ro.disconnect()
      elements.delete(el)
      scheduleRectsFlush()
    }
  }, [ref, enabled])
}

window.addEventListener('resize', scheduleRectsFlush)
