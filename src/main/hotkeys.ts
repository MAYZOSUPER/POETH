import { globalShortcut } from 'electron'
import type { HotkeyAction, HotkeyMap } from '@shared/types'

export function registerHotkeys(map: HotkeyMap, onAction: (action: HotkeyAction) => void): void {
  globalShortcut.unregisterAll()
  const bind = (accelerator: string, action: HotkeyAction): void => {
    if (!accelerator) return
    try {
      globalShortcut.register(accelerator, () => onAction(action))
    } catch {
      // ignore invalid / already-taken accelerators
    }
  }
  bind(map.toggleVisible, 'toggleVisible')
  bind(map.toggleLock, 'toggleLock')
  bind(map.prevStep, 'prevStep')
  bind(map.nextStep, 'nextStep')
  bind(map.priceCheck, 'priceCheck')
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
