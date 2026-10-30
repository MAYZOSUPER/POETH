import { ipcRenderer } from 'electron'
import { IPC, type EquipIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «Против надетого» (S41): запомненные надетые вещи для окна цены. Диск и журнал игры — только в main;
// окно шлёт числа вещи (без текста предмета) и получает набор персонажа. «Точный расчёт (PoB)» (S44, бета) — EN-текст
// вещей в main и движок, только в памяти.
export function equipBridge(): EquipIpcApi {
  const q = IPC.equip
  return {
    equip: {
      state: () => ipcRenderer.invoke(q.state),
      save: (slot, item) => ipcRenderer.invoke(q.save, slot, item),
      forget: (slot) => ipcRenderer.invoke(q.forget, slot),
      setMine: (res) => ipcRenderer.invoke(q.setMine, res),
      setPob: (on) => ipcRenderer.invoke(q.setPob, on),
      pobCompare: (req) => ipcRenderer.invoke(q.pobCompare, req)
    },
    onEquipState: (cb) => subscribe(IPC.events.equipState, cb)
  }
}
