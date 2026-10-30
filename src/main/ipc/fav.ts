import { clipboard, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { gzipSync } from 'zlib'
import { IPC } from '@shared/ipc'
import type { GameDef, GameId } from '@shared/games'
import { isSiteExternalUrl } from '@shared/links'
import { isKnownTab, isWebTab, sitesOn, validateBookmark, type SitesTarget, type SiteTabId } from '@shared/sites'
import { resolveGameLang } from '@shared/gameLang'
import type {
  Settings,
  CurrentSearchResult,
  FavData,
  FavFolderInput,
  FavImportResult,
  FavLiveSnapshot,
  FavLiveState,
  FavSearch,
  FavSearchInput,
  TradeWindowTarget
} from '@shared/types'
import * as model from '@shared/favorites/model'
import { buildTradeUrl, parseTradeUrl } from '@shared/favorites/tradeUrl'
import { searchStateId, targetQuery } from '@shared/favorites/lot'
import { isTradeSlug } from '@shared/favorites/slug'
import { getFavorites, newFavId, onFavoritesChanged, updateFavorites } from '../services/favoritesStore'
import { getSettings, onSettingsChange } from '../services/settingsStore'
import { getSitesData, newBookmarkId } from '../services/sitesStore'
import * as tabs from '../windows/siteTabs'
import { getRunningGame } from '../gameContext'
import { getEffectiveLeague } from '../net/leagues'
import { onAuthStatus } from '../net/account'
import { siteLoginUrl } from '../net/siteContents'
import { isTrustedAppUrl } from '../net/guards'
import { onHotkeyAction } from '../hotkeys'
import * as tw from '../windows/tradeWindow'
import type { IpcDomain } from './types'
import { devEnv } from '../devEnv'
import { isAppPageUrl } from '../security'

// Домен «избранное и трейд-окно» (S5). Для других этапов (только main):
//   openTradeWindow({url} | {query} | {lot} | {slug, type}) [+ league?, game?] — S4 прайс-чек, S6 live
//                                 вместо openExternal; {lot, query?, url?} — «Открыть лот» (исходный поиск
//                                 query, суженный до продавца; не вышло — url);
//   addFavorite(input)            — кнопка «В избранное» из прайс-чека;
//   openTradeLogin()              — вход (S3: auth.login открывает трейд-окно на /login);
//   registerFavLiveAdapter(a)     — S6: live search поисков избранного (молния в сайдбаре).
// Каналы зовут только наши страницы (file:// сборки или dev-сервер); siteView без preload.

// ---------------------------------------------------------------------------
// Live search (адаптер S6)
// ---------------------------------------------------------------------------

export interface FavLiveTarget {
  favId: string
  title: string
  type: 'search' | 'exchange'
  slug: string
  league: string
  game: GameId
  notify: boolean
}

export type FavLiveResult = { ok: true } | { ok: false; reason: 'limit' | 'auth' | 'unsupported' | 'error' }

export interface FavLiveAdapter {
  /** включить/выключить live для поиска избранного */
  setLive(target: FavLiveTarget, enabled: boolean): Promise<FavLiveResult>
  /** поменять «уведомлять» без переподключения */
  setNotify(favId: string, notify: boolean): void
  /** состояние по favId (нет записи = 'off'), занято и лимит */
  snapshot(): { states: Record<string, FavLiveState>; used: number; max: number }
  /** подписка на изменения snapshot */
  onChange(cb: () => void): () => void
}

let liveAdapter: FavLiveAdapter | null = null
let liveUnsub: (() => void) | null = null

async function liveTarget(s: FavSearch): Promise<FavLiveTarget> {
  return {
    favId: s.id,
    title: s.title,
    type: s.type,
    slug: s.slug,
    league: s.league ?? (await currentLeague(s.game)),
    game: s.game,
    notify: s.live?.notify ?? true
  }
}

async function liveSnapshot(): Promise<FavLiveSnapshot> {
  if (!liveAdapter) {
    const max = (await getSettings()).live.maxSearches
    return { available: false, states: {}, used: 0, max }
  }
  return { available: true, ...liveAdapter.snapshot() }
}

/**
 * S6 подключает live search поисков избранного. При регистрации включённые поиски
 * («намерение» в FavSearch.live.enabled) передаются адаптеру. null — отключить.
 */
export function registerFavLiveAdapter(adapter: FavLiveAdapter | null): void {
  liveUnsub?.()
  liveUnsub = null
  liveAdapter = adapter
  if (adapter) {
    liveUnsub = adapter.onChange(() => void liveSnapshot().then((s) => broadcast(IPC.events.favLive, s)))
    void getFavorites().then(async (data) => {
      for (const s of data.searches) {
        if (s.live?.enabled && !s.archivedAt) await adapter.setLive(await liveTarget(s), true)
      }
    })
  }
  void liveSnapshot().then((s) => broadcast(IPC.events.favLive, s))
}

async function liveOff(searches: FavSearch[]): Promise<void> {
  if (!liveAdapter) return
  for (const s of searches) if (s.live?.enabled) await liveAdapter.setLive(await liveTarget(s), false)
}

// ---------------------------------------------------------------------------
// Адреса сайта и окно
// ---------------------------------------------------------------------------

async function currentLeague(game: GameId): Promise<string> {
  if (game === 'poe1') return getEffectiveLeague()
  return (await getSettings()).poe2.league
}

async function siteHost(): Promise<'www.pathofexile.com' | 'ru.pathofexile.com'> {
  return (await getSettings()).siteHost
}

async function defaultUrl(): Promise<string> {
  const game = getRunningGame()
  return buildTradeUrl(await siteHost(), game, 'search', await currentLeague(game))
}

async function searchUrl(s: FavSearch): Promise<string> {
  return buildTradeUrl(await siteHost(), s.game, s.type, s.league ?? (await currentLeague(s.game)), s.slug)
}

async function windowTitle(): Promise<string> {
  return (await getSettings()).uiLang === 'en' ? 'POETH — trade window' : 'POETH — трейд-окно'
}

async function resolveTarget(target: TradeWindowTarget): Promise<string | undefined> {
  const game = target.game === 'poe2' || target.game === 'poe1' ? target.game : getRunningGame()
  const type = target.type === 'exchange' ? 'exchange' : 'search'
  const league = typeof target.league === 'string' && target.league ? target.league : await currentLeague(game)
  // лот (или запрос) сайт выполнит сам: …/search/<лига>/<состояние>, состояние — сжатый запрос, как у сайта.
  // Не вышло (нет продавца, запрос слишком длинный) — адрес из url: у «Открыть лот» это исходный поиск.
  const state = searchStateId(targetQuery(target), (json) => gzipSync(json))
  if (state) return buildTradeUrl(await siteHost(), game, 'search', league, state)
  if (typeof target.url === 'string' && target.url) return target.url
  if (isTradeSlug(target.slug)) {
    return buildTradeUrl(await siteHost(), game, type, league, target.slug)
  }
  return undefined
}

/**
 * Показать трейд-окно; target — адрес сайта, запрос трейда, лот (продавец + предмет) или поиск
 * (slug + тип [+ лига, игра]). «Открыть лот»: сайт сразу показывает этот предмет — «Travel to
 * Hideout»/«Direct whisper» игрок жмёт сам на странице сайта (мы не кликаем и не шлём запросы).
 */
export async function openTradeWindow(target: TradeWindowTarget = {}): Promise<void> {
  const title = await windowTitle()
  tw.setTradeWindowTitle(title)
  await tw.showTradeWindow({ title, url: await resolveTarget(target), defaultUrl })
}

/**
 * Вкладка сайта (S43): окно на вкладке target.tab (по умолчанию — последней вкладке сайта), url — страница этого
 * сайта (глубокая ссылка из окна цены или «Билда»; чужой хост main не откроет — isTabUrl в siteTabs).
 */
export async function openSites(target: SitesTarget = {}): Promise<void> {
  if (!tabs.sitesEnabled()) return
  const d = await getSitesData()
  const tab = target.tab !== undefined && isKnownTab(target.tab, d.bookmarks) ? target.tab : await tabs.lastSiteTab()
  const title = await windowTitle()
  tw.setTradeWindowTitle(title)
  await tw.showTradeWindow({ title, defaultUrl, tab, siteUrl: typeof target.url === 'string' ? target.url : undefined })
}

/** Вход в аккаунт: трейд-окно на официальной странице /login. */
export async function openTradeLogin(): Promise<void> {
  await openTradeWindow({ url: siteLoginUrl(await siteHost()) })
}

/** «В избранное» (прайс-чек S4 и т.п.): в папку или «без папки». */
export async function addFavorite(input: FavSearchInput): Promise<FavSearch | null> {
  let saved: FavSearch | null = null
  await updateFavorites((d) => {
    const r = model.saveSearch(d, { ...input, game: input.game ?? getRunningGame() }, newFavId)
    saved = r.search
    return r.data
  })
  return saved
}

async function toggle(tab?: SiteTabId): Promise<void> {
  const title = await windowTitle()
  tw.setTradeWindowTitle(title)
  await tw.toggleTradeWindow({ title, defaultUrl, tab })
}

// ---------------------------------------------------------------------------
// События в наши страницы
// ---------------------------------------------------------------------------

function devServerUrl(): string | undefined {
  return devEnv('ELECTRON_RENDERER_URL')
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isAppPageUrl(wc.getURL())) continue
    wc.send(channel, payload)
  }
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('fav: untrusted IPC sender')
    return fn(...args)
  })
}

/** Какой поиск избранного открыт в siteView (по игре, типу и slug). */
function syncActive(data: FavData, url: string): void {
  const info = parseTradeUrl(url)
  const hit = info?.slug
    ? (data.searches.find((s) => !s.archivedAt && s.game === info.game && s.type === info.type && s.slug === info.slug) ??
      data.searches.find((s) => s.game === info.game && s.type === info.type && s.slug === info.slug))
    : undefined
  tw.setActiveSearch(hit?.id ?? null)
}

// ---------------------------------------------------------------------------
// Входные данные из renderer
// ---------------------------------------------------------------------------

const isGame = (v: unknown): v is GameId => v === 'poe1' || v === 'poe2'
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function toFolderInput(raw: unknown): FavFolderInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const title = str(r.title)
  if (!title) return null
  const input: FavFolderInput = { title, game: isGame(r.game) ? r.game : getRunningGame() }
  const id = str(r.id)
  if (id) input.id = id
  const icon = str(r.icon)
  if (icon !== undefined) input.icon = icon
  return input
}

function toSearchInput(raw: unknown): FavSearchInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const title = str(r.title)
  const slug = str(r.slug)
  if (!title || !slug) return null
  const input: FavSearchInput = { title, slug, type: r.type === 'exchange' ? 'exchange' : 'search' }
  if (isGame(r.game)) input.game = r.game
  for (const k of ['id', 'folderId', 'league', 'notes'] as const) {
    const v = str(r[k])
    if (v !== undefined) input[k] = v
  }
  return input
}

async function currentSearch(): Promise<CurrentSearchResult> {
  const url = tw.currentSiteUrl()
  if (!url) return { ok: false, reason: 'no-window' }
  const info = parseTradeUrl(url)
  if (!info) return { ok: false, reason: 'not-search' }
  if (!info.slug) return { ok: false, reason: 'no-slug' }
  const title = tw.getTradeSiteState().title.replace(/\s*[-–—|]\s*Path of Exile.*$/i, '').trim()
  return { ok: true, info, title, currentLeague: await currentLeague(info.game) }
}

async function importText(text: unknown): Promise<FavImportResult> {
  if (typeof text !== 'string') return { ok: false, folders: 0, searches: 0, invalid: 0 }
  let res = { folders: 0, searches: 0, invalid: 0 }
  await updateFavorites((d) => {
    const r = model.importBt(d, text, newFavId)
    res = { folders: r.folders, searches: r.searches, invalid: r.invalid }
    return r.folders ? r.data : d
  })
  return { ok: res.folders > 0 || (res.invalid === 0 && res.searches === 0), ...res }
}

// ---------------------------------------------------------------------------
// Регистрация
// ---------------------------------------------------------------------------

let wired = false

function wire(): void {
  if (wired) return
  wired = true
  onFavoritesChanged((d) => {
    broadcast(IPC.events.favChanged, d)
    syncActive(d, tw.currentSiteUrl() ?? '')
  })
  tw.onTradeSiteState((s) => broadcast(IPC.events.favSite, s))
  let lastUrl = ''
  tw.onTradeSiteState((s) => {
    if (s.url === lastUrl) return
    lastUrl = s.url
    void getFavorites().then((d) => syncActive(d, s.url))
  })
  tabs.onSitesState((s) => broadcast(IPC.events.favSites, s))
  tabs.onSitesBlocked((info) => broadcast(IPC.events.favSitesBlocked, info))
  // язык клиента игры — домашняя страница poedb (/ru/ или /us/)
  let gameLang = resolveGameLang(null, 'en').lang
  const syncLang = (s: Settings): void => {
    gameLang = resolveGameLang(s.gameLang, s.uiLang).lang
  }
  void getSettings().then(syncLang)
  onSettingsChange(syncLang)
  tw.setSiteGameLang(() => gameLang)
  tw.onTradeSiteBlocked((url) => {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      host = ''
    }
    broadcast(IPC.events.favBlocked, { host, external: isSiteExternalUrl(url) })
  })
  // вошли через страницу /login в трейд-окне — сразу на сайт трейда
  let wasIn = false
  onAuthStatus((s) => {
    const url = tw.currentSiteUrl() ?? ''
    if (s.loggedIn && !wasIn && /\/(login|my-account)(\/|$|\?)/.test(url)) void defaultUrl().then(tw.loadSite)
    wasIn = s.loggedIn
  })
}

function register(): void {
  wire()
  handle(IPC.fav.list, () => getFavorites())
  handle(IPC.fav.saveFolder, async (raw) => {
    const input = toFolderInput(raw)
    if (!input) return ''
    let id = ''
    await updateFavorites((d) => {
      const r = model.saveFolder(d, input, newFavId)
      id = r.id
      return r.data
    })
    return id
  })
  handle(IPC.fav.deleteFolder, async (id) => {
    if (typeof id !== 'string') return
    await liveOff((await getFavorites()).searches.filter((s) => s.folderId === id))
    await updateFavorites((d) => model.deleteFolder(d, id))
  })
  handle(IPC.fav.archiveFolder, async (id, archived) => {
    if (typeof id !== 'string') return
    if (archived) await liveOff((await getFavorites()).searches.filter((s) => s.folderId === id))
    await updateFavorites((d) => model.archiveFolder(d, id, archived === true))
  })
  handle(IPC.fav.reorderFolders, async (game, ids) => {
    if (!isGame(game) || !Array.isArray(ids)) return
    await updateFavorites((d) => model.reorderFolders(d, game, ids.filter((x): x is string => typeof x === 'string')))
  })
  handle(IPC.fav.saveSearch, async (raw) => {
    const input = toSearchInput(raw)
    return input ? addFavorite(input) : null
  })
  handle(IPC.fav.add, async (raw) => {
    const input = toSearchInput(raw)
    return input ? addFavorite(input) : null
  })
  handle(IPC.fav.deleteSearch, async (id) => {
    if (typeof id !== 'string') return
    await liveOff((await getFavorites()).searches.filter((s) => s.id === id))
    await updateFavorites((d) => model.deleteSearch(d, id))
  })
  handle(IPC.fav.archiveSearch, async (id, archived) => {
    if (typeof id !== 'string') return
    if (archived) await liveOff((await getFavorites()).searches.filter((s) => s.id === id))
    await updateFavorites((d) => model.archiveSearch(d, id, archived === true))
  })
  handle(IPC.fav.moveSearch, async (id, folderId, index) => {
    if (typeof id !== 'string' || typeof folderId !== 'string') return
    await updateFavorites((d) => model.moveSearch(d, id, folderId, typeof index === 'number' ? index : undefined))
  })
  handle(IPC.fav.open, async (id) => {
    const s = (await getFavorites()).searches.find((x) => x.id === id)
    if (s) await openTradeWindow({ url: await searchUrl(s) })
  })
  handle(IPC.fav.current, () => currentSearch())
  handle(IPC.fav.importBt, (text) => importText(text))
  handle(IPC.fav.exportBt, async (folderId, game) => {
    const d = await getFavorites()
    if (typeof folderId === 'string') return model.exportFolderBt(d, folderId) ?? ''
    return model.exportAllBt(d, isGame(game) ? game : getRunningGame())
  })
  handle(IPC.fav.setLive, async (id, enabled) => {
    const s = (await getFavorites()).searches.find((x) => x.id === id)
    if (!s || typeof id !== 'string') return { ok: false, reason: 'error' }
    if (!liveAdapter) return { ok: false, reason: 'unsupported' }
    const on = enabled === true
    const res = await liveAdapter.setLive(await liveTarget(s), on)
    if (!res.ok) return res
    await updateFavorites((d) => model.setLiveFlags(d, id, { enabled: on }))
    return res
  })
  handle(IPC.fav.setNotify, async (id, notify) => {
    if (typeof id !== 'string') return
    await updateFavorites((d) => model.setLiveFlags(d, id, { notify: notify !== false }))
    liveAdapter?.setNotify(id, notify !== false)
  })
  handle(IPC.fav.live, () => liveSnapshot())
  handle(IPC.fav.copy, (text) => {
    if (typeof text === 'string') clipboard.writeText(text)
  })

  handle(IPC.tradeWindow.open, (target) =>
    openTradeWindow(typeof target === 'object' && target !== null ? (target as TradeWindowTarget) : {})
  )
  handle(IPC.tradeWindow.toggle, () => toggle())
  handle(IPC.tradeWindow.hide, () => tw.hideTradeWindow())
  handle(IPC.tradeWindow.nav, async (action) => {
    if (action !== 'home' && action !== 'back' && action !== 'forward' && action !== 'reload' && action !== 'stop') return
    if (isWebTab(tabs.activeTab())) tabs.siteTabNav(action)
    else if (action === 'home') tw.loadSite(await defaultUrl())
    else tw.siteNav(action)
  })
  handle(IPC.tradeWindow.setPinned, (pinned) => tw.setTradeWindowPinned(pinned === true))
  handle(IPC.tradeWindow.setSidebar, (collapsed) => tw.setTradeSidebarCollapsed(collapsed === true))
  handle(IPC.tradeWindow.state, () => tw.getTradeSiteState())
  handle(IPC.tradeWindow.openInBrowser, () => (isWebTab(tabs.activeTab()) ? tabs.openSiteTabInBrowser() : tw.openSiteInBrowser()))

  handle(IPC.sites.state, () => tabs.getSitesState())
  handle(IPC.sites.select, async (tab) => {
    if (tab === 'trade') await tw.openTradeTab()
    else if (typeof tab === 'string') await tabs.selectTab(tab as SiteTabId)
  })
  handle(IPC.sites.open, (target) => openSites(typeof target === 'object' && target !== null ? (target as SitesTarget) : {}))
  handle(IPC.sites.ackNote, () => tabs.ackSitesNote())
  handle(IPC.sites.addBookmark, async (raw) => {
    const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const v = validateBookmark({ title: input.title, url: input.url }, (await getSitesData()).bookmarks, newBookmarkId)
    if (!v.ok) return v
    await tabs.addBookmark(v.bookmark)
    const tab: SiteTabId = `bm:${v.bookmark.id}`
    await tabs.selectTab(tab)
    return { ok: true, tab }
  })
  handle(IPC.sites.removeBookmark, (id) => (typeof id === 'string' ? tabs.removeBookmark(id) : undefined))
  handle(IPC.sites.clearData, () => tabs.clearSiteTabsData())
}

function setupForGame(def: GameDef): void {
  // трейд-окно есть у обеих игр (PoE2 — сайт trade2); Ctrl+Shift+T, область always
  onHotkeyAction('toggleTradeWindow', () => toggle())
  // вкладки сайтов (S43) — у PoE 1; хоткей «Сайты» — последняя вкладка сайта
  tabs.setSitesEnabled(sitesOn(def.id))
  if (sitesOn(def.id)) onHotkeyAction('toggleSites', () => void tabs.lastSiteTab().then((tab) => toggle(tab)))
}

export const favDomain: IpcDomain = { register, setupForGame }
