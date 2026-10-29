import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import { GAMES, siteUrl, type GameDef } from '@shared/games'
import type { ItemFlipState } from '@shared/types'
import { itemFlipDevFlag, itemFlipOn } from '@shared/flip/items/flag'
import { computeExchangePrices } from '@shared/wealth/exchange'
import { toCompactHour } from '@shared/flip/feed'
import { loopbackUrl } from '@shared/updates'
import { isAllowedDataUrl } from '@shared/links'
import { getEffectiveLeague, getAnonSession, getUserAgent, httpRequest, netLog, tradeRequest } from '../../../../net'
import { getSettings } from '../../../../services/settingsStore'
import { readJson, writeJsonAtomic } from '../../../../services/atomicJson'
import { BlacklistService, type TextFetcher } from '../../../../services/dealsBlacklist'
import { getDivineTrack, getFeedStore } from '../../exchange/feedService'
import { ItemFlipManager } from './manager'
import { PRICES_BASE_URL, SnapshotSource, type GetResult } from './snapshotSource'

// «Обмен → Предметы» (S33) — проводка main: снимок цен с GitHub (ветка `prices`), курсы фида обмена, шлюз трейда
// (interactive), список price-fixer'ов PoE Hub. Каналы — в домене flip (src/main/ipc/flip.ts зовёт registerItemFlip
// и setupItemFlip), отправителя проверяет общий handle домена.
//
// Разработка: POETH_ITEMFLIP=1 — включить; POETH_ITEMFLIP_PRICES=<папка снимка> (только dev-сборка) или
// http://127.0.0.1:<порт>/ — снимок не с GitHub.

/** pricefixers.csv PoE Hub (The-Forbidden-Trove/ForbiddenTroveBlacklist, MIT) — формат как у blacklist.csv. */
export const PRICEFIXERS_URL = 'https://raw.githubusercontent.com/The-Forbidden-Trove/ForbiddenTroveBlacklist/main/pricefixers.csv'

const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000

type Handle = (channel: string, fn: (...args: unknown[]) => unknown) => void

const log = (msg: string): void => netLog('debug', msg)
const cacheDir = (): string => path.join(app.getPath('userData'), 'flip')

let enabled = false
let manager: ItemFlipManager | null = null
let fixers: BlacklistService | null = null
let emitState: (s: ItemFlipState) => void = () => undefined

/** Откуда брать снимок: GitHub, loopback (проверка) или папка (dev). */
function pricesBase(): { kind: 'url'; base: string } | { kind: 'dir'; dir: string } {
  const env = process.env.POETH_ITEMFLIP_PRICES
  const loop = loopbackUrl(env)
  if (loop) return { kind: 'url', base: loop.endsWith('/') ? loop : `${loop}/` }
  if (env && !app.isPackaged && path.isAbsolute(env)) return { kind: 'dir', dir: env }
  return { kind: 'url', base: PRICES_BASE_URL }
}

async function getPrices(rel: string, etag?: string): Promise<GetResult> {
  const src = pricesBase()
  if (src.kind === 'dir') {
    const file = path.resolve(src.dir, rel)
    if (!file.startsWith(path.resolve(src.dir))) throw new Error('путь вне папки снимка')
    return { status: 200, body: await fs.readFile(file, 'utf8') }
  }
  const url = new URL(rel, src.base).toString()
  const headers: Record<string, string> = etag ? { 'If-None-Match': etag } : {}
  if (isAllowedDataUrl(url)) {
    const res = await httpRequest({ url, headers, timeoutMs: FETCH_TIMEOUT_MS })
    if (res.body.length > MAX_SNAPSHOT_BYTES) throw new Error('слишком большой ответ')
    return { status: res.status, body: res.status === 200 ? res.body : '', etag: res.headers.etag || undefined }
  }
  if (!loopbackUrl(url)) throw new Error(`host not allowed: ${new URL(url).host}`)
  // проверка без публикации: loopback через сессию без cookies
  const res = await getAnonSession().fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    headers: { ...headers, 'User-Agent': getUserAgent() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  return { status: res.status, body: res.status === 200 ? await res.text() : '', etag: res.headers.get('etag') ?? undefined }
}

const fetchText: TextFetcher = async (url, { etag, timeoutMs }) => {
  const res = await httpRequest({ url, headers: etag ? { 'If-None-Match': etag } : {}, timeoutMs, accept: 'text/csv, text/plain, */*' })
  return { status: res.status, body: res.status === 200 ? res.body : '', etag: res.headers.etag || undefined }
}

function getFixers(): BlacklistService {
  fixers ??= new BlacklistService({
    cacheFile: path.join(app.getPath('userData'), 'cache', 'poehub-pricefixers.json'),
    fetcher: fetchText,
    url: PRICEFIXERS_URL
  })
  return fixers
}

/** Курсы фида обмена GGG: divine — тот же курс, что у шапки «Обмена» и окна цены; сферы — VWAP за 6–48 ч. */
async function feedPrices(league: string): Promise<{ divine: number; byId: Map<string, { chaos: number }> } | null> {
  const feed = getFeedStore()
  await feed.refresh(league)
  const prices = computeExchangePrices(feed.hours(league, 48).map(toCompactHour), league)
  const track = await getDivineTrack(league).catch(() => null)
  const divine = track?.current ?? prices.divineRate
  if (!(divine > 0) && !prices.byId.size) return null
  return { divine, byId: prices.byId }
}

function getManager(): ItemFlipManager {
  manager ??= new ItemFlipManager({
    league: () => getEffectiveLeague(),
    snapshot: new SnapshotSource({
      get: getPrices,
      readCache: (rel) => readJson<unknown>(path.join(cacheDir(), `${rel}`), null),
      writeCache: (rel, data) => writeJsonAtomic(path.join(cacheDir(), rel), data),
      log
    }),
    feed: feedPrices,
    search: async (league, body) => {
      const r = await tradeRequest<{ id: string; result: string[]; total: number }>({
        kind: 'search',
        priority: 'interactive',
        req: { method: 'POST', endpoint: 'search', rest: encodeURIComponent(league), body, game: 'poe1' }
      })
      if (!r.ok) return r
      if (typeof r.data?.id !== 'string' || !Array.isArray(r.data.result)) return { ok: false, error: { code: 'bad-response' } }
      return { ok: true, data: r.data }
    },
    fetch: async (ids, searchId) => {
      const r = await tradeRequest<{ result: unknown[] }>({
        kind: 'fetch',
        priority: 'interactive',
        req: { method: 'GET', endpoint: 'fetch', rest: `${ids.join(',')}?query=${encodeURIComponent(searchId)}`, game: 'poe1' }
      })
      if (!r.ok) return r
      return { ok: true, data: { result: Array.isArray(r.data?.result) ? (r.data.result as never[]) : [] } }
    },
    siteUrl: async (league, id) => siteUrl(GAMES.poe1, (await getSettings()).siteHost, league, id),
    isFixer: (account) => getFixers().check({ account }) !== null,
    loadConfig: () => readJson<unknown>(path.join(cacheDir(), 'items.json'), null),
    saveConfig: (cfg) => writeJsonAtomic(path.join(cacheDir(), 'items.json'), cfg),
    emit: (s) => emitState(s),
    log
  })
  return manager
}

const OFF: ItemFlipState = {
  supported: false,
  league: null,
  loading: false,
  problem: null,
  at: null,
  nextAt: null,
  divine: 0,
  fusing: null,
  jewellers: null,
  rows: [],
  sixLinks: [],
  config: { k: 0.7, picks: [], list: 'top' }
}

/** Каналы «Предметов» (в домене flip). */
export function registerItemFlip(handle: Handle, broadcast: (channel: string, payload: unknown) => void): void {
  emitState = (s) => broadcast(IPC.events.flipItems, s)
  const m = (): ItemFlipManager => getManager()
  handle(IPC.flip.itemsState, () => (enabled ? m().state() : OFF))
  handle(IPC.flip.itemsRefresh, async () => {
    if (!enabled) return OFF
    await m().refresh(true)
    return m().state()
  })
  handle(IPC.flip.itemsConfig, (patch) => (enabled ? m().setConfig(patch) : OFF))
  handle(IPC.flip.itemsCheck, (rowId, k) => (enabled ? m().check(rowId, k) : { ok: false, rowId: '', error: 'no-row' }))
  handle(IPC.flip.itemsWatch, (rowId, k) => (enabled ? m().watchUrl(rowId, k) : { ok: false, error: 'no-row' }))
}

export async function setupItemFlip(def: GameDef): Promise<void> {
  enabled = itemFlipOn(def, itemFlipDevFlag(process.env))
  if (!enabled) {
    manager?.stop()
    fixers?.stop()
    return
  }
  const bl = getFixers()
  await bl.loadCache().catch(() => undefined)
  void bl.refreshIfStale()
  bl.startAutoRefresh()
  await getManager().start()
}

export function itemFlipLeagueChanged(): void {
  if (enabled) void getManager().onLeagueChanged()
}
