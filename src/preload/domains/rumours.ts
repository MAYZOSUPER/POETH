import { ipcRenderer } from 'electron'
import { IPC, type RumoursIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «Слухи журнала» (S65, PoE 2): окно шлёт id слухов и пометку, получает данные, выбор и цены.
export function rumoursBridge(): RumoursIpcApi {
  const q = IPC.rumours
  return {
    rumours: {
      data: () => ipcRenderer.invoke(q.data),
      state: () => ipcRenderer.invoke(q.state),
      setPicked: (ids) => ipcRenderer.invoke(q.setPicked, ids),
      setMark: (id, mark) => ipcRenderer.invoke(q.setMark, id, mark),
      prices: (refresh) => ipcRenderer.invoke(q.prices, refresh === true)
    },
    onRumoursState: (cb) => subscribe(IPC.events.rumoursState, cb),
    onRumoursOverlay: (cb) => subscribe(IPC.events.rumoursOverlay, cb)
  }
}
