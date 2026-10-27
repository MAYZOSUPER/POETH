// Общие типы приложения (информация о запуске, смена игры).

import type { GameId } from '../games'

/** Страница компаньона, которую можно открыть снаружи (трей, мастер): S9. */
export type CompanionPage = 'about' | 'settings' | 'wizard'

export interface AppInfo {
  /** игра, с которой запущен процесс (меняется только перезапуском) */
  game: GameId
  version: string
  /** dev-режим (electron-vite dev): настоящий relaunch невозможен — мягкий перезапуск */
  isDev: boolean
}
