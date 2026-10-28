import { useOverlayStore } from '../store/useOverlayStore'
import { Icon } from './Icon'
import { useOverlayT } from './useOverlayT'

// Кнопка «Вернуть к курсору» для шапки всплывающего окна (окно цены): видна, только когда окно
// перетащили за шапку (Settings.overlay.pricePosition = 'saved'). Нажатие — окно сразу у курсора,
// следующие Ctrl+D — тоже у курсора. Перетаскивание — OverlayWidget + data-drag-handle на шапке.

export function PopupPositionButton() {
  const t = useOverlayT()
  const moved = useOverlayStore((s) => s.pricePosition === 'saved' && s.priceWindowPos !== null)
  if (!moved) return null
  return (
    <button
      type="button"
      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
      title={t('overlay.popup.toCursor')}
      aria-label={t('overlay.popup.toCursor')}
      onClick={() => useOverlayStore.getState().setPricePlacement(null)}
    >
      <Icon name="compass" />
    </button>
  )
}
