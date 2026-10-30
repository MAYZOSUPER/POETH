import { ipcRenderer } from 'electron'
import { IPC, type OverlayIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «игровой оверлей» (S1). Доступен и компаньону, и странице overlay.html.
export function overlayBridge(): OverlayIpcApi {
  return {
    overlay: {
      getState: () => ipcRenderer.invoke(IPC.overlay.getState),
      activate: () => ipcRenderer.send(IPC.overlay.activate),
      focusGame: () => ipcRenderer.send(IPC.overlay.focusGame),
      updateInteractiveRects: (rects) => ipcRenderer.send(IPC.overlay.updateInteractiveRects, rects),
      trackAutoHide: (from, threshold) => ipcRenderer.send(IPC.overlay.trackAutoHide, from, threshold),
      typeInChat: (text, opts) => ipcRenderer.invoke(IPC.overlay.typeInChat, text, opts),
      stashSearch: (text) => ipcRenderer.invoke(IPC.overlay.stashSearch, text),
      hotkeyConflicts: () => ipcRenderer.invoke(IPC.overlay.hotkeyConflicts),
      openHotkeySettings: () => ipcRenderer.send(IPC.overlay.openHotkeySettings),
      copyItemEn: (text) => ipcRenderer.invoke(IPC.overlay.copyItemEn, text)
    },
    onOverlayFocus: (cb) => subscribe(IPC.events.overlayFocus, cb),
    onOverlayStatus: (cb) => subscribe(IPC.events.overlayStatus, cb),
    onItemCaptured: (cb) => subscribe(IPC.events.overlayItemCaptured, cb),
    onOverlayAutoHide: (cb) => subscribe(IPC.events.overlayAutoHide, () => cb()),
    onOverlayDismiss: (cb) => subscribe(IPC.events.overlayDismiss, () => cb()),
    onOverlayNotice: (cb) => subscribe(IPC.events.overlayNotice, cb),
    onHotkeyConflicts: (cb) => subscribe(IPC.events.overlayHotkeyConflicts, cb),
    onItemEn: (cb) => subscribe(IPC.events.overlayItemEn, cb)
  }
}
