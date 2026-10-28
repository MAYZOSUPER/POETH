import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { isTrustedAppUrl } from '../net/guards'
import { getEffectiveLeague, netLog, onLeaguesChanged } from '../net'
import { onSettingsChange } from '../services/settingsStore'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { resourcesDir } from '../services/questDataset'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { FEED_WANT_HOURS, FlipManager, type GoldFees } from '../games/poe1/flip/manager'
import type { IpcDomain } from './types'

// Домен «помощник по флиппингу» (main, S13): часы фида обмена GGG из общего хранилища (его же берут учёт
// богатства и курс для окна цены), маршруты и курс divine:chaos. Звать каналы могут только наши страницы.

function devServerUrl(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isTrustedAppUrl(wc.getURL(), devServerUrl())) continue
    wc.send(channel, payload)
  }
}

const log = (msg: string): void => netLog('debug', msg)

/** Файл данных: обновлённый (userData/data) главнее встроенного. */
async function readData<T>(rel: string): Promise<T | null> {
  for (const base of [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]) {
    try {
      return JSON.parse(await fs.readFile(path.join(base, 'poe1', rel), 'utf8')) as T
    } catch {
      // следующий кандидат
    }
  }
  return null
}

const configFile = (): string => path.join(app.getPath('userData'), 'flip', 'config.json')

let manager: FlipManager | null = null
let unsubs: Array<() => void> = []

function getManager(): FlipManager {
  if (manager) return manager
  manager = new FlipManager({
    feed: getFeedStore(),
    league: () => getEffectiveLeague(),
    loadNames: async () => (await readData<{ names?: Record<string, string> }>('wealth/exchange-ids.json'))?.names ?? {},
    loadFees: async () => {
      const raw = await readData<GoldFees & { version?: number }>('flip/gold-fees.json')
      return raw && raw.fees && typeof raw.fees === 'object' ? raw : null
    },
    loadConfig: () => readJson<unknown>(configFile(), null),
    saveConfig: (cfg) => writeJsonAtomic(configFile(), cfg),
    emit: (s) => broadcast(IPC.events.flipState, s),
    // тост показывает оверлей (виджет «Обмен» по макету — после утверждения)
    alert: (a) => broadcast(IPC.events.flipAlert, a),
    log
  })
  return manager
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('flip: untrusted IPC sender')
    return fn(...args)
  })
}

function register(): void {
  const m = (): FlipManager => getManager()
  handle(IPC.flip.state, () => m().state())
  handle(IPC.flip.refresh, async () => {
    await m().refresh()
    return m().state()
  })
  handle(IPC.flip.setFilters, (patch) => m().setFilters(patch))
  handle(IPC.flip.setOptions, (patch) => m().setOptions(patch))
}

async function setupForGame(def: GameDef): Promise<void> {
  for (const u of unsubs) u()
  unsubs = []
  const m = getManager()
  const feed = getFeedStore()
  if (def.id !== 'poe1') {
    feed.stop()
    m.stop()
    return
  }
  unsubs.push(onLeaguesChanged(() => void m.onLeagueChanged()))
  unsubs.push(onSettingsChange(() => void m.onLeagueChanged()))
  // часы фида — раз в час для всех (учёт богатства, курс окна цены, флиппинг)
  feed.start(() => getEffectiveLeague().catch(() => null), FEED_WANT_HOURS)
  await m.start()
}

export const flipDomain: IpcDomain = { register, setupForGame }
