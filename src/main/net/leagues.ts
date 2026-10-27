import { app, powerMonitor } from 'electron'
import path from 'path'
import type { LeaguesState, TradeLeague } from '@shared/types'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { getSettings } from '../services/settingsStore'
import { tradeRequest } from './gateway'
import { netLog } from './http'
import { FALLBACK_LEAGUES, filterTradeLeagues, pickAutoLeague, resolveLeague } from './leagueRules'

// Лиги PoE1 (S3): GET /api/trade/data/leagues при старте и раз в час (+ после выхода
// из сна). Выбор 'auto' в настройках = текущая челлендж-лига: когда 13.11 появится
// лига 3.30, приложение переключится само при ближайшем обновлении. Последний
// полученный список хранится в userData/leagues-poe1.json (старт без сети).

const REFRESH_MS = 60 * 60 * 1000

let leagues: TradeLeague[] = FALLBACK_LEAGUES
let fromServer = false
let updatedAt: number | null = null
let loaded: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let refreshing: Promise<LeaguesState> | null = null
const listeners = new Set<(s: LeaguesState) => void>()

interface LeaguesCacheFile {
  leagues?: unknown
  updatedAt?: unknown
}

function cacheFile(): string {
  return path.join(app.getPath('userData'), 'leagues-poe1.json')
}

function loadCache(): Promise<void> {
  loaded ??= readJson<LeaguesCacheFile>(cacheFile(), {}).then((c) => {
    const list = filterTradeLeagues(c.leagues)
    if (list.length && !fromServer) {
      leagues = list
      fromServer = true
      updatedAt = typeof c.updatedAt === 'number' ? c.updatedAt : null
    }
  })
  return loaded
}

export function onLeaguesChanged(cb: (s: LeaguesState) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function getLeagueState(): Promise<LeaguesState> {
  await loadCache()
  const chosen = (await getSettings()).poe1.league
  const auto = pickAutoLeague(leagues)
  const { effective, stale } = resolveLeague(chosen, leagues, auto, fromServer)
  return { leagues, auto, chosen, effective, stale, updatedAt }
}

/** Лига для запросов PoE1 (учитывает 'auto'). */
export async function getEffectiveLeague(): Promise<string> {
  return (await getLeagueState()).effective
}

function essence(s: LeaguesState): string {
  return JSON.stringify([s.leagues, s.auto, s.effective, s.stale])
}

/** Обновить список с сервера (параллельные вызовы склеиваются). */
export function refreshLeagues(): Promise<LeaguesState> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function doRefresh(): Promise<LeaguesState> {
  const before = essence(await getLeagueState())
  const res = await tradeRequest<{ result?: unknown }>({
    kind: 'data',
    priority: 'background',
    maxWaitMs: 30_000,
    cache: false,
    req: { method: 'GET', endpoint: 'data/leagues', game: 'poe1' }
  })
  if (res.ok) {
    const list = filterTradeLeagues(res.data?.result)
    if (list.length) {
      leagues = list
      fromServer = true
      updatedAt = Date.now()
      writeJsonAtomic(cacheFile(), { leagues: list, updatedAt }).catch(() => undefined)
    }
  } else {
    netLog('warn', 'leagues: refresh failed —', res.error.code)
  }
  const after = await getLeagueState()
  if (essence(after) !== before) {
    netLog('debug', 'leagues: auto =', after.auto, 'effective =', after.effective)
    for (const cb of listeners) cb(after)
  }
  return after
}

const onResume = (): void => {
  void refreshLeagues()
}

/** Старт обновления (режим PoE1): сразу и раз в час. */
export function startLeagueRefresh(): void {
  if (timer) return
  void refreshLeagues()
  timer = setInterval(() => void refreshLeagues(), REFRESH_MS)
  powerMonitor.on('resume', onResume)
}

export function stopLeagueRefresh(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  powerMonitor.off('resume', onResume)
}
