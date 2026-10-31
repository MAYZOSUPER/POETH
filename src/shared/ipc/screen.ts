// IPC домена «цены поверх окон» (S68): состояние подписей для оверлея. Результат распознавания для «Богатства PoE 2»
// пойдёт отдельным каналом компаньона, когда появится его потребитель (в main — readStashTabItems, onScreenRead).
// Снимок — только по хоткею (main), каналов «сними экран» нет. Звать может только игровой оверлей (политика S29,
// OVERLAY_CHANNELS — строка через лида). Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>'.

import type { ScreenOverlayState } from '../types/screen'

export const screenChannels = {
  screen: {
    state: 'screen:state',
    hide: 'screen:hide'
  }
} as const

export const screenEvents = {
  screenState: 'event:screen.state'
} as const

export interface ScreenIpcApi {
  screen: {
    state(): Promise<ScreenOverlayState>
    /** спрятать подписи */
    hide(): Promise<void>
  }
  onScreenState(cb: (s: ScreenOverlayState) => void): () => void
}
