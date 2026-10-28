import { ipcRenderer } from 'electron'
import { IPC, type AdvisorIpcApi } from '@shared/ipc'
import { advisorDevFlag } from '@shared/advisor/flag'
import { subscribe } from '../subscribe'

// Мост домена «Советник: что фармить»: стратегии с оценкой по ценам; цены и данные — только в main.
export function advisorBridge(): AdvisorIpcApi {
  return {
    advisor: {
      devFlag: advisorDevFlag(process.env),
      state: () => ipcRenderer.invoke(IPC.advisor.state),
      refresh: () => ipcRenderer.invoke(IPC.advisor.refresh),
      startFarm: (strategyId) => ipcRenderer.invoke(IPC.advisor.startFarm, strategyId)
    },
    onAdvisorState: (cb) => subscribe(IPC.events.advisorState, cb)
  }
}
