import { useEffect } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { formatAccel, useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Демо-виджет S1: сырой текст предмета после Ctrl+D (проверка всего цикла
// копирования EN/RU). В S4 на его месте — прайс-чек PoE1 (overlay/pricecheck/).

const AUTO_HIDE_PX = 100
const SEPARATOR = '--------'

/** Заголовок: имя и база (строки 3–4 текста), без разделителей. */
function itemTitle(lines: string[]): string {
  return lines
    .slice(2, 4)
    .filter((l) => l && l !== SEPARATOR)
    .join(' · ')
}

function ItemTextWidget() {
  const item = useOverlayStore((s) => s.item)
  const active = useOverlayStore((s) => s.focus.overlay)
  const toggleKey = useOverlayStore((s) => s.toggleKey)
  const dismiss = useOverlayStore((s) => s.dismissItem)
  const t = useOverlayT()

  // пока оверлей пассивен — закрыть окно, если мышь ушла от предмета (не к окну)
  useEffect(() => {
    if (!item || active) return
    window.overlayApi.overlay.trackAutoHide(item.cursor, AUTO_HIDE_PX)
    return () => window.overlayApi.overlay.trackAutoHide(null)
  }, [item, active])

  if (!item) return null
  const lines = item.text.split(/\r?\n/)
  const lineCount = lines.filter((l) => l.trim() !== '').length

  return (
    <OverlayWidget placement={{ mode: 'opposite', anchor: item.cursor }} className="ov-itemtext">
      <div className="ov-panel">
        <header className="ov-panel__head">
          <span className="ov-panel__title">{t('overlay.item.title')}</span>
          <span className="ov-badge">{item.lang.toUpperCase()}</span>
          <button
            type="button"
            className="ov-icon-btn"
            title={t('overlay.item.close')}
            aria-label={t('overlay.item.close')}
            onClick={dismiss}
          >
            ✕
          </button>
        </header>
        <div className="ov-itemtext__name">{itemTitle(lines)}</div>
        <div className="ov-itemtext__meta">
          {t('overlay.item.client', { lang: item.lang.toUpperCase() })} ·{' '}
          {t('overlay.item.lines', { n: lineCount })}
        </div>
        <pre className="ov-itemtext__raw">{item.text}</pre>
        <footer className="ov-panel__foot">
          <div>{t('overlay.item.demo')}</div>
          <div className="ov-panel__keys">{t('overlay.item.keys', { toggle: formatAccel(toggleKey) })}</div>
        </footer>
      </div>
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'itemtext', layer: 'popup', Component: ItemTextWidget }
export default widget
