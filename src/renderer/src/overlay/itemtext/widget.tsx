import { useEffect } from 'react'
import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { Kbd } from '../Kbd'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Демо-виджет S1: сырой текст предмета после Ctrl+D (проверка всего цикла копирования
// EN/RU). Оболочка — как окно прайс-чека в макетах: у курсора, шапка с орнаментом,
// имя цветом редкости, «Клиент: RU/EN». В S4 на его месте — прайс-чек PoE1 (overlay/pricecheck/).

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

function valueOf(line: string | undefined): string {
  return line?.split(':')[1]?.trim() ?? ''
}

function ItemTextWidget() {
  const item = useOverlayStore((s) => s.item)
  const active = useOverlayStore((s) => s.focus.overlay)
  const toggleKey = useOverlayStore((s) => s.toggleKey)
  const mode = useOverlayStore((s) => s.pricePosition)
  const t = useOverlayT()

  // пока оверлей пассивен — закрыть окно, если мышь ушла от предмета (не к окну) или клик мимо
  useEffect(() => {
    if (!item || active) return
    window.overlayApi.overlay.trackAutoHide(item.cursor, AUTO_HIDE_PX)
    return () => window.overlayApi.overlay.trackAutoHide(null)
  }, [item, active])

  if (!item) return null
  const lines = item.text.split(/\r?\n/)
  const rarity = valueOf(lines[1])
  const name = lines[2] && lines[2] !== SEPARATOR ? lines[2] : rarity
  const base = lines[3] && lines[3] !== SEPARATOR ? lines[3] : null
  const lineCount = lines.filter((l) => l.trim() !== '').length
  const [keysBefore, keysAfter] = t('overlay.item.keys').split('{toggle}')

  const close = (): void => {
    useOverlayStore.getState().dismissPopups()
    // макет: после закрытия фокус возвращается в игру
    window.overlayApi.overlay.focusGame()
  }

  return (
    <OverlayWidget placement={{ mode, anchor: item.cursor, area: item.area }} className="ov-itemtext">
      <section className="ui-panel">
        <header className="ui-panel__head">
          <span className="ui-panel__title">{t('overlay.item.title')}</span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            title={`${t('overlay.item.close')} (Esc)`}
            aria-label={t('overlay.item.close')}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="ov-item">
          <span className="ov-item__name" data-rarity={RARITY[rarity.toLowerCase()]} title={name}>
            {name}
          </span>
          {base && <span className="ov-item__base">{base}</span>}
          <span className="ov-item__meta">
            <span>
              {rarity} · {t('overlay.item.lines', { n: lineCount })}
            </span>
            <span className="ui-tag">{t('overlay.item.client', { lang: item.lang.toUpperCase() })}</span>
          </span>
        </div>
        <pre className="ov-itemtext__raw ui-scroll">{item.text}</pre>
        <div className="ui-hint ov-itemtext__hint">
          <Icon name="help" />
          <span>
            {t('overlay.item.demo')}
            <br />
            {keysBefore}
            <Kbd accel={toggleKey} />
            {keysAfter}
          </span>
        </div>
      </section>
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'itemtext', layer: 'popup', Component: ItemTextWidget }
export default widget
