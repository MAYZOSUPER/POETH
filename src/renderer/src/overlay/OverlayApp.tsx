import { useEffect, type MouseEvent } from 'react'
import { useOverlayStore } from '../store/useOverlayStore'
import { IconSprite } from './Icon'
import { widgetsOfLayer } from './registry'
import { useOverlayT } from './useOverlayT'

// Хост виджетов игрового оверлея (по утверждённым макетам):
// - popup  — окно прайс-чека у курсора (OverlayWidget + placement.ts), выше всех;
// - toasts — стопка тостов live справа сверху, центр экрана свободен;
// - cards  — карточки сделок справа снизу; подсветка тайника — абсолютно, в своём виджете.
// Пока оверлей активен — лёгкое затемнение и подсказка; клик по пустому фону закрывает
// всплывающие окна и возвращает фокус игре.

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
    if (e.target !== e.currentTarget || !active) return
    useOverlayStore.getState().dismissPopups()
    window.overlayApi.overlay.focusGame()
  }

  const layer = (name: 'cards' | 'toasts' | 'popup') =>
    widgetsOfLayer(name).map(({ id, Component }) => <Component key={id} />)

  return (
    <div className={`ov-root${active ? ' is-active' : ''}`} onMouseDown={onBackground}>
      <IconSprite />
      {ready && (
        <>
          <div className="ov-layer ov-layer--cards">
            <div className="ov-stack ov-stack--bottom-right">{layer('cards')}</div>
          </div>
          <div className="ov-layer ov-layer--toasts">
            <div className="ov-stack ov-stack--top-right">{layer('toasts')}</div>
          </div>
          <div className="ov-layer ov-layer--popup">{layer('popup')}</div>
        </>
      )}
      {active && <div className="ov-hint">{t('overlay.hint.active')}</div>}
    </div>
  )
}
