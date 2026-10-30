import { ipcRenderer } from 'electron'
import { IPC, type LootFilterIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «Фильтр лута» (S53): сеть GitHub и запись в папку игры — только в main; окно шлёт уровень, стиль
// и «Перезаписать», получает состояние.
export function lootFilterBridge(): LootFilterIpcApi {
  const q = IPC.lootFilter
  return {
    lootFilter: {
      state: () => ipcRenderer.invoke(q.state),
      screenOpened: () => ipcRenderer.invoke(q.screenOpened),
      install: (req) => ipcRenderer.invoke(q.install, req),
      setPrefs: (prefs) => ipcRenderer.invoke(q.setPrefs, prefs),
      pickFolder: () => ipcRenderer.invoke(q.pickFolder),
      resetFolder: () => ipcRenderer.invoke(q.resetFolder),
      openFolder: () => ipcRenderer.invoke(q.openFolder),
      openLink: (link) => ipcRenderer.invoke(q.openLink, link)
    },
    onLootFilterState: (cb) => subscribe(IPC.events.lootFilterState, cb)
  }
}
