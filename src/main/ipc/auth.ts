import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { Poe2SessionNotice } from '@shared/types'
import { getSettings } from '../services/settingsStore'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { hasLegacyPoe2SessionFile, readLegacyPoe2Session, removeLegacyPoe2Session } from '../services/secretStore'
import { migratePoe2Session, settledAuthStatus } from '../services/poe2SessionMigration'
import { initNetIdentity } from '../net/session'
import { isTrustedAppUrl } from '../net/guards'
import {
  getAuthStatus,
  initAccount,
  logout,
  onAuthStatus,
  pasteSession,
  recheck
} from '../net/account'
import { openTradeLogin } from './fav'
import {
  getLeagueState,
  onLeaguesChanged,
  refreshLeagues,
  startLeagueRefresh,
  stopLeagueRefresh
} from '../net/leagues'
import type { IpcDomain } from './types'
import { devEnv } from '../devEnv'
import { isAppPageUrl } from '../security'

// Домен «вход в аккаунт и сеть» (S3). В renderer уходит только статус входа и лиги —
// значения cookies/POESESSID не покидают main. Вызывать каналы могут только наши
// страницы (file:// сборки или dev-сервер), события уходят только им же — окно сайта
// GGG (без preload) их не получает.

function devServerUrl(): string | undefined {
  return devEnv('ELECTRON_RENDERER_URL')
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
    if (wc.isDestroyed() || !isAppPageUrl(wc.getURL())) continue
    wc.send(channel, payload)
  }
}

// ---------------------------------------------------------------- S47: старый POESESSID прайс-чека PoE2

const POE2_NOTICES = new Set<Poe2SessionNotice>(['moved', 'expired', 'already'])

function poe2NoticeFile(): string {
  return path.join(app.getPath('userData'), 'poe2-session-notice.json')
}

async function readPoe2Notice(): Promise<Poe2SessionNotice | null> {
  const f = await readJson<{ notice?: unknown }>(poe2NoticeFile(), {})
  return POE2_NOTICES.has(f.notice as Poe2SessionNotice) ? (f.notice as Poe2SessionNotice) : null
}

async function dismissPoe2Notice(): Promise<void> {
  const file = poe2NoticeFile()
  await Promise.all([file, `${file}.bak`, `${file}.tmp`].map((f) => fs.rm(f, { force: true })))
}

/** Один раз при старте (после первой проверки входа): перенести ключ из secret.json во вход аккаунта. */
function runPoe2SessionMigration(): void {
  void migratePoe2Session({
    hasLegacyFile: hasLegacyPoe2SessionFile,
    readLegacy: readLegacyPoe2Session,
    removeLegacy: removeLegacyPoe2Session,
    authStatus: () => settledAuthStatus(getAuthStatus, onAuthStatus),
    pasteSession: (value) => pasteSession(value),
    saveNotice: (notice) => writeJsonAtomic(poe2NoticeFile(), { notice, at: Date.now() })
  }).catch((e) => console.warn('[auth] перенос ключа PoE2:', e instanceof Error ? e.message : e))
}

function register(): void {
  // UA для окон/API (повторно — no-op; переключатель Chromium ставит вызов в main/index.ts до ready)
  initNetIdentity()
  initAccount({ getHost: async () => (await getSettings()).siteHost })
  onAuthStatus((s) => broadcast(IPC.events.authStatus, s))
  onLeaguesChanged((s) => broadcast(IPC.events.authLeagues, s))

  handle(IPC.auth.status, () => getAuthStatus())
  // S5: вход — в трейд-окне на официальной странице /login (после входа окно переходит на сайт трейда)
  handle(IPC.auth.login, () => openTradeLogin())
  handle(IPC.auth.logout, () => logout())
  handle(IPC.auth.recheck, () => recheck())
  handle(IPC.auth.pasteSession, (value) => pasteSession(value))
  handle(IPC.auth.poe2Notice, () => readPoe2Notice())
  handle(IPC.auth.poe2NoticeDismiss, () => dismissPoe2Notice())
  handle(IPC.leagues.get, () => getLeagueState())
  handle(IPC.leagues.refresh, () => refreshLeagues())
  runPoe2SessionMigration()
}

function setupForGame(def: GameDef): void {
  // лиги нужны трейду обеих игр (S47: окно цены PoE2 тоже поверх игры); без прайс-чека — не опрашиваем
  if (def.features.priceCheck) startLeagueRefresh()
  else stopLeagueRefresh()
}

export const authDomain: IpcDomain = { register, setupForGame }
