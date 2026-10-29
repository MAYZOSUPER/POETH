import { ipcRenderer } from 'electron'
import { IPC, type FlipIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «помощник по флиппингу»: маршруты и фильтры; фид обмена — только в main; стакан из игры (S28).
export function flipBridge(): FlipIpcApi {
  return {
    flip: {
      state: () => ipcRenderer.invoke(IPC.flip.state),
      refresh: () => ipcRenderer.invoke(IPC.flip.refresh),
      setFilters: (patch) => ipcRenderer.invoke(IPC.flip.setFilters, patch),
      setOptions: (patch) => ipcRenderer.invoke(IPC.flip.setOptions, patch),
      bookRecent: () => ipcRenderer.invoke(IPC.flip.bookRecent)
    },
    onFlipState: (cb) => subscribe(IPC.events.flipState, cb),
    onFlipAlert: (cb) => subscribe(IPC.events.flipAlert, cb),
    onFlipBook: (cb) => subscribe(IPC.events.flipBook, cb)
  }
}
