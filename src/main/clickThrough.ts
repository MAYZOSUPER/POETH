import { getOverlayWindow } from './overlayWindow'

// Simple, robust click-through model:
//   - Unlocked (default): the overlay is a normal interactive window — drag,
//     scroll and clicks all work over the panel.
//   - Locked (Ctrl+Shift+L): the overlay ignores the mouse entirely, so every
//     click/scroll passes through to the game.
// This avoids fragile per-pixel hit-testing; the user toggles pass-through when
// they want to play vs. interact with the overlay.

let locked = false

function apply(): void {
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(locked, { forward: true })
  if (process.env.OVERLAY_DEBUG === '1') {
    console.log(`[ct] ignoreMouse -> ${locked} (locked=${locked})`)
  }
}

export function setLocked(value: boolean): void {
  locked = value
  apply()
}

/** Establish the initial click-through state from the persisted lock setting. */
export function initClickThrough(initialLocked: boolean): void {
  locked = initialLocked
  apply()
}
