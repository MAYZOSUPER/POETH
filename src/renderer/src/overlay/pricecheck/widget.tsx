import { useEffect, useRef } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import type { OverlayWidgetDef } from '../registry'
import { PriceWindow } from './PriceWindow'
import { preloadPriceCheckData, usePriceCheckStore } from './store'
import { Poe2PriceWindow } from './poe2/Poe2PriceWindow'
import { preloadPoe2Data, usePoe2PriceCheckStore } from './poe2/store'
import './pricecheck.css'

// Окно цены PoE1 (S4) — слой popup оверлея (S1): открывается по Ctrl+D у курсора (или где его оставили),
// закрывается по Esc, клику мимо, повторному Ctrl+D (S1 обнуляет useOverlayStore.item) и уходу мыши от
// предмета — только пока с окном не начали работать: курсор в нём уже был (main) или по нему кликнули.
// Клик внутри активирует оверлей (keepFocus): окно и фокус остаются до Esc / клика мимо / Ctrl+D.
// S47: у PoE 2 то же окно поверх игры (poe2/: свой стор и компоненты на тех же стилях) — по Settings.game.

const AUTO_HIDE_PX = 100
const PRELOAD_DELAY_MS = 2000

function PriceCheckWidget() {
  const captured = useOverlayStore((s) => s.item)
  const active = useOverlayStore((s) => s.focus.overlay)
  const mode = useOverlayStore((s) => s.pricePosition)
  const saved = useOverlayStore((s) => s.priceWindowPos)
  const game = useOverlayStore((s) => s.game)
  const poe2 = game === 'poe2'
  // с этим окном уже работали (оверлей активировали) — уход мыши его больше не закрывает
  const interacted = useRef(false)

  // данные en/ru (~9 МБ) — заранее, чтобы первый Ctrl+D не ждал загрузки
  useEffect(() => {
    if (!game) return
    const id = setTimeout(poe2 ? preloadPoe2Data : preloadPriceCheckData, PRELOAD_DELAY_MS)
    return () => clearTimeout(id)
  }, [game, poe2])

  useEffect(() => {
    interacted.current = false
    if (!game) return
    const store = poe2 ? usePoe2PriceCheckStore : usePriceCheckStore
    if (captured) void store.getState().open(captured)
    else store.getState().close()
  }, [captured, game, poe2])

  useEffect(() => {
    if (captured && active) interacted.current = true
  }, [captured, active])

  // пока оверлей пассивен и с окном не работали — закрыть окно, если мышь ушла от предмета (не к окну)
  useEffect(() => {
    if (!captured || active || interacted.current) return
    window.overlayApi.overlay.trackAutoHide(captured.cursor, AUTO_HIDE_PX)
    return () => window.overlayApi.overlay.trackAutoHide(null)
  }, [captured, active])

  if (!captured || !game) return null

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
      {poe2 ? <Poe2PriceWindow captured={captured} onClose={close} /> : <PriceWindow captured={captured} onClose={close} />}
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'pricecheck', layer: 'popup', Component: PriceCheckWidget }
export default widget
