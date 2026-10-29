import { ipcRenderer } from 'electron'
import { IPC, type FlipIpcApi } from '@shared/ipc'
import { itemFlipDevFlag } from '@shared/flip/items/flag'
import { subscribe } from '../subscribe'

// Мост домена «помощник по флиппингу»: маршруты и фильтры; фид обмена — только в main; стакан из игры (S28);
// «Предметы» (S33) — снимок цен и поиск на трейде только в main.
export function flipBridge(): FlipIpcApi {
  return {
    flip: {
      state: () => ipcRenderer.invoke(IPC.flip.state),
      refresh: () => ipcRenderer.invoke(IPC.flip.refresh),
      setFilters: (patch) => ipcRenderer.invoke(IPC.flip.setFilters, patch),
      setOptions: (patch) => ipcRenderer.invoke(IPC.flip.setOptions, patch),
      bookRecent: () => ipcRenderer.invoke(IPC.flip.bookRecent),
      itemsDevFlag: itemFlipDevFlag(process.env),
      itemsState: () => ipcRenderer.invoke(IPC.flip.itemsState),
      itemsRefresh: () => ipcRenderer.invoke(IPC.flip.itemsRefresh),
      itemsConfig: (patch) => ipcRenderer.invoke(IPC.flip.itemsConfig, patch),
      itemsCheck: (rowId, k) => ipcRenderer.invoke(IPC.flip.itemsCheck, rowId, k),
      itemsWatch: (rowId, k) => ipcRenderer.invoke(IPC.flip.itemsWatch, rowId, k)
    },
    onFlipState: (cb) => subscribe(IPC.events.flipState, cb),
    onFlipAlert: (cb) => subscribe(IPC.events.flipAlert, cb),
    onFlipBook: (cb) => subscribe(IPC.events.flipBook, cb),
    onFlipItems: (cb) => subscribe(IPC.events.flipItems, cb)
  }
}
