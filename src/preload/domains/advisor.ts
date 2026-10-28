import { ipcRenderer } from 'electron'
import { IPC, type AdvisorIpcApi } from '@shared/ipc'
import { advisorDevFlag } from '@shared/advisor/flag'
import { subscribe } from '../subscribe'

// Мост домена «Советник: что фармить»: стратегии с оценкой по ценам, свои стратегии, код POETH1;
// цены, данные и раскрытие кода — только в main.
export function advisorBridge(): AdvisorIpcApi {
  const a = IPC.advisor
  return {
    advisor: {
      devFlag: advisorDevFlag(process.env),
      state: () => ipcRenderer.invoke(a.state),
      refresh: () => ipcRenderer.invoke(a.refresh),
      startFarm: (strategyId) => ipcRenderer.invoke(a.startFarm, strategyId),
      decode: (text) => ipcRenderer.invoke(a.decode, text),
      import: (code, mode) => ipcRenderer.invoke(a.import, code, mode),
      save: (strategy, id) => ipcRenderer.invoke(a.save, strategy, id),
      remove: (id) => ipcRenderer.invoke(a.remove, id),
      share: (id) => ipcRenderer.invoke(a.share, id),
      submit: (id) => ipcRenderer.invoke(a.submit, id),
      setNick: (nick) => ipcRenderer.invoke(a.setNick, nick),
      getDraft: () => ipcRenderer.invoke(a.getDraft),
      setDraft: (draft) => ipcRenderer.invoke(a.setDraft, draft),
      estimate: (lines) => ipcRenderer.invoke(a.estimate, lines),
      searchItems: (query) => ipcRenderer.invoke(a.searchItems, query),
      takeLink: () => ipcRenderer.invoke(a.takeLink)
    },
    onAdvisorState: (cb) => subscribe(IPC.events.advisorState, cb),
    onAdvisorLink: (cb) => subscribe(IPC.events.advisorLink, cb)
  }
}
