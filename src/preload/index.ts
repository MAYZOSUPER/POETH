import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type OverlayApi } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OverlayApi = {
  profiles: {
    list: () => ipcRenderer.invoke(IPC.profiles.list),
    create: (name, className) => ipcRenderer.invoke(IPC.profiles.create, name, className),
    rename: (id, name) => ipcRenderer.invoke(IPC.profiles.rename, id, name),
    delete: (id) => ipcRenderer.invoke(IPC.profiles.delete, id),
    setActive: (id) => ipcRenderer.invoke(IPC.profiles.setActive, id),
    getActive: () => ipcRenderer.invoke(IPC.profiles.getActive)
  },
  progress: {
    get: (pid) => ipcRenderer.invoke(IPC.progress.get, pid),
    setQuestDone: (pid, qid, done) =>
      ipcRenderer.invoke(IPC.progress.setQuestDone, pid, qid, done),
    setAct: (pid, act) => ipcRenderer.invoke(IPC.progress.setAct, pid, act),
    setLevel: (pid, level) => ipcRenderer.invoke(IPC.progress.setLevel, pid, level),
    setRewardChoice: (pid, qid, idx) =>
      ipcRenderer.invoke(IPC.progress.setRewardChoice, pid, qid, idx)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch)
  },
  dataset: {
    get: () => ipcRenderer.invoke(IPC.dataset.get)
  },
  layout: {
    resolve: (areaId) => ipcRenderer.invoke(IPC.layout.resolve, areaId)
  },
  tailer: {
    start: () => ipcRenderer.invoke(IPC.tailer.start),
    stop: () => ipcRenderer.invoke(IPC.tailer.stop),
    status: () => ipcRenderer.invoke(IPC.tailer.status),
    pickLogFile: () => ipcRenderer.invoke(IPC.tailer.pickLogFile)
  },
  window: {
    setOpacity: (value) => ipcRenderer.send(IPC.window.setOpacity, value),
    setLocked: (locked) => ipcRenderer.send(IPC.window.setLocked, locked),
    toggleVisible: () => ipcRenderer.send(IPC.window.toggleVisible),
    minimize: () => ipcRenderer.send(IPC.window.minimize)
  },
  onZoneChange: (cb) => subscribe(IPC.events.zoneChange, cb),
  onLevelChange: (cb) => subscribe(IPC.events.levelChange, cb),
  onTailerStatus: (cb) => subscribe(IPC.events.tailerStatus, cb),
  onHotkey: (cb) => subscribe(IPC.events.hotkey, cb),
  onActiveProfileChanged: (cb) => subscribe(IPC.events.activeProfileChanged, cb)
}

contextBridge.exposeInMainWorld('overlayApi', api)
