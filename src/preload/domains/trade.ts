import { ipcRenderer } from 'electron'
import { IPC, type TradeIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост прайс-чека: PoE2 (компас) и PoE1 (S4, окно цены в оверлее).
export function tradeBridge(): TradeIpcApi {
  return {
    trade: {
      priceCheck: (text) => ipcRenderer.invoke(IPC.trade.priceCheck, text),
      setSession: (poesessid) => ipcRenderer.invoke(IPC.trade.setSession, poesessid),
      hasSession: () => ipcRenderer.invoke(IPC.trade.hasSession),
      getLeagues: () => ipcRenderer.invoke(IPC.trade.getLeagues),
      poe1Search: (args) => ipcRenderer.invoke(IPC.trade.poe1Search, args),
      poe1Exchange: (args) => ipcRenderer.invoke(IPC.trade.poe1Exchange, args),
      poe1MatchUnknown: (lang, lines) => ipcRenderer.invoke(IPC.trade.poe1MatchUnknown, lang, lines),
      copyText: (text) => ipcRenderer.invoke(IPC.trade.copyText, text),
      currencyRate: (league) => ipcRenderer.invoke(IPC.trade.currencyRate, league)
    },
    onPriceResult: (cb) => subscribe(IPC.events.priceResult, cb)
  }
}
