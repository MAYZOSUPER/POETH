import { app, dialog, ipcMain, net } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { DealLang, DealStatus, DealsConfigPatch, DealsExportResult, DealsLogStatus } from '@shared/types'
import { DealsStore } from '../services/dealsStore'
import { BlacklistService, type TextFetcher } from '../services/dealsBlacklist'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «менеджер сделок» (main, этап S8). Фаза 1: история (userData/deals.json), настройки
// менеджера, экспорт, чёрный список PoE Hub (кэш userData/cache/poehub-blacklist.json), примеры.
// Фаза 2 (после S1 и патча logTailer через лида): строки Client.txt PoE1 → store.ingestLines,
// карточки поверх игры, кнопки — одна команда в чат через typeInChat (S1).

let store: DealsStore | null = null
let blacklist: BlacklistService | null = null
let started: Promise<void> | null = null

/** Сеть до слияния S3: net.fetch сессии окон (без cookies аккаунта). После S3 — net/http.ts. */
const fetchText: TextFetcher = async (url, { etag, timeoutMs }) => {
  const res = await net.fetch(url, {
    headers: etag ? { 'If-None-Match': etag } : {},
    signal: AbortSignal.timeout(timeoutMs)
  })
  return { status: res.status, body: res.status === 200 ? await res.text() : '', etag: res.headers.get('etag') ?? undefined }
}

function getStore(): DealsStore {
  if (!store) {
    const s = new DealsStore(path.join(app.getPath('userData'), 'deals.json'))
    const bl = new BlacklistService({
      cacheFile: path.join(app.getPath('userData'), 'cache', 'poehub-blacklist.json'),
      fetcher: fetchText
    })
    s.setBlacklistChecker((who) => bl.check(who))
    s.on('changed', (state) => sendToCompanion(IPC.events.dealsChanged, state))
    s.on('deal', (deal) => sendToCompanion(IPC.events.dealsNew, deal))
    bl.on('status', (st) => sendToCompanion(IPC.events.dealsBlacklist, st))
    store = s
    blacklist = bl
  }
  return store
}

function getBlacklist(): BlacklistService {
  getStore()
  return blacklist as BlacklistService
}

/** Включить/выключить фоновое обновление списка по настройке «проверять по чёрному списку». */
function syncBlacklist(enabled: boolean): void {
  const bl = getBlacklist()
  if (enabled) {
    void bl.refreshIfStale() // в фоне: запуск не ждёт сеть
    bl.startAutoRefresh()
  } else bl.stop()
}

/** Загрузить историю и кэш чёрного списка (с диска); сеть — в фоне и только если проверка включена. */
function start(): Promise<void> {
  if (!started) {
    started = (async () => {
      const s = getStore()
      await s.load()
      await getBlacklist().loadCache()
      syncBlacklist(s.getState().config.checkBlacklist)
    })().catch((e) => console.error('[deals] запуск:', e))
  }
  return started
}

const STATUSES: DealStatus[] = ['new', 'invited', 'traded', 'sold', 'ignored']
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000

function isoDate(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function exportHistory(): Promise<DealsExportResult> {
  const s = getStore()
  await s.load()
  const win = getCompanionWindow()
  const ru = app.getLocale().startsWith('ru')
  const opts = {
    title: ru ? 'Экспорт истории сделок' : 'Export trade history',
    defaultPath: `poeth-deals-${isoDate()}.csv`,
    filters: [
      { name: 'CSV (Excel)', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return { status: 'canceled' }
  try {
    const json = result.filePath.toLowerCase().endsWith('.json')
    await fs.writeFile(result.filePath, json ? s.exportJson() : s.exportCsv(), 'utf8')
    return { status: 'saved', path: result.filePath }
  } catch {
    return { status: 'error' }
  }
}

function register(): void {
  ipcMain.handle(IPC.deals.state, async () => {
    await start()
    return getStore().getState()
  })
  ipcMain.handle(IPC.deals.setStatus, (_e, id: unknown, status: unknown) => {
    if (typeof id !== 'string' || !STATUSES.includes(status as DealStatus)) return getStore().getState()
    return getStore().setStatus(id, status as DealStatus)
  })
  ipcMain.handle(IPC.deals.remove, (_e, id: unknown) =>
    typeof id === 'string' ? getStore().remove(id) : getStore().getState()
  )
  ipcMain.handle(IPC.deals.clear, (_e, demoOnly: unknown) => getStore().clear(demoOnly === true))
  ipcMain.handle(IPC.deals.setConfig, async (_e, patch: unknown) => {
    const state = await getStore().setConfig((patch ?? {}) as DealsConfigPatch)
    syncBlacklist(state.config.checkBlacklist)
    return state
  })
  ipcMain.handle(IPC.deals.export, () => exportHistory())
  ipcMain.handle(IPC.deals.demo, (_e, lang: unknown) => getStore().addDemo((lang === 'ru' ? 'ru' : 'en') as DealLang))
  ipcMain.handle(IPC.deals.simulate, (_e, lines: unknown) => {
    if (!Array.isArray(lines)) return []
    const clean = lines
      .filter((l): l is string => typeof l === 'string')
      .slice(0, MAX_SIM_LINES)
      .map((l) => l.slice(0, MAX_LINE_LEN))
    return getStore().ingestLines(clean)
  })
  ipcMain.handle(IPC.deals.logStatus, (): DealsLogStatus => ({ connected: false, logPath: null }))
  ipcMain.handle(IPC.deals.blacklist.status, async () => {
    await getBlacklist().loadCache()
    return getBlacklist().status()
  })
  ipcMain.handle(IPC.deals.blacklist.refresh, async () => {
    const bl = getBlacklist()
    await bl.refresh()
    return bl.status()
  })
  ipcMain.handle(IPC.deals.blacklist.check, (_e, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return null
    const n = name.trim().slice(0, 64)
    return getBlacklist().check({ account: n, character: n })
  })
}

async function setupForGame(def: GameDef): Promise<void> {
  if (def.features.deals) await start()
}

export const dealsDomain: IpcDomain = { register, setupForGame }
