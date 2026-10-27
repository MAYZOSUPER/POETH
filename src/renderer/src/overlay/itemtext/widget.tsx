import { useEffect } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { Kbd } from '../Kbd'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Демо-виджет S1: сырой текст предмета после Ctrl+D (проверка всего цикла
// копирования EN/RU). В S4 на его месте — прайс-чек PoE1 (overlay/pricecheck/).

const AUTO_HIDE_PX = 100
const SEPARATOR = '--------'

/** Редкость по 2-й строке («Rarity: Rare» / «Редкость: Редкий») → токен цвета. */
const RARITY: Record<string, string> = {
  normal: 'normal',
  обычный: 'normal',
  magic: 'magic',
  волшебный: 'magic',
  rare: 'rare',
  редкий: 'rare',
  unique: 'unique',
  уникальный: 'unique',
  gem: 'gem',
  камень: 'gem',
  currency: 'currency',
  валюта: 'currency'
}

function rarityOf(line: string | undefined): string | undefined {
  const value = line?.split(':')[1]?.trim().toLowerCase()
  return value ? RARITY[value] : undefined
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
  const name = lines[2] && lines[2] !== SEPARATOR ? lines[2] : (lines[1]?.split(':')[1]?.trim() ?? '')
  const base = lines[3] && lines[3] !== SEPARATOR ? lines[3] : null
  const lineCount = lines.filter((l) => l.trim() !== '').length
  const [keysBefore, keysAfter] = t('overlay.item.keys').split('{toggle}')

  return (
    <OverlayWidget placement={{ mode: 'opposite', anchor: item.cursor }} className="ov-itemtext">
      <section className="ui-panel">
        <header className="ui-panel__head">
          <span className="ui-panel__title">{t('overlay.item.title')}</span>
          <span className="ui-tag ui-tag--merchant" title={t('overlay.item.client', { lang: item.lang.toUpperCase() })}>
            {item.lang.toUpperCase()}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            title={t('overlay.item.close')}
            aria-label={t('overlay.item.close')}
            onClick={dismiss}
          >
            ✕
          </button>
        </header>
        <div className="ui-panel__body">
          <div className="ov-itemtext__name" data-rarity={rarityOf(lines[1])} title={name}>
            {name}
          </div>
          {base && <div className="ov-itemtext__base">{base}</div>}
          <div className="ov-itemtext__meta">
            {t('overlay.item.client', { lang: item.lang.toUpperCase() })} · {t('overlay.item.lines', { n: lineCount })}
          </div>
        </div>
        <pre className="ov-itemtext__raw ui-scroll">{item.text}</pre>
        <footer className="ui-panel__foot">
          <div>{t('overlay.item.demo')}</div>
          <div>
            {keysBefore}
            <Kbd accel={toggleKey} />
            {keysAfter}
          </div>
        </footer>
      </section>
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'itemtext', layer: 'popup', Component: ItemTextWidget }
export default widget
