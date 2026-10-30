// IPC домена «Против надетого» (S41, B4): запомненные надетые вещи (userData/equipped.json) для окна цены Ctrl+D.
// Каналы нужны только игровому оверлею (OVERLAY_CHANNELS в src/main/security/policy.ts). Без флага вкладки «Билд»
// отвечают пустым состоянием. Сети нет; текст предмета в main не передаётся — только числа и короткие поля.
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (уникальность — tests/ipc.test.ts).

import type { EquipElement, EquipItem, EquipSlot, EquipState } from '../types/equip'

export const equipChannels = {
  equip: {
    state: 'equip:state',
    save: 'equip:save',
    forget: 'equip:forget',
    setMine: 'equip:setMine'
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
  }
  onEquipState(cb: (state: EquipState) => void): () => void
}
