import { useEffect } from 'react'
import type { OverlayWidgetDef } from '../registry'
import { copyItemEn } from './copy'

// «Скопировать предмет по-английски» (S51): своего окна нет — только слушает запросы main (хоткей copyItemEn) и
// отвечает уведомлением в общей стопке (notice/widget.tsx).

function ItemEnListener() {
  useEffect(() => window.overlayApi.onItemEn((req) => void copyItemEn(req)), [])
  return null
}

const widget: OverlayWidgetDef = { id: 'itemEn', layer: 'toasts', Component: ItemEnListener }
export default widget
