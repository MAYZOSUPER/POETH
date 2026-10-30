import { shell, WebContentsView, type BaseWindow, type Rectangle } from 'electron'
import {
  isKnownTab,
  isTabUrl,
  isWebTab,
  SITE_VIEW_IDLE_MS,
  tabHome,
  viewsToClose,
  type SiteBookmark,
  type SitePageState,
  type SitesState,
  type SiteTabId
} from '@shared/sites'
import type { GameLang } from '@shared/types'
import { hardenSitesContents, sitesWebPreferences } from '../net/sitesContents'
import { clearSitesData } from '../net/session'
import { getSitesData, sitesDataNow, updateSitesData } from '../services/sitesStore'

// Вкладки сайтов трейд-окна (S43). Окно и вкладку «Трейд» ведёт tradeWindow.ts; здесь — вью сайтов реестра и
// закладок игрока: создаются лениво при первом открытии вкладки, живыми держим SITE_VIEWS_LIVE (последние
// открытые), неактивные дольше SITE_VIEW_IDLE_MS закрываются (адрес запоминается в памяти — вкладка откроется
// там же). Окно спрятано — активная вкладка тоже считается неактивной. Видна только вью активной вкладки.
// Каждая вью — sitesWebPreferences + hardenSitesContents (net/sitesContents.ts); в страницы сайтов ничего не
// вводим и не исполняем (сторож — tests/sites/siteTabsGuard.test.ts).

export interface SiteTabsHost {
  /** окно (null — ещё не создано или закрыто) */
  window(): BaseWindow | null
  /** окно сейчас поверх игры (Esc на сайте прячет окно) */
  overGame(): boolean
  hide(): void
  /** перейти во вкладку «Трейд» на этом поиске (ссылка с сайта по нажатию игрока) */
  openTrade(url: string): void
  /** язык клиента игры: домашняя страница poedb */
  gameLang(): GameLang
  /** что-то поменялось: разметка окна и состояние для сайдбара */
  changed(): void
}

interface Live {
  view: WebContentsView
  /** когда вкладку последний раз покинули (активная — когда её открыли) */
  lastActive: number
}

let host: SiteTabsHost | null = null
let enabled = false
let active: SiteTabId = 'trade'
let bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
const views = new Map<SiteTabId, Live>()
/** адрес закрытой вью (откроется там же) и адрес, ждущий «Понятно» в заметке о приватности */
const lastUrl = new Map<SiteTabId, string>()
const pendingUrl = new Map<SiteTabId, string>()
let hiddenAt: number | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(s: SitesState) => void>()
const blockedListeners = new Set<(info: { host: string; external: boolean }) => void>()
let published = ''

export function setSiteTabsHost(h: SiteTabsHost): void {
  host = h
}

/** Вкладки сайтов включены (PoE 1). Выключили — закрыть вью и вернуться на «Трейд». */
export function setSitesEnabled(on: boolean): void {
  enabled = on
  if (!on) {
    closeAll()
    active = 'trade'
  }
  // рельс появился или пропал — разметка окна другая
  host?.changed()
  void getSitesData().then(() => publish())
}

export function sitesEnabled(): boolean {
  return enabled
}

export function activeTab(): SiteTabId {
  return active
}

function bookmarks(): readonly SiteBookmark[] {
  return sitesDataNow().bookmarks
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function pageOf(v: WebContentsView | undefined): SitePageState | null {
  const wc = v?.webContents
  if (!wc || wc.isDestroyed()) return null
  const url = wc.getURL()
  return {
    url,
    host: hostOf(url),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward()
  }
}

export function getSitesState(): SitesState {
  const d = sitesDataNow()
  const web = isWebTab(active)
  return {
    on: enabled,
    active,
    lastSite: d.lastSite,
    bookmarks: d.bookmarks,
    noteSeen: d.noteSeen,
    needsNote: web && !d.noteSeen,
    page: web ? pageOf(views.get(active)?.view) : null,
    live: [...views.keys()]
  }
}

function publish(): void {
  const s = getSitesState()
  const key = JSON.stringify(s)
  if (key === published) return
  published = key
  for (const cb of listeners) cb(s)
}

export function onSitesState(cb: (s: SitesState) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Сайт попытался уйти со своих хостов (открыто в браузере или заблокировано). */
export function onSitesBlocked(cb: (info: { host: string; external: boolean }) => void): () => void {
  blockedListeners.add(cb)
  return () => blockedListeners.delete(cb)
}

// ---------------------------------------------------------------------------
// Вью
// ---------------------------------------------------------------------------

function createView(tab: SiteTabId): Live | null {
  const w = host?.window()
  if (!w || w.isDestroyed()) return null
  const view = new WebContentsView({ webPreferences: sitesWebPreferences() })
  view.setBackgroundColor('#0f0c0a')
  view.setVisible(false)
  hardenSitesContents(view.webContents, {
    tab,
    bookmarks,
    onRoute: (nav, url) => {
      if (nav.kind === 'trade') host?.openTrade(url)
      else void openTab(nav.tab, url)
    },
    onOpenHere: (url) => load(tab, url),
    onBlocked: (url, external) => {
      for (const cb of blockedListeners) cb({ host: hostOf(url), external })
    }
  })
  const wc = view.webContents
  const changed = (): void => {
    if (active === tab) publish()
  }
  wc.on('did-start-loading', changed)
  wc.on('did-stop-loading', changed)
  wc.on('did-navigate', changed)
  wc.on('did-navigate-in-page', changed)
  wc.on('page-title-updated', changed)
  wc.on('render-process-gone', () => closeView(tab))
  // поверх игры Esc на сайте прячет окно (как во вкладке «Трейд»): только чтение нажатия в нашем окне
  wc.on('before-input-event', (event, input) => {
    if (!host?.overGame() || input.type !== 'keyDown' || input.key !== 'Escape') return
    if (input.control || input.alt || input.shift || input.meta) return
    event.preventDefault()
    host.hide()
  })
  w.contentView.addChildView(view)
  view.setBounds(bounds)
  const live = { view, lastActive: Date.now() }
  views.set(tab, live)
  ensureIdleTimer()
  return live
}

function closeView(tab: SiteTabId): void {
  const live = views.get(tab)
  if (!live) return
  views.delete(tab)
  const wc = live.view.webContents
  if (!wc.isDestroyed()) {
    const url = wc.getURL()
    if (url && isTabUrl(tab, url, bookmarks())) lastUrl.set(tab, url)
    const w = host?.window()
    if (w && !w.isDestroyed()) w.contentView.removeChildView(live.view)
    wc.close()
  }
  if (!views.size && idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
  publish()
}

/** Окно закрывается совсем (смена вида «поверх игры»): закрыть вью, адреса запомнить. */
export function closeAll(): void {
  for (const tab of [...views.keys()]) closeView(tab)
}

function prune(): void {
  const now = Date.now()
  const shownTab = hiddenAt === null && isWebTab(active) ? active : null
  const list = [...views.entries()].map(([tab, l]) => ({
    tab,
    lastActive: tab === active && hiddenAt !== null ? hiddenAt : l.lastActive
  }))
  for (const tab of viewsToClose(list, shownTab, now)) closeView(tab)
}

function ensureIdleTimer(): void {
  if (idleTimer) return
  idleTimer = setInterval(prune, Math.min(60_000, SITE_VIEW_IDLE_MS))
  idleTimer.unref?.()
}

function load(tab: SiteTabId, url: string): void {
  const live = views.get(tab)
  if (!live || !isTabUrl(tab, url, bookmarks())) return
  void live.view.webContents.loadURL(url).catch(() => publish())
}

function showOnly(tab: SiteTabId | null): void {
  for (const [id, l] of views) l.view.setVisible(id === tab)
}

/** Разметка окна: место под сайт (правее рельса вкладок, ниже адресной строки). */
export function layoutSiteTabs(b: Rectangle): void {
  bounds = b
  for (const l of views.values()) l.view.setBounds(b)
}

/** Вью сайтов — снова поверх сайдбара (S58: шторку рельса закрыли, сайдбар опускается под сайты). */
export function raiseSiteTabViews(): void {
  const w = host?.window()
  if (!w || w.isDestroyed()) return
  for (const l of views.values()) w.contentView.addChildView(l.view)
}

/** Окно спрятано / показано (неактивные вью закрываются по таймеру, пока окна нет на экране). */
export function setSiteTabsShown(shown: boolean): void {
  hiddenAt = shown ? null : Date.now()
  if (shown) {
    const l = views.get(active)
    if (l) l.lastActive = Date.now()
    if (isWebTab(active) && !views.has(active)) void selectTab(active)
  }
}

/**
 * Открыть вкладку. Вкладка сайта: первый раз — заметка о приватности (адрес ждёт «Понятно»); дальше вью
 * создаётся при первом открытии и грузит url (только страница этого сайта), прошлый адрес или домашнюю.
 */
export async function selectTab(tab: SiteTabId, url?: string): Promise<boolean> {
  const d = await getSitesData()
  if (!enabled && tab !== 'trade') return false
  if (!isKnownTab(tab, d.bookmarks)) return false
  if (url !== undefined && !isTabUrl(tab, url, d.bookmarks)) url = undefined
  const prev = active
  if (prev !== tab) {
    const l = views.get(prev)
    if (l) l.lastActive = Date.now()
  }
  active = tab
  if (!isWebTab(tab)) {
    showOnly(null)
    host?.changed()
    publish()
    return true
  }
  if (d.lastSite !== tab) await updateSitesData((x) => ({ ...x, lastSite: tab }))
  if (!d.noteSeen) {
    if (url) pendingUrl.set(tab, url)
    showOnly(null)
    host?.changed()
    publish()
    return true
  }
  let live = views.get(tab)
  const fresh = !live
  if (!live) live = createView(tab) ?? undefined
  if (!live) return false
  live.lastActive = Date.now()
  const target = url ?? pendingUrl.get(tab) ?? (fresh ? (lastUrl.get(tab) ?? tabHome(tab, host?.gameLang() ?? 'en', d.bookmarks)) : null)
  pendingUrl.delete(tab)
  if (target) load(tab, target)
  showOnly(tab)
  host?.changed()
  live.view.webContents.focus()
  prune()
  publish()
  return true
}

/** Открыть сайт (ссылка с другого сайта, глубокая ссылка из окна цены или «Билда»). */
export function openTab(tab: SiteTabId, url?: string): Promise<boolean> {
  return selectTab(tab, url)
}

/** «Понятно» в заметке о приватности: больше не показывать и открыть вкладку. */
export async function ackSitesNote(): Promise<void> {
  await updateSitesData((d) => (d.noteSeen ? d : { ...d, noteSeen: true }))
  if (isWebTab(active)) await selectTab(active)
  else publish()
}

export function siteTabNav(action: 'back' | 'forward' | 'reload' | 'stop' | 'home'): void {
  const wc = views.get(active)?.view.webContents
  if (!wc || wc.isDestroyed()) return
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  if (action === 'reload') wc.reload()
  if (action === 'stop') wc.stop()
  if (action === 'home') {
    const home = tabHome(active, host?.gameLang() ?? 'en', bookmarks())
    if (home) load(active, home)
  }
}

/** Текущая страница вкладки сайта — в системный браузер (только её же хосты, https). */
export function openSiteTabInBrowser(): boolean {
  const url = views.get(active)?.view.webContents.getURL()
  if (!url || !isTabUrl(active, url, bookmarks())) return false
  void shell.openExternal(url)
  return true
}

/** «Очистить данные сайтов»: закрыть вью, стереть cookies и кэш сессии сайтов, открыть вкладку заново. */
export async function clearSiteTabsData(): Promise<void> {
  const reopen = isWebTab(active) && views.has(active)
  closeAll()
  lastUrl.clear()
  await clearSitesData()
  if (reopen) await selectTab(active)
  publish()
}

export async function addBookmark(b: SiteBookmark): Promise<void> {
  await updateSitesData((d) => ({ ...d, bookmarks: [...d.bookmarks, b] }))
  publish()
}

export async function removeBookmark(id: string): Promise<void> {
  const tab: SiteTabId = `bm:${id}`
  closeView(tab)
  lastUrl.delete(tab)
  pendingUrl.delete(tab)
  await updateSitesData((d) => ({
    ...d,
    bookmarks: d.bookmarks.filter((b) => b.id !== id),
    lastSite: d.lastSite === tab ? null : d.lastSite
  }))
  if (active === tab) await selectTab('manage')
  publish()
}

/** Вкладка, которую открывает хоткей «Сайты»: последняя вкладка сайта или первая из реестра. */
export async function lastSiteTab(): Promise<SiteTabId> {
  const d = await getSitesData()
  return d.lastSite && isKnownTab(d.lastSite, d.bookmarks) ? d.lastSite : 'ninja'
}

export function isSiteTabFocused(): boolean {
  const wc = views.get(active)?.view.webContents
  return !!wc && !wc.isDestroyed() && wc.isFocused()
}
