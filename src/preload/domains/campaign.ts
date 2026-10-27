import { ipcRenderer } from 'electron'
import { IPC, type CampaignIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

export function campaignBridge(): CampaignIpcApi {
  return {
    profiles: {
      list: () => ipcRenderer.invoke(IPC.profiles.list),
      create: (name, className) => ipcRenderer.invoke(IPC.profiles.create, name, className),
      rename: (id, name) => ipcRenderer.invoke(IPC.profiles.rename, id, name),
      setClass: (id, className) => ipcRenderer.invoke(IPC.profiles.setClass, id, className),
      delete: (id) => ipcRenderer.invoke(IPC.profiles.delete, id),
      setActive: (id) => ipcRenderer.invoke(IPC.profiles.setActive, id),
      getActive: () => ipcRenderer.invoke(IPC.profiles.getActive),
      export: (id) => ipcRenderer.invoke(IPC.profiles.export, id),
      import: () => ipcRenderer.invoke(IPC.profiles.import)
    },
    progress: {
      get: (pid) => ipcRenderer.invoke(IPC.progress.get, pid),
      setQuestDone: (pid, qid, done) =>
        ipcRenderer.invoke(IPC.progress.setQuestDone, pid, qid, done),
      setQuestsDone: (pid, qids) => ipcRenderer.invoke(IPC.progress.setQuestsDone, pid, qids),
      setManyQuests: (pid, qids, done) =>
        ipcRenderer.invoke(IPC.progress.setManyQuests, pid, qids, done),
      setAct: (pid, act) => ipcRenderer.invoke(IPC.progress.setAct, pid, act),
      setLevel: (pid, level) => ipcRenderer.invoke(IPC.progress.setLevel, pid, level),
      setRewardChoice: (pid, qid, idx) =>
        ipcRenderer.invoke(IPC.progress.setRewardChoice, pid, qid, idx),
      setTrialDone: (pid, tid, done) =>
        ipcRenderer.invoke(IPC.progress.setTrialDone, pid, tid, done),
      setAscendancy: (pid, ascId) => ipcRenderer.invoke(IPC.progress.setAscendancy, pid, ascId)
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
    onZoneChange: (cb) => subscribe(IPC.events.zoneChange, cb),
    onLevelChange: (cb) => subscribe(IPC.events.levelChange, cb),
    onTailerStatus: (cb) => subscribe(IPC.events.tailerStatus, cb),
    onBossDefeat: (cb) => subscribe(IPC.events.bossDefeat, cb),
    onActiveProfileChanged: (cb) => subscribe(IPC.events.activeProfileChanged, cb)
  }
}
