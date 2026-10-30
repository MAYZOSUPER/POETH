// IPC домена «приложение»: настройки, управление окном компаньона, хоткеи, смена игры.
// ЗАМОРОЖЕН после S0 (меняет только лид).

import type { AppInfo, CompanionPage, HotkeyAction, Settings, SettingsPatch } from '../types'
import type { Supporter } from '../credits'
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
    switchGame: 'app:switchGame',
    supporters: 'app:supporters',
    /** S56: форма GitHub «Ошибка / Bug» в браузере (адрес собирает main) */
    reportBug: 'app:reportBug'
  }
} as const

export const appEvents = {
  hotkey: 'event:hotkey',
  /** S9: открыть страницу компаньона (трей: «О программе», «Настройки») */
  showPage: 'event:app.showPage'
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
    /** «Благодарности» (S9): resources/supporters.json, без сети */
    supporters(): Promise<Supporter[]>
    /** «Сообщить об ошибке» (S56): main открывает форму GitHub с версией, игрой и языками — без данных игрока */
    reportBug(): Promise<void>
  }
  onHotkey(cb: (action: HotkeyAction) => void): () => void
  /** main просит открыть страницу компаньона (showCompanionPage в src/main/ipc/app.ts) */
  onShowPage(cb: (page: CompanionPage) => void): () => void
}
