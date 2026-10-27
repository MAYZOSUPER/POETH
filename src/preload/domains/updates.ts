import { ipcRenderer } from 'electron'
import { IPC, type UpdatesIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «запуск и обновления» (S10a): экран загрузки, окно обновления, настройки.
export function updatesBridge(): UpdatesIpcApi {
  return {
    updates: {
      state: () => ipcRenderer.invoke(IPC.updates.state),
      check: () => ipcRenderer.invoke(IPC.updates.check),
      install: () => ipcRenderer.send(IPC.updates.install),
      later: () => ipcRenderer.send(IPC.updates.later)
    },
    startup: {
      state: () => ipcRenderer.invoke(IPC.startup.state)
    },
    onUpdateState: (cb) => subscribe(IPC.events.updateState, cb),
    onStartupState: (cb) => subscribe(IPC.events.startupState, cb)
  }
}
