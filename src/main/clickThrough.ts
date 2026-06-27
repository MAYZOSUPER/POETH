import { screen } from 'electron'
import type { InteractiveRect } from '@shared/types'
import { getOverlayWindow } from './overlayWindow'

// Selective click-through: a cursor-position poll in the main process is the
// authoritative source of truth (more robust than renderer mouseenter/leave,
// which can stall when forward:true and a non-Electron window holds focus).
// When the cursor is over an interactive panel rect we let clicks through to
// the overlay; everywhere else the overlay is transparent to the mouse.

let rects: InteractiveRect[] = []
let locked = false
let pollMs = 33
let timer: ReturnType<typeof setInterval> | null = null
let ignoring = true

export function setInteractiveRects(next: InteractiveRect[]): void {
  rects = next
}

export function setLocked(value: boolean): void {
  locked = value
  if (locked) applyIgnore(true)
}

export function setPollInterval(ms: number): void {
  pollMs = Math.max(16, Math.min(100, Math.round(ms)))
  if (timer) start()
}

function applyIgnore(value: boolean): void {
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  if (value === ignoring) return
  ignoring = value
  win.setIgnoreMouseEvents(value, { forward: true })
}

function tick(): void {
  const win = getOverlayWindow()
  if (!win || win.isDestroyed() || !win.isVisible()) return
  if (locked) {
    applyIgnore(true)
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const b = win.getContentBounds()
  const x = cursor.x - b.x
  const y = cursor.y - b.y
  const over = rects.some(
    (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  )
  applyIgnore(!over)
}

export function start(): void {
  stop()
  timer = setInterval(tick, pollMs)
}

export function stop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
