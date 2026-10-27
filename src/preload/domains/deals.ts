import { ipcRenderer } from 'electron'
import { IPC, type DealsIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

export function dealsBridge(): DealsIpcApi {
  return {
    deals: {
      state: () => ipcRenderer.invoke(IPC.deals.state),
      setStatus: (id, status) => ipcRenderer.invoke(IPC.deals.setStatus, id, status),
      remove: (id) => ipcRenderer.invoke(IPC.deals.remove, id),
      clear: (demoOnly) => ipcRenderer.invoke(IPC.deals.clear, demoOnly === true),
      setConfig: (patch) => ipcRenderer.invoke(IPC.deals.setConfig, patch),
      export: () => ipcRenderer.invoke(IPC.deals.export),
      demo: (lang) => ipcRenderer.invoke(IPC.deals.demo, lang),
      simulate: (lines) => ipcRenderer.invoke(IPC.deals.simulate, lines),
      logStatus: () => ipcRenderer.invoke(IPC.deals.logStatus),
      blacklist: {
        status: () => ipcRenderer.invoke(IPC.deals.blacklist.status),
        refresh: () => ipcRenderer.invoke(IPC.deals.blacklist.refresh),
        check: (name) => ipcRenderer.invoke(IPC.deals.blacklist.check, name)
      }
    },
    onDealsChanged: (cb) => subscribe(IPC.events.dealsChanged, cb),
    onDealsNew: (cb) => subscribe(IPC.events.dealsNew, cb),
    onDealsBlacklist: (cb) => subscribe(IPC.events.dealsBlacklist, cb)
  }
}
