import { app, BaseWindow, globalShortcut, screen, shell, WebContentsView, type Rectangle } from 'electron'
import path from 'path'
import type { GameLang, TradeSiteState } from '@shared/types'
import type { SiteTabId } from '@shared/sites'
import { isAllowedExternalUrl } from '@shared/links'
import { hardenSiteContents, siteWebPreferences } from '../net/siteContents'
import { isSitePageUrl } from '../net/guards'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { isGameFocused, onGameFocusChange } from '../focus/gameFocus'
import { ensureGameForeground, getOverlayStatus } from './gameOverlay'
import { loadRendererPage } from './rendererPage'
import { boundsOverGame, gameSizeOf, TRADE_MIN_SIZE as MIN_SIZE, type GameSize } from './tradeBounds'
import { windowIcon } from '../appIcon'
import { devEnv } from '../devEnv'
import {
  activeTab,
  closeAll as closeSiteTabs,
  isSiteTabFocused,
  layoutSiteTabs,
  selectTab,
  setSiteTabsHost,
  setSiteTabsShown,
  sitesEnabled
} from './siteTabs'

// Трейд-окно (S5): слева наш сайдбар (trade-sidebar.html, preload), справа официальный сайт
// трейда как есть (siteView: без preload, sandbox, сессия аккаунта persist:poe-account,
// навигация только внутри pathofexile.com — см. net/siteContents.ts). Сайдбар занимает всё
// окно, siteView лежит поверх него правее колонки избранного и ниже адресной строки (её рисует
// сайдбар); колонку избранного можно свернуть.
// Два вида:
//  - игра запущена (оверлей S1 прицеплен) — «поверх игры», по образцу встроенного браузера
//    PoE Overlay Community Fork (MIT, (c) 2020 Nicklas Ronge; v0.9.0, код не переносился):
//      · размер и положение — browser.service.ts open(): по центру, min(h·1.3, w·0.7) × 0.7·h,
//        только от клиентской области игры (windows/tradeBounds.ts); растянул — запоминаем долю;
//      · Esc закрывает окно и тогда, когда фокус уже у игры — как глобальный 'escape' из
//        dialog/dialog-ref.service.ts (VisibleFlag.Browser): пока окно над игрой и игра в фокусе,
//        Esc занят нами (syncEsc); в самом окне Esc ловят сайт (before-input-event) и сайдбар;
//      · закрытие возвращает фокус игре (у них — moveTop оверлея; у нас ensureGameForeground →
//        focusTarget S1); хоткей при открытом окне прячет его;
//      · своё: без системной рамки (у них рамка), шапка — адресная строка сайдбара
//        (перетаскивание, ×), окно над игрой, пока игра или окно в фокусе;
//  - игры нет — обычное окно с рамкой: размер, позиция и «поверх игры» запоминаются.
// Всё это — в %APPDATA%/POETH/trade-window.json. Вид меняется при следующем показе окна
// (рамку у готового окна не переключить — окно создаётся заново на той же странице сайта).
// ПРАВИЛО (docs/PLAN-POETH.md, риск бана): «Travel to Hideout» и «Direct whisper» — только родные
// кнопки сайта, которые жмёт игрок. В siteView никаких executeJavaScript, инъекций, программных кликов
// (sendInputEvent) и своих запросов к эндпоинтам телепорта/whisper. Сторож — tests/fav/siteGuard.test.ts.
// Вкладки сайтов (S43): у PoE 1 слева — рельс вкладок (RAIL_WIDTH, рисует сайдбар). «Трейд» — siteView этого
// файла; poe.ninja, poedb и др. — вью windows/siteTabs.ts на отдельной сессии сайтов, видна только активная.
// Колонка избранного — только у вкладки «Трейд».

/** ширина колонки избранного и высота адресной строки — те же числа в trade-sidebar.css */
export const SIDEBAR_WIDTH = 300
export const BAR_HEIGHT = 40
/** рельс вкладок сайтов (S43) — то же число в trade-sidebar.css */
export const RAIL_WIDTH = 48

const DEFAULT_BOUNDS = { width: 1280, height: 820 }
const SAVE_DELAY_MS = 600

interface WindowState {
  bounds?: Rectangle
  maximized?: boolean
  pinned?: boolean
  /** «поверх игры»: размер окна — доля клиентской области игры (0.4…1) */
  gameSize?: GameSize
  /** колонка избранного свёрнута */
  sidebarCollapsed?: boolean
}

let win: BaseWindow | null = null
let sidebar: WebContentsView | null = null
let site: WebContentsView | null = null
/** текущее окно открыто «поверх игры» (без рамки, в границах игры) */
let overGame = false
let state: WindowState = {}
let stateLoaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let quitting = false
let hooked = false
/** глобальный Esc занят нами (окно над игрой, фокус у игры) */
let escHeld = false
let siteState: TradeSiteState = {
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  pinned: false,
  activeSearchId: null,
  overGame: false,
  sidebarCollapsed: false
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

/**
 * Клиентская область окна игры в координатах Electron (DIP), если оверлей S1 к игре
 * прицеплен; иначе null — окно открывается обычным. Оверлей отдаёт физические пиксели.
 */
function gameArea(): Rectangle | null {
  const s = getOverlayStatus()
  const b = s.bounds
  if (!s.tracking || !s.attached || !b || b.width < 320 || b.height < 240) return null
  const r = process.platform === 'win32' ? screen.screenToDipRect(null, b) : b
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    // поверх игры границы не пишем: позиция — всегда по центру, доля — по 'resized' (create)
    if (win && !win.isDestroyed() && !overGame) {
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

function railWidth(): number {
  return sitesEnabled() ? RAIL_WIDTH : 0
}

function sideWidth(): number {
  return railWidth() + (state.sidebarCollapsed ? 0 : SIDEBAR_WIDTH)
}

function layout(): void {
  if (!win || win.isDestroyed() || !sidebar || !site) return
  const { width, height } = win.getContentBounds()
  const side = sideWidth()
  const rail = railWidth()
  sidebar.setBounds({ x: 0, y: 0, width, height })
  site.setBounds({
    x: side,
    y: BAR_HEIGHT,
    width: Math.max(0, width - side),
    height: Math.max(0, height - BAR_HEIGHT)
  })
  site.setVisible(activeTab() === 'trade')
  layoutSiteTabs({ x: rail, y: BAR_HEIGHT, width: Math.max(0, width - rail), height: Math.max(0, height - BAR_HEIGHT) })
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
    overGame,
    sidebarCollapsed: !!state.sidebarCollapsed,
    ...patch
  }
  if (JSON.stringify(next) === JSON.stringify(siteState)) return
  siteState = next
  for (const cb of siteListeners) cb(next)
}

/**
 * Esc, когда фокус у игры, а трейд-окно висит над ней (как глобальный 'escape' у PoE Overlay,
 * dialog-ref.service.ts): прячет окно. Занимаем Esc только на это время; в самом окне Esc ловят
 * сайт и сайдбар. Если хоткеи перерегистрировались (unregisterAll в hotkeys.ts) — занимаем снова.
 */
function syncEsc(): void {
  const w = win
  const want = !!w && !w.isDestroyed() && overGame && w.isVisible() && !w.isFocused() && isGameFocused()
  if (want) {
    if (escHeld && globalShortcut.isRegistered('Escape')) return
    escHeld = globalShortcut.register('Escape', () => hideTradeWindow())
  } else if (escHeld) {
    escHeld = false
    globalShortcut.unregister('Escape')
  }
}

/** Держать окно над игрой: закреплено, поверх игры или сейчас в фокусе. */
function keepOnTop(w: BaseWindow): void {
  w.setAlwaysOnTop(true, 'screen-saver')
  w.moveTop()
}

/** Адрес сайта трейда по умолчанию (из последнего показа окна) — для вкладки «Трейд», открытой из рельса. */
let tradeDefaultUrl: (() => Promise<string>) | null = null
/** язык клиента игры (домашняя страница poedb) — задаёт домен fav по настройкам */
let gameLangOf: () => GameLang = () => 'en'

export function setSiteGameLang(fn: () => GameLang): void {
  gameLangOf = fn
}

function hookOnce(): void {
  if (hooked) return
  hooked = true
  setSiteTabsHost({
    window: () => win,
    overGame: () => overGame,
    hide: () => hideTradeWindow(),
    openTrade: (url) => void openTradeTab(url),
    gameLang: () => gameLangOf(),
    changed: () => {
      layout()
      publishSite()
    }
  })
  app.on('before-quit', () => {
    quitting = true
  })
  // поверх игры: окно висит над игрой, пока игра (или само окно) в фокусе; ушли из игры
  // на рабочий стол/в другое приложение — опускается, чтобы не закрывать чужие окна
  onGameFocusChange((next) => {
    syncEsc()
    const w = win
    if (!w || w.isDestroyed() || !overGame || !w.isVisible() || state.pinned) return
    if (next.game) keepOnTop(w)
    else if (!w.isFocused()) w.setAlwaysOnTop(false)
  })
}

async function create(title: string, area: Rectangle | null): Promise<BaseWindow> {
  await loadState()
  hookOnce()
  overGame = !!area
  const w = new BaseWindow({
    title,
    icon: windowIcon(),
    ...(area ? boundsOverGame(area, state.gameSize) : restoredBounds()),
    minWidth: area ? Math.min(MIN_SIZE.width, area.width) : MIN_SIZE.width,
    minHeight: area ? Math.min(MIN_SIZE.height, area.height) : MIN_SIZE.height,
    show: false,
    // поверх игры — без системной рамки (шапка — адресная строка сайдбара); края тянутся
    frame: !area,
    autoHideMenuBar: true,
    backgroundColor: '#0f0c0a'
  })
  w.setMenu(null)
  if (!area && state.maximized) w.maximize()
  if (area || state.pinned) w.setAlwaysOnTop(true, 'screen-saver')

  const side = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
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
  // Поверх игры Esc на сайте прячет окно (как Esc у браузера PoE Overlay). Только чтение
  // нажатия в нашем окне: в страницу ничего не вводим и не исполняем. В сайдбаре Esc
  // ловит сама страница сайдбара (меню и переименование закрываются первыми).
  swc.on('before-input-event', (event, input) => {
    if (!overGame || input.type !== 'keyDown' || input.key !== 'Escape') return
    if (input.control || input.alt || input.shift || input.meta) return
    event.preventDefault()
    hideTradeWindow()
  })
  if (devEnv('OVERLAY_DEVTOOLS') === '1') side.webContents.openDevTools({ mode: 'detach' })

  w.on('resize', () => {
    layout()
    if (!overGame) scheduleSave()
  })
  // поверх игры: игрок растянул окно сам ('resized' — только ручной ресайз, не setBounds) —
  // запоминаем долю окна игры; иначе размер как у PoE Overlay
  w.on('resized', () => {
    const area = overGame ? gameArea() : null
    if (!area || w.isDestroyed()) return
    state.gameSize = gameSizeOf(w.getBounds(), area)
    scheduleSave()
  })
  w.on('move', () => {
    if (!overGame) scheduleSave()
  })
  // Компаньон висит на уровне screen-saver и закрыл бы трейд-окно. Пока окно в фокусе — оно
  // поднимается на тот же уровень; ушёл фокус (игра, компаньон) — опускается, если не закреплено
  // и не открыто поверх игры (тогда его опускает только уход из игры, см. hookOnce).
  w.on('focus', () => {
    syncEsc()
    if (state.pinned || w.isDestroyed()) return
    keepOnTop(w)
  })
  w.on('blur', () => {
    syncEsc()
    if (!state.pinned && !overGame && !w.isDestroyed()) w.setAlwaysOnTop(false)
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

/** Закрыть окно совсем (смена вида); вернуть адрес сайта, чтобы открыть его в новом окне. */
function destroyWindow(): string {
  const w = win
  const views = [sidebar, site]
  const url = site?.webContents.getURL() ?? ''
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    void writeJsonAtomic(stateFile(), state).catch(() => undefined)
  }
  closeSiteTabs()
  win = null
  sidebar = null
  site = null
  if (w && !w.isDestroyed()) w.destroy()
  syncEsc()
  // webContents вью BaseWindow сами не закрываются
  for (const v of views) if (v && !v.webContents.isDestroyed()) v.webContents.close()
  return url
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

export interface ShowTradeOptions {
  title: string
  /** страница сайта трейда (вкладка «Трейд») */
  url?: string
  defaultUrl: () => Promise<string>
  /** вкладка (S43); по умолчанию — «Трейд» */
  tab?: SiteTabId
  /** страница сайта этой вкладки (глубокая ссылка) */
  siteUrl?: string
}

/**
 * Показать окно (создать при первом вызове); url — открыть эту страницу сайта.
 * Игра запущена — поверх неё, по центру и в её границах; нет — обычное окно.
 * S43: tab — вкладка сайта (siteUrl — её страница); сайт трейда тогда грузится, только когда откроют «Трейд».
 */
export async function showTradeWindow(opts: ShowTradeOptions): Promise<void> {
  const area = gameArea()
  let keepUrl = ''
  tradeDefaultUrl = opts.defaultUrl
  if (win && !win.isDestroyed() && overGame !== !!area) keepUrl = destroyWindow()
  const w = win && !win.isDestroyed() ? win : await create(opts.title, area)
  const wc = site!.webContents
  const tab = opts.tab && sitesEnabled() ? opts.tab : 'trade'
  if (tab === 'trade') {
    if (activeTab() !== 'trade') await selectTab('trade')
    if (opts.url) loadSite(opts.url)
    else if (!wc.getURL()) loadSite(keepUrl && isSitePageUrl(keepUrl) ? keepUrl : await opts.defaultUrl())
  } else {
    if (keepUrl && isSitePageUrl(keepUrl) && !wc.getURL()) loadSite(keepUrl)
    await selectTab(tab, opts.siteUrl)
  }
  if (overGame && area) {
    // игру могли подвинуть или поменять ей размер — снова по центру
    w.setBounds(boundsOverGame(area, state.gameSize))
    keepOnTop(w)
  }
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  setSiteTabsShown(true)
  publishSite()
}

/** Вкладка «Трейд» из рельса или по ссылке с сайта (поиск трейда): сайт трейда, при первом открытии — по умолчанию. */
export async function openTradeTab(url?: string): Promise<void> {
  await selectTab('trade')
  const wc = site?.webContents
  if (!wc || wc.isDestroyed()) return
  if (url) loadSite(url)
  else if (!wc.getURL() && tradeDefaultUrl) loadSite(await tradeDefaultUrl())
  wc.focus()
}

/** Спрятать окно; если игра запущена — вернуть ей фокус. */
export function hideTradeWindow(): void {
  if (!win || win.isDestroyed()) return
  scheduleSave()
  win.hide()
  setSiteTabsShown(false)
  syncEsc()
  try {
    ensureGameForeground()
  } catch {
    // нет игры/оверлея — фокус останется у системы
  }
}

/**
 * Хоткей: скрыто → показать; видно поверх игры → спрятать (фокус — игре); обычное окно:
 * видно, но не в фокусе → на передний план, в фокусе → спрятать. S43: окно видно на вкладке другого вида —
 * переключить (Ctrl+Shift+T — на «Трейд», «Сайты» — на последнюю вкладку сайта).
 */
export async function toggleTradeWindow(opts: { title: string; defaultUrl: () => Promise<string>; tab?: SiteTabId }): Promise<void> {
  const tab = opts.tab && sitesEnabled() ? opts.tab : 'trade'
  const onTab = tab === 'trade' ? activeTab() === 'trade' : activeTab() !== 'trade'
  if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && overGame === !!gameArea()) {
    if (!onTab) {
      await showTradeWindow({ ...opts, tab })
      return
    }
    if (overGame || win.isFocused() || sidebar?.webContents.isFocused() || site?.webContents.isFocused() || isSiteTabFocused()) {
      hideTradeWindow()
      return
    }
    win.focus()
    return
  }
  await showTradeWindow({ ...opts, tab })
}

/** Открыть страницу сайта в siteView (только pathofexile.com / проверка Cloudflare). */
export function loadSite(url: string): boolean {
  if (!site || !isSitePageUrl(url)) return false
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
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(pinned || overGame, 'screen-saver')
  scheduleSave()
  publishSite()
}

/** Свернуть/развернуть колонку избранного (сайт занимает освободившееся место). */
export function setTradeSidebarCollapsed(collapsed: boolean): void {
  state = { ...state, sidebarCollapsed: collapsed }
  layout()
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
  return { ...siteState, pinned: !!state.pinned, overGame, sidebarCollapsed: !!state.sidebarCollapsed }
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
