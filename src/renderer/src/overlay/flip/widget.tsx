import { useEffect, useState } from 'react'
import type { FlipAlert } from '@shared/types'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import { useOverlayStore } from '../../store/useOverlayStore'
import type { OverlayWidgetDef } from '../registry'

// Тост «курс divine вышел из коридора недели» (S13, макет «Обмен» v2) — слой toasts оверлея, в стопке уведомлений.
// Main шлёт event:flip.alert не чаще раза на час фида и только если игрок включил это во вкладке «Обмен».
// Не кликабельный (мышь проходит в игру), исчезает сам.

const ALERT_MS = 15_000

function FlipAlertToast() {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const [alert, setAlert] = useState<FlipAlert | null>(null)

  useEffect(() => window.overlayApi.onFlipAlert((a) => setAlert(a)), [])
  useEffect(() => {
    if (!alert) return
    const id = window.setTimeout(() => setAlert(null), ALERT_MS)
    return () => window.clearTimeout(id)
  }, [alert])

  if (!alert) return null
  const f = (n: number): string => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 })
  return (
    <OverlayWidget interactive={false}>
      <div className="ui-panel ov-notice ov-notice--warn" role="status">
        <Icon name="warn" />
        <span>{t(`flip.alert.${alert.dir}`, { rate: f(alert.rate), lo: f(alert.lo), hi: f(alert.hi) })}</span>
      </div>
    </OverlayWidget>
  )
}

// рядом с короткими уведомлениями (notice, order −10), выше тостов live
const widget: OverlayWidgetDef = { id: 'flip', layer: 'toasts', order: -5, Component: FlipAlertToast }
export default widget
