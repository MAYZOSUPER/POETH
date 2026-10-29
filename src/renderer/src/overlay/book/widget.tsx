import { useEffect, useState } from 'react'
import type { FlipBookEvent } from '@shared/types'
import { allDoubts } from '@shared/flip/book'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Тост у курсора после хоткея «считать стакан» (S28): «Стакан считан, строк: 6» или почему не вышло.
// Выше курсора — таблица «Курс / Кол-во» ниже него, и следующий снимок тост не заденет. Не кликабельный
// (мышь проходит в игру), исчезает сам. Сам стакан — во вкладке «Обмен» компаньона.

const SHOW_MS = 2_500
/** над курсором, чтобы не закрыть таблицу под «Рыночным курсом» */
const LIFT = 56

function BookToast() {
  const t = useOverlayT()
  const [e, setE] = useState<FlipBookEvent | null>(null)

  useEffect(() => window.overlayApi.onFlipBook((ev) => setE(ev)), [])
  useEffect(() => {
    if (!e) return
    const id = window.setTimeout(() => setE(null), SHOW_MS)
    return () => window.clearTimeout(id)
  }, [e])

  if (!e) return null
  const res = e.result
  const check = res.ok ? allDoubts(res.reading).length : 0
  const text = res.ok
    ? check
      ? t('flip.book.toast.check', { n: res.reading.rows.length, k: check })
      : t('flip.book.toast.ok', { n: res.reading.rows.length })
    : t(`flip.book.fail.${res.reason}`)
  const kind = res.ok && !check ? 'info' : 'warn'
  const anchor = e.cursor ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 }
  return (
    <OverlayWidget interactive={false} placement={{ mode: 'cursor', anchor: { x: anchor.x, y: anchor.y - LIFT } }}>
      <div className={`ui-panel ov-notice ov-notice--${kind}`} role="status">
        <Icon name={kind === 'warn' ? 'warn' : 'info'} />
        <span>{text}</span>
      </div>
    </OverlayWidget>
  )
}

// у курсора, поверх окна цены (тот же слой popup)
const widget: OverlayWidgetDef = { id: 'book', layer: 'popup', order: 10, Component: BookToast }
export default widget
