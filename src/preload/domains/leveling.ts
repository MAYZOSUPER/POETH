import { ipcRenderer } from 'electron'
import { IPC, type LevelingIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

export function levelingBridge(): LevelingIpcApi {
  return {
    leveling: {
      data: () => ipcRenderer.invoke(IPC.leveling.data),
      state: () => ipcRenderer.invoke(IPC.leveling.state),
      act: (action) => ipcRenderer.invoke(IPC.leveling.act, action),
      setVariant: (v) => ipcRenderer.invoke(IPC.leveling.setVariant, v),
      setConfig: (patch) => ipcRenderer.invoke(IPC.leveling.setConfig, patch),
      profileCreate: (name) => ipcRenderer.invoke(IPC.leveling.profileCreate, name),
      profileSelect: (id) => ipcRenderer.invoke(IPC.leveling.profileSelect, id),
      profileUpdate: (id, patch) => ipcRenderer.invoke(IPC.leveling.profileUpdate, id, patch),
      profileRemove: (id) => ipcRenderer.invoke(IPC.leveling.profileRemove, id),
      simulate: (lines) => ipcRenderer.invoke(IPC.leveling.simulate, lines)
    },
    onLevelingChanged: (cb) => subscribe(IPC.events.levelingChanged, cb)
  }
}
