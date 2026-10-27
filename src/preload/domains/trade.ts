import { ipcRenderer } from 'electron'
import { IPC, type TradeIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// TODO S4: мост прайс-чека PoE1.
export function tradeBridge(): TradeIpcApi {
  return {
    trade: {
      priceCheck: (text) => ipcRenderer.invoke(IPC.trade.priceCheck, text),
      setSession: (poesessid) => ipcRenderer.invoke(IPC.trade.setSession, poesessid),
      hasSession: () => ipcRenderer.invoke(IPC.trade.hasSession),
      getLeagues: () => ipcRenderer.invoke(IPC.trade.getLeagues)
    },
    onPriceResult: (cb) => subscribe(IPC.events.priceResult, cb)
  }
}
