import { getGameDef, type GameDef, type GameId } from '@shared/games'

// Игра, с которой запущен процесс. Задаётся один раз при старте из настроек;
// меняется только перезапуском (в dev — мягким перезапуском, см. ipc/app.ts).

let running: GameId = 'poe1'

export function setRunningGame(game: GameId): void {
  running = game
}

export function getRunningGame(): GameId {
  return running
}

export function getRunningGameDef(): GameDef {
  return getGameDef(running)
}

/** dev-режим electron-vite: renderer грузится с dev-сервера. */
export function isDevServer(): boolean {
  return !!process.env.ELECTRON_RENDERER_URL
}
