/// <reference types="vite/client" />
import type { ComponentType } from 'react'

// Реестр виджетов оверлея. Этап подключает свой виджет, просто создав файл
// `src/renderer/src/overlay/<функция>/widget.tsx` с `export default { id, layer, Component }`
// (S4: pricecheck/, S6: live/, S8: deals/) — общие файлы оверлея править не нужно.
//
// Слои (снизу вверх): cards — карточки сделок (S8), toasts — тосты live (S6),
// popup — окно прайс-чека и прочие «исключительные» окна (S4, демо S1).

export type OverlayLayer = 'cards' | 'toasts' | 'popup'

export const OVERLAY_LAYERS: readonly OverlayLayer[] = ['cards', 'toasts', 'popup']

export interface OverlayWidgetDef {
  id: string
  layer: OverlayLayer
  /** порядок внутри слоя (меньше — ниже), по умолчанию 0 */
  order?: number
  /** сам решает, что показывать; null — ничего */
  Component: ComponentType
}

const modules = import.meta.glob<{ default: OverlayWidgetDef }>('./*/widget.tsx', { eager: true })

export const OVERLAY_WIDGETS: readonly OverlayWidgetDef[] = Object.values(modules)
  .map((m) => m.default)
  .filter((w): w is OverlayWidgetDef => !!w && typeof w.id === 'string' && !!w.Component)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))

export function widgetsOfLayer(layer: OverlayLayer): OverlayWidgetDef[] {
  return OVERLAY_WIDGETS.filter((w) => w.layer === layer)
}
