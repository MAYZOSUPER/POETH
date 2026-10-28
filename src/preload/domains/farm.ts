import { ipcRenderer } from 'electron'
import { IPC, type FarmIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

export function farmBridge(): FarmIpcApi {
  return {
    farm: {
      state: () => ipcRenderer.invoke(IPC.farm.state),
      start: () => ipcRenderer.invoke(IPC.farm.start),
      pause: () => ipcRenderer.invoke(IPC.farm.pause),
      resume: () => ipcRenderer.invoke(IPC.farm.resume),
      stop: () => ipcRenderer.invoke(IPC.farm.stop),
      setConfig: (patch) => ipcRenderer.invoke(IPC.farm.setConfig, patch),
      removeRun: (id) => ipcRenderer.invoke(IPC.farm.removeRun, id),
      clear: () => ipcRenderer.invoke(IPC.farm.clear),
      simulate: (lines) => ipcRenderer.invoke(IPC.farm.simulate, lines),
      logStatus: () => ipcRenderer.invoke(IPC.farm.logStatus)
    },
    onFarmChanged: (cb) => subscribe(IPC.events.farmChanged, cb),
    onFarmLog: (cb) => subscribe(IPC.events.farmLog, cb)
  }
}
