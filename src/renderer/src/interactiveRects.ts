// Collects interactive-region rectangles from the renderer and forwards their
// union to the main process, which uses them for selective click-through.

import type { InteractiveRect } from '@shared/types'

const map = new Map<string, DOMRect>()
let scheduled = 0

function flush(): void {
  scheduled = 0
  const rects: InteractiveRect[] = [...map.values()].map((r) => ({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  }))
  window.overlayApi.window.updateInteractiveRects(rects)
}

function schedule(): void {
  if (scheduled) return
  scheduled = requestAnimationFrame(flush)
}

export function setRect(id: string, rect: DOMRect | null): void {
  if (rect && rect.width > 0 && rect.height > 0) map.set(id, rect)
  else map.delete(id)
  schedule()
}
