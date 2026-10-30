// IPC домена «Против надетого» (S41, B4): запомненные надетые вещи (userData/equipped.json) для окна цены Ctrl+D.
// Каналы нужны только игровому оверлею (OVERLAY_CHANNELS в src/main/security/policy.ts). Без флага вкладки «Билд»
// отвечают пустым состоянием. Сети нет; в equipped.json — только числа и короткие поля, без текста предмета.
// «Точный расчёт (PoB)» (S44, бета, по умолчанию выключен): окно шлёт EN-текст предмета и надетых вещей в main и
// в локальный процесс движка PoB — только в памяти, на диск не пишется.
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (уникальность — tests/ipc.test.ts).

import type { EquipElement, EquipItem, EquipSlot, EquipState } from '../types/equip'
import type { PobCompareRequest, PobCompareResponse } from '../types/pobCompare'

export const equipChannels = {
  equip: {
    state: 'equip:state',
    save: 'equip:save',
    forget: 'equip:forget',
    setMine: 'equip:setMine',
    setPob: 'equip:setPob',
    pobCompare: 'equip:pobCompare'
  }
} as const

export const equipEvents = {
  equipState: 'event:equip.state'
} as const

export interface EquipIpcApi {
  equip: {
    /** набор персонажа текущего входа (по Client.txt) или общий «без персонажа» */
    state(): Promise<EquipState>
    /** «Запомнить как надетое»: числа вещи в слот */
    save(slot: EquipSlot, item: EquipItem): Promise<EquipState>
    forget(slot: EquipSlot): Promise<EquipState>
    /** «мои сопротивления сейчас»; null — убрать */
    setMine(res: Partial<Record<EquipElement, number>> | null): Promise<EquipState>
    /** «Точный расчёт (PoB)» (бета): включить/выключить */
    setPob(on: boolean): Promise<EquipState>
    /** сравнить движком PoB (EN-текст предмета и надетых вещей этого сеанса) */
    pobCompare(req: PobCompareRequest): Promise<PobCompareResponse>
  }
  onEquipState(cb: (state: EquipState) => void): () => void
}
