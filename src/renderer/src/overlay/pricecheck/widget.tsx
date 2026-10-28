import { useEffect, useRef } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import type { OverlayWidgetDef } from '../registry'
import { PriceWindow } from './PriceWindow'
import { preloadPriceCheckData, usePriceCheckStore } from './store'
import './pricecheck.css'

// Окно цены PoE1 (S4) — слой popup оверлея (S1): открывается по Ctrl+D у курсора (или где его оставили),
// закрывается по Esc, клику мимо, повторному Ctrl+D (S1 обнуляет useOverlayStore.item) и уходу мыши от
// предмета — только пока с окном не начали работать: курсор в нём уже был (main) или по нему кликнули.
// Клик внутри активирует оверлей (keepFocus): окно и фокус остаются до Esc / клика мимо / Ctrl+D.

const AUTO_HIDE_PX = 100
const PRELOAD_DELAY_MS = 2000

function PriceCheckWidget() {
  const captured = useOverlayStore((s) => s.item)
  const active = useOverlayStore((s) => s.focus.overlay)
  const mode = useOverlayStore((s) => s.pricePosition)
  const saved = useOverlayStore((s) => s.priceWindowPos)
  // с этим окном уже работали (оверлей активировали) — уход мыши его больше не закрывает
  const interacted = useRef(false)

  // данные en/ru (~9 МБ) — заранее, чтобы первый Ctrl+D не ждал загрузки
  useEffect(() => {
    const id = setTimeout(preloadPriceCheckData, PRELOAD_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    interacted.current = false
    if (captured) void usePriceCheckStore.getState().open(captured)
    else usePriceCheckStore.getState().close()
  }, [captured])

  useEffect(() => {
    if (captured && active) interacted.current = true
  }, [captured, active])

  // пока оверлей пассивен и с окном не работали — закрыть окно, если мышь ушла от предмета (не к окну)
  useEffect(() => {
    if (!captured || active || interacted.current) return
    window.overlayApi.overlay.trackAutoHide(captured.cursor, AUTO_HIDE_PX)
    return () => window.overlayApi.overlay.trackAutoHide(null)
  }, [captured, active])

  if (!captured) return null

  const close = (): void => {
    useOverlayStore.getState().dismissPopups()
    // макет: после закрытия фокус возвращается в игру
    window.overlayApi.overlay.focusGame()
  }

  return (
    <OverlayWidget
      placement={{
        mode,
        anchor: captured.cursor,
        area: captured.area,
        saved,
        onMoved: (p) => useOverlayStore.getState().setPricePlacement(p)
      }}
      keepFocus
      className="ov-pricecheck"
    >
      <PriceWindow captured={captured} onClose={close} />
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'pricecheck', layer: 'popup', Component: PriceCheckWidget }
export default widget
