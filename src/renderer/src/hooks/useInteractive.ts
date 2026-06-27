import { useEffect, useRef } from 'react'
import { setRect } from '../interactiveRects'

let counter = 0

/**
 * Marks an element as a mouse-interactive region. Its bounding rect is reported
 * to the main process so clicks land on it while the rest of the overlay stays
 * click-through. Re-measures on resize, scroll and periodically (the renderer
 * has no window-move event, so a light poll keeps the rect correct after drags).
 */
export function useInteractive<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const idRef = useRef(`ir-${counter++}`)

  useEffect(() => {
    const el = ref.current
    const id = idRef.current
    if (!el) return

    const update = (): void => setRect(id, el.getBoundingClientRect())
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const interval = window.setInterval(update, 400)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.clearInterval(interval)
      setRect(id, null)
    }
  }, [])

  return ref
}
