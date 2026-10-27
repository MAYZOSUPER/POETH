import { BrowserWindow } from 'electron'
import { getGameDef, type GameId } from '@shared/games'
import { getSettings } from '../services/settingsStore'
import { clearHotkeyActions, registerHotkeys } from '../hotkeys'
import { setRunningGame } from '../gameContext'
import type { IpcDomain } from './types'
import { appDomain, setSoftRestart } from './app'
import { campaignDomain } from './campaign'
import { tradeDomain } from './trade'
import { overlayDomain } from './overlay'
import { liveDomain } from './live'
import { favDomain } from './fav'
import { regexDomain } from './regex'
import { authDomain } from './auth'
import { dealsDomain } from './deals'
import { updatesDomain } from './updates'

// Реестр доменов main-IPC. ЗАМОРОЖЕН после S0: новый домен подключает лид.
const DOMAINS: IpcDomain[] = [
  appDomain,
  campaignDomain,
  tradeDomain,
  overlayDomain,
  liveDomain,
  favDomain,
  regexDomain,
  authDomain,
  dealsDomain,
  updatesDomain
]

/** Register every domain's ipcMain handlers (once, at startup). */
export function registerIpcHandlers(): void {
  for (const d of DOMAINS) d.register()
  setSoftRestart(softRestart)
}

/** Configure all domains for the running game, then (re)register global hotkeys. */
export async function setupGame(game: GameId): Promise<void> {
  setRunningGame(game)
  clearHotkeyActions()
  const def = getGameDef(game)
  for (const d of DOMAINS) await d.setupForGame?.(def)
  registerHotkeys((await getSettings()).hotkeys)
}

/** dev-only «перезапуск» под другую игру: перенастроить домены и перезагрузить окна. */
async function softRestart(game: GameId): Promise<void> {
  await setupGame(game)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.reloadIgnoringCache()
}

export { applySettingsToWindow } from './app'
export { reconcileTailer } from './campaign'
