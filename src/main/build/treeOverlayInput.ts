import { screen } from 'electron'
import type { OverlayPoint } from '@shared/types'
import type { TreeOverlayPanelRect } from '@shared/build/treeOverlayState'
import { pointInRect } from '../focus/hitTest'
import { isOverlayActive } from '../focus/gameFocus'
import { getOverlayWindow } from '../windows/gameOverlay'
import {
  hookKeycode,
  onGlobalKeyDown,
  onGlobalMouseDown,
  onGlobalMouseMove,
  onGlobalMouseUp,
  onGlobalWheel,
  type GlobalKey
} from '../input/gameInput'

// Мышь и клавиши, пока наложение дерева на экране (S38). Только слушаем (uiohook) — нажатия уходят в игру
// как обычно, сами мы в игру ничего не шлём:
// - левая кнопка зажата и мышь движется — игрок тянет игровое дерево: двигаем наложение на ту же дельту;
// - средняя кнопка — «круг класса под курсором»: калибровка (в игре по кругу класса клик ничего не делает);
// - колесо — игра меняет зум: наложение пометить «съехало»;
// - Esc или клавиша дерева (P) без модификаторов — игрок закрыл дерево: спрятать наложение.
// Над плашкой этапа (её прямоугольник шлёт виджет) мышь попадает в оверлей, а не в игру, — там ничего не делаем.
// Хук включён, только пока наложение показано; движение мыши — только пока зажата левая кнопка.

const BUTTON_LEFT = 1
const BUTTON_MIDDLE = 3
/** Склейка дельт панорамы для оверлея (~60 в секунду). Это движение нашего окна, а не действие в игре. */
const PAN_FLUSH_MS = 16
/** Клавиша дерева пассивок в PoE1 по умолчанию. */
const TREE_KEY = 'P'

export interface GameRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TreeInputHandlers {
  /** клиентская область игры, физические точки экрана; null — игры нет */
  client(): GameRect | null
  /** плашка этапа в окне оверлея (CSS-пиксели) */
  panel(): TreeOverlayPanelRect | null
  /** игрок потянул дерево: дельта в физических точках */
  pan(dx: number, dy: number): void
  /** средняя кнопка: точка клиентской области (физические точки) */
  align(at: OverlayPoint): void
  zoom(): void
  close(): void
}

/** Точка экрана (физические) — над плашкой этапа? */
function overPanel(p: OverlayPoint, panel: TreeOverlayPanelRect | null): boolean {
  const w = getOverlayWindow()
  if (!panel || !w) return false
  const dip = process.platform === 'win32' ? screen.screenToDipPoint(p) : p
  const b = w.getContentBounds()
  return pointInRect({ x: dip.x - b.x, y: dip.y - b.y }, panel)
}

const inside = (p: OverlayPoint, r: GameRect | null): r is GameRect =>
  !!r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

/** Начать слушать ввод; возвращает остановку. */
export function startTreeInput(h: TreeInputHandlers): () => void {
  const esc = hookKeycode('Escape')
  const treeKey = hookKeycode(TREE_KEY)
  let drag: { last: OverlayPoint; dx: number; dy: number } | null = null
  let offMove: (() => void) | null = null
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    timer = null
    if (!drag || (drag.dx === 0 && drag.dy === 0)) return
    const { dx, dy } = drag
    drag.dx = 0
    drag.dy = 0
    h.pan(dx, dy)
  }

  const endDrag = (): void => {
    if (timer) clearTimeout(timer)
    flush()
    drag = null
    offMove?.()
    offMove = null
  }

  const offs = [
    onGlobalMouseDown((p, button) => {
      // активный оверлей (Shift+Space) забирает мышь себе — игра дерево не двигает
      if (isOverlayActive()) return
      const client = h.client()
      if (!inside(p, client) || overPanel(p, h.panel())) return
      if (button === BUTTON_LEFT) {
        endDrag()
        drag = { last: p, dx: 0, dy: 0 }
        offMove = onGlobalMouseMove((q) => {
          if (!drag) return
          drag.dx += q.x - drag.last.x
          drag.dy += q.y - drag.last.y
          drag.last = q
          if (!timer) timer = setTimeout(flush, PAN_FLUSH_MS)
        })
      } else if (button === BUTTON_MIDDLE) {
        h.align({ x: p.x - client.x, y: p.y - client.y })
      }
    }),
    onGlobalMouseUp((_p, button) => {
      if (button === BUTTON_LEFT) endDrag()
    }),
    onGlobalWheel((p) => {
      if (isOverlayActive() || !inside(p, h.client()) || overPanel(p, h.panel())) return
      h.zoom()
    }),
    onGlobalKeyDown((k: GlobalKey) => {
      if (k.alt || k.ctrl || k.shift || k.meta) return
      if (k.keycode === esc || k.keycode === treeKey) h.close()
    })
  ]

  return () => {
    endDrag()
    for (const off of offs) off()
  }
}
