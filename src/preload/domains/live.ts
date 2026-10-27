import { ipcRenderer } from 'electron'
import { IPC, type LiveIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «live search»: состояние и находки; соединения — только в main.
export function liveBridge(): LiveIpcApi {
  return {
    live: {
      state: () => ipcRenderer.invoke(IPC.live.state),
      add: (input, title) => ipcRenderer.invoke(IPC.live.add, input, title),
      remove: (id) => ipcRenderer.invoke(IPC.live.remove, id),
      setEnabled: (id, enabled) => ipcRenderer.invoke(IPC.live.setEnabled, id, enabled),
      update: (id, patch) => ipcRenderer.invoke(IPC.live.update, id, patch),
      setOptions: (patch) => ipcRenderer.invoke(IPC.live.setOptions, patch),
      whisper: (key) => ipcRenderer.invoke(IPC.live.whisper, key),
      copyWhisper: (key) => ipcRenderer.invoke(IPC.live.copyWhisper, key),
      openHit: (key) => ipcRenderer.invoke(IPC.live.openHit, key)
    },
    onLiveState: (cb) => subscribe(IPC.events.liveState, cb),
    onLiveHit: (cb) => subscribe(IPC.events.liveHit, cb)
  }
}
