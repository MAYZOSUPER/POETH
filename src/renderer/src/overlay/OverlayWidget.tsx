import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { placeWidget, type PlacementMode, type Point, type Size } from './placement'
import { scheduleRectsFlush, useInteractive } from './interactive'

// Обёртка виджета оверлея: позиционирует себя (у курсора или с противоположной
// стороны экрана, см. placement.ts) и регистрирует свой прямоугольник как
// кликабельный, пока оверлей пассивен. Без placement — позиционирование на CSS виджета.

export interface WidgetPlacement {
  mode: PlacementMode
  anchor: Point
}

interface Props {
  placement?: WidgetPlacement
  /** ловить мышь над виджетом, не активируя оверлей (по умолчанию да) */
  interactive?: boolean
  className?: string
  children: ReactNode
}

function useViewport(): Size {
  const [size, setSize] = useState<Size>({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function OverlayWidget({ placement, interactive = true, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const viewport = useViewport()
  const [size, setSize] = useState<Size | null>(null)

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

  const pos = placement && size ? placeWidget({ ...placement, size, viewport }) : null

  // виджет переехал — main должен узнать новый прямоугольник
  useLayoutEffect(() => {
    if (interactive) scheduleRectsFlush()
  }, [interactive, pos?.x, pos?.y])

  const style = placement
    ? {
        left: pos ? Math.round(pos.x) : 0,
        top: pos ? Math.round(pos.y) : 0,
        visibility: pos ? ('visible' as const) : ('hidden' as const)
      }
    : undefined

  return (
    <div ref={ref} className={`ov-widget${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  )
}
