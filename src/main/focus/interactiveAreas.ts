import { screen } from 'electron'
import type { InteractiveRect, OverlayPoint } from '@shared/types'
import { IPC } from '@shared/ipc'
import { isOverlayActive, onGameFocusChange } from './gameFocus'
import { pointInRects, sanitizeRects, shouldAutoHide } from './hitTest'
import { focusGame, getOverlayWindow, sendToOverlay } from '../windows/gameOverlay'
import { onGlobalMouseDown } from '../input/gameInput'

// Кликабельные виджеты без активации оверлея. Пока оверлей пассивен (мышь — в игру),
// renderer шлёт прямоугольники интерактивных виджетов; main опрашивает курсор (~30 Гц)
// и, когда он над виджетом, временно снимает setIgnoreMouseEvents. Клик по виджету
// активирует окно (так устроен Windows) — renderer после клика, а этот опрос как
// страховка (курсор ушёл с виджета) возвращают фокус игре (focusGame → focusTarget).
// Здесь же — авто-скрытие окна Ctrl+D: курсор ушёл от предмета в сторону или игрок
// кликнул мимо окна (глобальный хук мыши — только пока окно открыто), как в APT.

const DEFAULT_AUTO_HIDE_PX = 100

let rects: InteractiveRect[] = []
/** что сейчас стоит у окна: true — ловит мышь; null — неизвестно (библиотека могла сменить) */
let applied: boolean | null = null
let autoHide: { from: OverlayPoint; threshold: number } | null = null
let timer: NodeJS.Timeout | null = null
let pollMs = 33
let offMouseDown: (() => void) | null = null

function needed(): boolean {
  return (rects.length > 0 || autoHide !== null) && !isOverlayActive()
}

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Клик где угодно, пока открыто окно Ctrl+D и оверлей пассивен: мимо окна — спрятать его. */
function handleMouseDown(screenPhysical: OverlayPoint): void {
  const w = getOverlayWindow()
  if (!autoHide || !w || !w.isVisible() || isOverlayActive()) return
  const p = process.platform === 'win32' ? screen.screenToDipPoint(screenPhysical) : screenPhysical
  const b = w.getContentBounds()
  if (pointInRects({ x: p.x - b.x, y: p.y - b.y }, rects)) return
  autoHide = null
  sendToOverlay(IPC.events.overlayAutoHide)
  reconcile()
}

function syncMouseHook(): void {
  const want = autoHide !== null && !isOverlayActive()
  if (want && !offMouseDown) offMouseDown = onGlobalMouseDown(handleMouseDown)
  if (!want && offMouseDown) {
    offMouseDown()
    offMouseDown = null
  }
}

function reconcile(): void {
  syncMouseHook()
  if (!needed()) {
    stop()
    // виджетов больше нет — окно снова пропускает мышь (если ловить её начали мы)
    if (applied === true && !isOverlayActive()) {
      getOverlayWindow()?.setIgnoreMouseEvents(true)
      applied = false
    }
    return
  }
  if (!timer) timer = setInterval(tick, pollMs)
}

function tick(): void {
  const w = getOverlayWindow()
  if (!w || !w.isVisible() || isOverlayActive()) return
  const p = screen.getCursorScreenPoint()
  const b = w.getContentBounds()
  const local = { x: p.x - b.x, y: p.y - b.y }
  const inside = pointInRects(local, rects)

  if (inside !== applied) {
    applied = inside
    w.setIgnoreMouseEvents(!inside)
  }

  if (autoHide && shouldAutoHide(local, autoHide.from, rects, autoHide.threshold)) {
    autoHide = null
    sendToOverlay(IPC.events.overlayAutoHide)
  }

  // клик по пассивному виджету активировал окно; курсор ушёл — фокус обратно игре
  if (!inside && w.isFocused()) focusGame()

  if (!needed()) reconcile()
}

/** Прямоугольники виджетов из renderer (координаты окна оверлея). */
export function setInteractiveRects(raw: unknown): void {
  rects = sanitizeRects(raw)
  reconcile()
}

/** Следить за уходом курсора от точки Ctrl+D (null — перестать). */
export function trackAutoHide(from: unknown, threshold?: unknown): void {
  const ok =
    typeof from === 'object' &&
    from !== null &&
    Number.isFinite((from as OverlayPoint).x) &&
    Number.isFinite((from as OverlayPoint).y)
  autoHide = ok
    ? {
        from: { x: (from as OverlayPoint).x, y: (from as OverlayPoint).y },
        threshold:
          typeof threshold === 'number' && threshold > 0 && Number.isFinite(threshold)
            ? threshold
            : DEFAULT_AUTO_HIDE_PX
      }
    : null
  reconcile()
}

/** Период опроса курсора (настройка clickThroughPollMs), 15–200 мс. */
export function setPollInterval(ms: number): void {
  const next = Math.min(200, Math.max(15, Math.round(ms) || 33))
  if (next === pollMs) return
  pollMs = next
  if (timer) {
    stop()
    reconcile()
  }
}

// Активация/возврат фокуса меняют setIgnoreMouseEvents внутри OverlayController
// (focus → true, activateOverlay → false) — наше «applied» больше не верно.
onGameFocusChange(() => {
  applied = null
  reconcile()
})
