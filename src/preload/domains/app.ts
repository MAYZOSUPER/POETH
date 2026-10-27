import { ipcRenderer } from 'electron'
import { IPC, type AppIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

export function appBridge(): AppIpcApi {
  return {
    settings: {
      get: () => ipcRenderer.invoke(IPC.settings.get),
      set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch)
    },
    window: {
      setLocked: (locked) => ipcRenderer.send(IPC.window.setLocked, locked),
      toggleVisible: () => ipcRenderer.send(IPC.window.toggleVisible),
      minimize: () => ipcRenderer.send(IPC.window.minimize),
      openExternal: (url) => ipcRenderer.send(IPC.window.openExternal, url)
    },
    hotkeys: {
      suspend: () => ipcRenderer.send(IPC.hotkeys.suspend),
      resume: () => ipcRenderer.send(IPC.hotkeys.resume)
    },
    app: {
      info: () => ipcRenderer.invoke(IPC.app.info),
      switchGame: (game) => ipcRenderer.invoke(IPC.app.switchGame, game),
      supporters: () => ipcRenderer.invoke(IPC.app.supporters)
    },
    onHotkey: (cb) => subscribe(IPC.events.hotkey, cb),
    onShowPage: (cb) => subscribe(IPC.events.showPage, cb)
  }
}
