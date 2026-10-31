// IPC домена «цены поверх окон» (S68): состояние подписей для оверлея и последний результат распознавания.
// Снимок — только по хоткею (main), каналов «сними экран» нет. Звать может только игровой оверлей (политика S29,
// OVERLAY_CHANNELS — строка через лида). Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>'.

import type { ScreenOverlayState, ScreenRead } from '../types/screen'

export const screenChannels = {
  screen: {
    state: 'screen:state',
    last: 'screen:last',
    hide: 'screen:hide'
  }
} as const

export const screenEvents = {
  screenState: 'event:screen.state'
} as const

export interface ScreenIpcApi {
  screen: {
    state(): Promise<ScreenOverlayState>
    /** последний результат распознавания (без подписей); null — ещё не читали */
    last(): Promise<ScreenRead | null>
    /** спрятать подписи */
    hide(): Promise<void>
  }
  onScreenState(cb: (s: ScreenOverlayState) => void): () => void
}
