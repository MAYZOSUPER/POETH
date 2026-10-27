import { useEffect, type MouseEvent } from 'react'
import { useOverlayStore } from '../store/useOverlayStore'
import { OVERLAY_LAYERS, widgetsOfLayer } from './registry'
import { useOverlayT } from './useOverlayT'

// Хост виджетов игрового оверлея: слои cards / toasts / popup (registry.ts),
// подсказка, пока оверлей активен, и «клик по пустому фону → фокус игре».

export function OverlayApp() {
  const ready = useOverlayStore((s) => s.ready)
  const active = useOverlayStore((s) => s.focus.overlay)
  const lang = useOverlayStore((s) => s.lang)
  const t = useOverlayT()

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void useOverlayStore
      .getState()
      .init()
      .then((fn) => {
        if (disposed) fn()
        else off = fn
      })
    return () => {
      disposed = true
      off?.()
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Клик по виджету в пассивном режиме активирует окно (так работает Windows) —
  // после обработки клика возвращаем фокус игре. Слушатель на document срабатывает
  // после onClick React (тот висит на #root).
  useEffect(() => {
    const onClick = (): void => {
      if (!useOverlayStore.getState().focus.overlay) window.overlayApi.overlay.focusGame()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const onBackground = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget && active) window.overlayApi.overlay.focusGame()
  }

  return (
    <div className={`ov-root${active ? ' is-active' : ''}`} onMouseDown={onBackground}>
      {ready &&
        OVERLAY_LAYERS.map((layer) => (
          <div key={layer} className={`ov-layer ov-layer--${layer}`}>
            {widgetsOfLayer(layer).map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </div>
        ))}
      {active && <div className="ov-hint">{t('overlay.hint.active')}</div>}
    </div>
  )
}
