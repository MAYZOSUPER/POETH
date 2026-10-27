import { ipcMain, clipboard } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import * as trade from '../services/tradeClient'
import * as secret from '../services/secretStore'
import { sendToCompanion } from '../windows/companionWindow'
import { onHotkeyAction } from '../hotkeys'
import type { IpcDomain } from './types'

// Домен «трейд/прайс-чек». Сейчас — прайс-чек PoE2 (trade2) из компаса.
// TODO S4: прайс-чек PoE1 (хоткей priceCheck в режиме poe1 → оверлей S1).

/** Price-check whatever is currently on the clipboard, push the result to the UI. */
async function priceCheckClipboard(): Promise<void> {
  const text = clipboard.readText()
  try {
    const result = await trade.priceCheck(text)
    sendToCompanion(IPC.events.priceResult, result)
  } catch (e) {
    // Always settle the renderer's spinner, even on an unexpected throw.
    console.error('[hotkey] price-check error:', e)
    sendToCompanion(IPC.events.priceResult, { status: 'error', message: 'unexpected error' })
  }
}

function register(): void {
  ipcMain.handle(IPC.trade.priceCheck, (_e, text: string) => trade.priceCheck(text))
  ipcMain.handle(IPC.trade.setSession, async (_e, poesessid: string) => {
    await secret.setSession(poesessid)
    return secret.hasSession()
  })
  ipcMain.handle(IPC.trade.hasSession, () => secret.hasSession())
  ipcMain.handle(IPC.trade.getLeagues, () => trade.getLeagues())
}

function setupForGame(def: GameDef): void {
  if (def.id === 'poe2') {
    // Read the item the user just copied (Ctrl+C) and price-check it. The renderer
    // gets event:hotkey first (switches tab + spinner), then event:priceResult.
    onHotkeyAction('priceCheck', () => {
      void priceCheckClipboard()
    })
  }
}

export const tradeDomain: IpcDomain = { register, setupForGame }
