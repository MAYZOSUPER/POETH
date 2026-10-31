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
      diff: (fromId, toId) => ipcRenderer.invoke(IPC.wealth.diff, fromId, toId),
      poe2State: () => ipcRenderer.invoke(IPC.wealth.poe2State),
      poe2SetManual: (name, qty) => ipcRenderer.invoke(IPC.wealth.poe2SetManual, name, qty),
      poe2SetGold: (qty) => ipcRenderer.invoke(IPC.wealth.poe2SetGold, qty),
      poe2AddItem: (item) => ipcRenderer.invoke(IPC.wealth.poe2AddItem, item),
      poe2RemoveItem: (id) => ipcRenderer.invoke(IPC.wealth.poe2RemoveItem, id),
      poe2RemoveTab: (id) => ipcRenderer.invoke(IPC.wealth.poe2RemoveTab, id),
      poe2ScreenEdit: (tabId, key, edit) => ipcRenderer.invoke(IPC.wealth.poe2ScreenEdit, tabId, key, edit),
      poe2ScreenDrop: (tabId) => ipcRenderer.invoke(IPC.wealth.poe2ScreenDrop, tabId),
      poe2ScreenAccept: () => ipcRenderer.invoke(IPC.wealth.poe2ScreenAccept),
      poe2Diff: (fromId, toId) => ipcRenderer.invoke(IPC.wealth.poe2Diff, fromId, toId)
    },
    onWealthState: (cb) => subscribe(IPC.events.wealthState, cb),
    onWealthPoe2: (cb) => subscribe(IPC.events.wealthPoe2, cb)
  }
}
