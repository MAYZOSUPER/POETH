import { ipcRenderer } from 'electron'
import { IPC, type FlipIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «помощник по флиппингу»: маршруты и фильтры; фид обмена — только в main.
export function flipBridge(): FlipIpcApi {
  return {
    flip: {
      state: () => ipcRenderer.invoke(IPC.flip.state),
      refresh: () => ipcRenderer.invoke(IPC.flip.refresh),
      setFilters: (patch) => ipcRenderer.invoke(IPC.flip.setFilters, patch)
    },
    onFlipState: (cb) => subscribe(IPC.events.flipState, cb)
  }
}
