import { ipcRenderer } from 'electron'
import { IPC, type FavIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «избранное и трейд-окно» (S5).
export function favBridge(): FavIpcApi {
  return {
    fav: {
      list: () => ipcRenderer.invoke(IPC.fav.list),
      saveFolder: (input) => ipcRenderer.invoke(IPC.fav.saveFolder, input),
      deleteFolder: (id) => ipcRenderer.invoke(IPC.fav.deleteFolder, id),
      archiveFolder: (id, archived) => ipcRenderer.invoke(IPC.fav.archiveFolder, id, archived),
      reorderFolders: (game, ids) => ipcRenderer.invoke(IPC.fav.reorderFolders, game, ids),
      saveSearch: (input) => ipcRenderer.invoke(IPC.fav.saveSearch, input),
      add: (input) => ipcRenderer.invoke(IPC.fav.add, input),
      deleteSearch: (id) => ipcRenderer.invoke(IPC.fav.deleteSearch, id),
      archiveSearch: (id, archived) => ipcRenderer.invoke(IPC.fav.archiveSearch, id, archived),
      moveSearch: (id, folderId, index) => ipcRenderer.invoke(IPC.fav.moveSearch, id, folderId, index),
      open: (id) => ipcRenderer.invoke(IPC.fav.open, id),
      current: () => ipcRenderer.invoke(IPC.fav.current),
      importBt: (text) => ipcRenderer.invoke(IPC.fav.importBt, text),
      exportBt: (folderId, game) => ipcRenderer.invoke(IPC.fav.exportBt, folderId, game),
      setLive: (id, enabled) => ipcRenderer.invoke(IPC.fav.setLive, id, enabled),
      setNotify: (id, notify) => ipcRenderer.invoke(IPC.fav.setNotify, id, notify),
      live: () => ipcRenderer.invoke(IPC.fav.live),
      copy: (text) => ipcRenderer.invoke(IPC.fav.copy, text)
    },
    tradeWindow: {
      open: (target) => ipcRenderer.invoke(IPC.tradeWindow.open, target),
      toggle: () => ipcRenderer.invoke(IPC.tradeWindow.toggle),
      hide: () => ipcRenderer.invoke(IPC.tradeWindow.hide),
      nav: (action) => ipcRenderer.invoke(IPC.tradeWindow.nav, action),
      setPinned: (pinned) => ipcRenderer.invoke(IPC.tradeWindow.setPinned, pinned),
      setSidebar: (collapsed) => ipcRenderer.invoke(IPC.tradeWindow.setSidebar, collapsed),
      state: () => ipcRenderer.invoke(IPC.tradeWindow.state),
      openInBrowser: () => ipcRenderer.invoke(IPC.tradeWindow.openInBrowser)
    },
    onFavChanged: (cb) => subscribe(IPC.events.favChanged, cb),
    onTradeSite: (cb) => subscribe(IPC.events.favSite, cb),
    onFavLive: (cb) => subscribe(IPC.events.favLive, cb),
    onTradeBlocked: (cb) => subscribe(IPC.events.favBlocked, cb)
  }
}
