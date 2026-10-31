import { ipcRenderer } from 'electron'
import { IPC, type ScreenIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «цены поверх окон» (S68): состояние подписей и «спрятать». Снимок экрана — только по хоткею в main.
export function screenBridge(): ScreenIpcApi {
  return {
    screen: {
      state: () => ipcRenderer.invoke(IPC.screen.state),
      hide: () => ipcRenderer.invoke(IPC.screen.hide)
    },
    onScreenState: (cb) => subscribe(IPC.events.screenState, cb)
  }
}
