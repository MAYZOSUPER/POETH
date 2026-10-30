import { ipcRenderer } from 'electron'
import { IPC, type TradeIpcApi } from '@shared/ipc'

// Мост прайс-чека: окно цены в оверлее, PoE1 (S4) и PoE2 (S47, trade2).
export function tradeBridge(): TradeIpcApi {
  return {
    trade: {
      poe1Search: (args) => ipcRenderer.invoke(IPC.trade.poe1Search, args),
      poe1Exchange: (args) => ipcRenderer.invoke(IPC.trade.poe1Exchange, args),
      poe1MatchUnknown: (lang, lines) => ipcRenderer.invoke(IPC.trade.poe1MatchUnknown, lang, lines),
      poe2Search: (args) => ipcRenderer.invoke(IPC.trade.poe2Search, args),
      poe2Exchange: (args) => ipcRenderer.invoke(IPC.trade.poe2Exchange, args),
      poe2MatchUnknown: (lang, lines) => ipcRenderer.invoke(IPC.trade.poe2MatchUnknown, lang, lines),
      copyText: (text) => ipcRenderer.invoke(IPC.trade.copyText, text),
      currencyRate: (league) => ipcRenderer.invoke(IPC.trade.currencyRate, league),
      poe1Faustus: (args) => ipcRenderer.invoke(IPC.trade.poe1Faustus, args)
    }
  }
}
