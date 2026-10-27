import { app, BaseWindow, screen, shell, WebContentsView, type Rectangle } from 'electron'
import path from 'path'
import type { TradeSiteState } from '@shared/types'
import { isAllowedExternalUrl } from '@shared/links'
import { hardenSiteContents, siteWebPreferences } from '../net/siteContents'
import { isSiteNavigationAllowed } from '../net/guards'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { ensureGameForeground } from './gameOverlay'
import { loadRendererPage } from './rendererPage'

// Трейд-окно (S5): обычное окно с рамкой, слева наш сайдбар (trade-sidebar.html, preload),
// справа официальный сайт трейда как есть (siteView: без preload, sandbox, сессия аккаунта
// persist:poe-account, навигация только внутри pathofexile.com — см. net/siteContents.ts).
// Сайдбар занимает всё окно, siteView лежит поверх него правее колонки избранного и ниже
// адресной строки (её рисует сайдбар). Закрытие крестиком прячет окно; размер, позиция и
// «поверх игры» запоминаются в %APPDATA%/POETH/trade-window.json.

/** ширина колонки избранного и высота адресной строки — те же числа в trade-sidebar.css */
export const SIDEBAR_WIDTH = 300
export const BAR_HEIGHT = 40

const DEFAULT_BOUNDS = { width: 1280, height: 820 }
const MIN_SIZE = { width: 900, height: 560 }
const SAVE_DELAY_MS = 600

interface WindowState {
  bounds?: Rectangle
  maximized?: boolean
  pinned?: boolean
}

let win: BaseWindow | null = null
let sidebar: WebContentsView | null = null
let site: WebContentsView | null = null
let state: WindowState = {}
let stateLoaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let quitting = false
let quitHooked = false
let siteState: TradeSiteState = {
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  pinned: false,
  activeSearchId: null
}
const siteListeners = new Set<(s: TradeSiteState) => void>()
const blockedListeners = new Set<(url: string) => void>()

function stateFile(): string {
  return path.join(app.getPath('userData'), 'trade-window.json')
}

async function loadState(): Promise<void> {
  if (stateLoaded) return
  stateLoaded = true
  const raw = await readJson<WindowState | null>(stateFile(), null)
  if (raw && typeof raw === 'object') state = raw
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (win && !win.isDestroyed()) {
      state = { ...state, maximized: win.isMaximized() }
      if (!win.isMaximized() && !win.isMinimized()) state.bounds = win.getBounds()
    }
    void writeJsonAtomic(stateFile(), state).catch(() => undefined)
  }, SAVE_DELAY_MS)
}

/** Сохранённые границы, если окно ими хоть частично попадает на какой-то монитор. */
function restoredBounds(): Partial<Rectangle> {
  const b = state.bounds
  if (!b || b.width < MIN_SIZE.width || b.height < MIN_SIZE.height) return DEFAULT_BOUNDS
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 20 && b.y < a.y + a.height - 60
  })
  return visible ? b : { width: b.width, height: b.height }
}

function layout(): void {
  if (!win || win.isDestroyed() || !sidebar || !site) return
  const { width, height } = win.getContentBounds()
  sidebar.setBounds({ x: 0, y: 0, width, height })
  site.setBounds({
    x: SIDEBAR_WIDTH,
    y: BAR_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height: Math.max(0, height - BAR_HEIGHT)
  })
}

function publishSite(patch: Partial<TradeSiteState> = {}): void {
  const wc = site?.webContents
  const next: TradeSiteState = {
    ...siteState,
    ...(wc && !wc.isDestroyed()
      ? {
          url: wc.getURL(),
          title: wc.getTitle(),
          loading: wc.isLoading(),
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward()
        }
      : {}),
    pinned: !!state.pinned,
    ...patch
  }
  if (JSON.stringify(next) === JSON.stringify(siteState)) return
  siteState = next
  for (const cb of siteListeners) cb(next)
}

function hookQuit(): void {
  if (quitHooked) return
  quitHooked = true
  app.on('before-quit', () => {
    quitting = true
  })
}

async function create(title: string): Promise<BaseWindow> {
  await loadState()
  hookQuit()
  const w = new BaseWindow({
    title,
    ...restoredBounds(),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0c0a'
  })
  w.setMenu(null)
  if (state.maximized) w.maximize()
  if (state.pinned) w.setAlwaysOnTop(true, 'screen-saver')

  const side = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  const siteView = new WebContentsView({ webPreferences: siteWebPreferences() })
  siteView.setBackgroundColor('#0f0c0a')
  w.contentView.addChildView(side)
  w.contentView.addChildView(siteView)

  hardenSiteContents(siteView.webContents, {
    onBlockedNavigation: (url) => {
      for (const cb of blockedListeners) cb(url)
    }
  })
  const swc = siteView.webContents
  swc.on('did-start-loading', () => publishSite())
  swc.on('did-stop-loading', () => publishSite())
  swc.on('did-navigate', () => publishSite())
  swc.on('did-navigate-in-page', () => publishSite())
  swc.on('page-title-updated', () => publishSite())
  swc.on('render-process-gone', () => publishSite({ loading: false }))
  if (process.env.OVERLAY_DEVTOOLS === '1') side.webContents.openDevTools({ mode: 'detach' })

  w.on('resize', () => {
    layout()
    scheduleSave()
  })
  w.on('move', scheduleSave)
  // Компаньон висит на уровне screen-saver и закрыл бы трейд-окно. Пока окно в фокусе — оно
  // поднимается на тот же уровень; ушёл фокус (игра, компаньон) — опускается, если не закреплено.
  w.on('focus', () => {
    if (state.pinned || w.isDestroyed()) return
    w.setAlwaysOnTop(true, 'screen-saver')
    w.moveTop()
  })
  w.on('blur', () => {
    if (!state.pinned && !w.isDestroyed()) w.setAlwaysOnTop(false)
  })
  w.on('maximize', layout)
  w.on('unmaximize', layout)
  w.on('restore', layout)
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    hideTradeWindow()
  })
  w.on('closed', () => {
    if (win === w) {
      win = null
      sidebar = null
      site = null
    }
  })

  win = w
  sidebar = side
  site = siteView
  layout()
  loadRendererPage(side, 'trade-sidebar')
  return w
}

// ---------------------------------------------------------------------------
// Публичный API окна (домен fav: src/main/ipc/fav.ts)
// ---------------------------------------------------------------------------

export function isTradeWindowOpen(): boolean {
  return !!win && !win.isDestroyed()
}

export function isTradeWindowVisible(): boolean {
  return isTradeWindowOpen() && win!.isVisible()
}

/** Показать окно (создать при первом вызове); url — открыть эту страницу сайта. */
export async function showTradeWindow(opts: { title: string; url?: string; defaultUrl: () => Promise<string> }): Promise<void> {
  const w = win && !win.isDestroyed() ? win : await create(opts.title)
  const wc = site!.webContents
  if (opts.url) loadSite(opts.url)
  else if (!wc.getURL()) loadSite(await opts.defaultUrl())
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

/** Спрятать окно; если игра запущена — вернуть ей фокус. */
export function hideTradeWindow(): void {
  if (!win || win.isDestroyed()) return
  scheduleSave()
  win.hide()
  try {
    ensureGameForeground()
  } catch {
    // нет игры/оверлея — фокус останется у системы
  }
}

/** Хоткей: скрыто → показать; видно, но не в фокусе → на передний план; в фокусе → спрятать. */
export async function toggleTradeWindow(opts: { title: string; defaultUrl: () => Promise<string> }): Promise<void> {
  if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
    if (win.isFocused() || sidebar?.webContents.isFocused() || site?.webContents.isFocused()) {
      hideTradeWindow()
      return
    }
    win.focus()
    return
  }
  await showTradeWindow(opts)
}

/** Открыть страницу сайта в siteView (только pathofexile.com / проверка Cloudflare). */
export function loadSite(url: string): boolean {
  if (!site || !isSiteNavigationAllowed(url)) return false
  void site.webContents.loadURL(url).catch(() => publishSite({ loading: false }))
  return true
}

export function siteNav(action: 'back' | 'forward' | 'reload' | 'stop'): void {
  const wc = site?.webContents
  if (!wc || wc.isDestroyed()) return
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  if (action === 'reload') wc.reload()
  if (action === 'stop') wc.stop()
}

/** Текущая страница сайта — в системный браузер (только allowlist @shared/links). */
export function openSiteInBrowser(): boolean {
  const url = site?.webContents.getURL()
  if (!url || !isAllowedExternalUrl(url)) return false
  void shell.openExternal(url)
  return true
}

export function setTradeWindowPinned(pinned: boolean): void {
  state = { ...state, pinned }
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(pinned, 'screen-saver')
  scheduleSave()
  publishSite()
}

export function setTradeWindowTitle(title: string): void {
  if (win && !win.isDestroyed()) win.setTitle(title)
}

export function currentSiteUrl(): string | null {
  const url = site?.webContents.getURL()
  return url || null
}

export function getTradeSiteState(): TradeSiteState {
  return { ...siteState, pinned: !!state.pinned }
}

export function setActiveSearch(id: string | null): void {
  publishSite({ activeSearchId: id })
}

export function onTradeSiteState(cb: (s: TradeSiteState) => void): () => void {
  siteListeners.add(cb)
  return () => siteListeners.delete(cb)
}

/** Сайт попытался уйти с pathofexile.com (открыто в браузере или заблокировано). */
export function onTradeSiteBlocked(cb: (url: string) => void): () => void {
  blockedListeners.add(cb)
  return () => blockedListeners.delete(cb)
}
