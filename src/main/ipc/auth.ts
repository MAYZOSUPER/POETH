import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { getSettings } from '../services/settingsStore'
import { initNetIdentity } from '../net/session'
import { isTrustedAppUrl } from '../net/guards'
import {
  getAuthStatus,
  initAccount,
  logout,
  onAuthStatus,
  openLogin,
  pasteSession,
  recheck
} from '../net/account'
import {
  getLeagueState,
  onLeaguesChanged,
  refreshLeagues,
  startLeagueRefresh,
  stopLeagueRefresh
} from '../net/leagues'
import type { IpcDomain } from './types'

// Домен «вход в аккаунт и сеть» (S3). В renderer уходит только статус входа и лиги —
// значения cookies/POESESSID не покидают main. Вызывать каналы могут только наши
// страницы (file:// сборки или dev-сервер), события уходят только им же — окно сайта
// GGG (без preload) их не получает.

function devServerUrl(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
}

function isTrustedSender(e: IpcMainInvokeEvent): boolean {
  return isTrustedAppUrl(e.senderFrame?.url, devServerUrl())
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e, ...args: unknown[]) => {
    if (!isTrustedSender(e)) throw new Error('auth: untrusted IPC sender')
    return fn(...args)
  })
}

/** Событие — во все наши страницы (компаньон, оверлей, сайдбар), но не в окна сайта. */
function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isTrustedAppUrl(wc.getURL(), devServerUrl())) continue
    wc.send(channel, payload)
  }
}

function register(): void {
  // UA для окон/API (повторно — no-op; переключатель Chromium ставит вызов в main/index.ts до ready)
  initNetIdentity()
  initAccount({ getHost: async () => (await getSettings()).siteHost })
  onAuthStatus((s) => broadcast(IPC.events.authStatus, s))
  onLeaguesChanged((s) => broadcast(IPC.events.authLeagues, s))

  handle(IPC.auth.status, () => getAuthStatus())
  handle(IPC.auth.login, async () => {
    const lang = (await getSettings()).uiLang
    await openLogin(lang === 'ru' ? 'Вход в Path of Exile — POETH' : 'Path of Exile sign-in — POETH')
  })
  handle(IPC.auth.logout, () => logout())
  handle(IPC.auth.recheck, () => recheck())
  handle(IPC.auth.pasteSession, (value) => pasteSession(value))
  handle(IPC.leagues.get, () => getLeagueState())
  handle(IPC.leagues.refresh, () => refreshLeagues())
}

function setupForGame(def: GameDef): void {
  // лиги нужны трейду PoE1; в режиме PoE2 их список у прайс-чека компаса свой
  if (def.id === 'poe1') startLeagueRefresh()
  else stopLeagueRefresh()
}

export const authDomain: IpcDomain = { register, setupForGame }
