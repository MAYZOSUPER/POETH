// IPC домена «приложение»: настройки, управление окном компаньона, хоткеи, смена игры.
// ЗАМОРОЖЕН после S0 (меняет только лид).

import type { AppInfo, HotkeyAction, Settings, SettingsPatch } from '../types'
import type { GameId } from '../games'

export const appChannels = {
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  window: {
    setLocked: 'window:setLocked',
    toggleVisible: 'window:toggleVisible',
    minimize: 'window:minimize',
    openExternal: 'window:openExternal'
  },
  hotkeys: {
    suspend: 'hotkeys:suspend',
    resume: 'hotkeys:resume'
  },
  app: {
    info: 'app:info',
    switchGame: 'app:switchGame'
  }
} as const

export const appEvents = {
  hotkey: 'event:hotkey'
} as const

export interface AppIpcApi {
  settings: {
    get(): Promise<Settings>
    /** Apply a patch (sections merge one level deep). `game` is ignored — use app.switchGame. */
    set(patch: SettingsPatch): Promise<Settings>
  }
  window: {
    /** true = companion ignores the mouse entirely (clicks pass through to the game) */
    setLocked(locked: boolean): void
    toggleVisible(): void
    minimize(): void
    /** open an https URL in the default browser (allowlist: @shared/links EXTERNAL_HOSTS) */
    openExternal(url: string): void
  }
  hotkeys: {
    /** Temporarily unregister all global shortcuts (while the user rebinds one). */
    suspend(): void
    /** Re-register global shortcuts from the saved settings. */
    resume(): void
  }
  app: {
    /** Игра, с которой запущен процесс, версия, dev-режим. */
    info(): Promise<AppInfo>
    /** Сохранить выбор игры и перезапустить приложение (в dev — мягкий перезапуск окон). */
    switchGame(game: GameId): Promise<void>
  }
  onHotkey(cb: (action: HotkeyAction) => void): () => void
}
