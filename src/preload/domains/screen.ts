import { ipcRenderer } from 'electron'
import { screenChannels, screenEvents, type ScreenIpcApi } from '@shared/ipc/screen'
import { subscribe } from '../subscribe'

// Мост домена «цены поверх окон» (S68). Каналы берутся из доменного файла: строка в агрегаторе — через лида.
export function screenBridge(): ScreenIpcApi {
  return {
    screen: {
      state: () => ipcRenderer.invoke(screenChannels.screen.state),
      last: () => ipcRenderer.invoke(screenChannels.screen.last),
      hide: () => ipcRenderer.invoke(screenChannels.screen.hide)
    },
    onScreenState: (cb) => subscribe(screenEvents.screenState, cb)
  }
}
