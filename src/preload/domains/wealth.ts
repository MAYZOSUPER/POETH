import { ipcRenderer } from 'electron'
import { IPC, type WealthIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «учёт богатства»: итоги и управление; запросы к сайту — только в main.
export function wealthBridge(): WealthIpcApi {
  return {
    wealth: {
      state: () => ipcRenderer.invoke(IPC.wealth.state),
      refreshTabs: () => ipcRenderer.invoke(IPC.wealth.refreshTabs),
      setTabs: (ids) => ipcRenderer.invoke(IPC.wealth.setTabs, ids),
      setAccount: (name) => ipcRenderer.invoke(IPC.wealth.setAccount, name),
      setOptions: (patch) => ipcRenderer.invoke(IPC.wealth.setOptions, patch),
      snapshot: () => ipcRenderer.invoke(IPC.wealth.snapshot),
      startFarm: () => ipcRenderer.invoke(IPC.wealth.startFarm),
      stopFarm: () => ipcRenderer.invoke(IPC.wealth.stopFarm),
      detail: (id) => ipcRenderer.invoke(IPC.wealth.detail, id),
      diff: (fromId, toId) => ipcRenderer.invoke(IPC.wealth.diff, fromId, toId)
    },
    onWealthState: (cb) => subscribe(IPC.events.wealthState, cb)
  }
}
