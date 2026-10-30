import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Трейд-окно (S58) на подставном electron: окно без системной рамки в обоих видах, своя шапка обычного окна
// (свернуть, развернуть), выбор «рельс развёрнут / свёрнут» запоминается в trade-window.json и переживает
// перезапуск, разметка вью сайта следует за рельсом, шторка поднимает сайдбар над сайтами, каналы окна принимаются
// только от главного кадра сайдбара этого окна.

type Rect = { x: number; y: number; width: number; height: number }
type Handler = (...args: unknown[]) => void

const files = new Map<string, unknown>()
const windows: FakeWindow[] = []
const raised = { tabs: 0 }
let overlay: { tracking: boolean; attached: boolean; bounds: Rect | null } = { tracking: false, attached: false, bounds: null }
let tabsBounds: Rect | null = null

let nextProcess = 100

class FakeContents {
  mainFrame = { processId: nextProcess++, routingId: 1 }
  url = ''
  on(): this {
    return this
  }
  isDestroyed(): boolean {
    return false
  }
  getURL(): string {
    return this.url
  }
  getTitle(): string {
    return ''
  }
  isLoading(): boolean {
    return false
  }
  navigationHistory = { canGoBack: () => false, canGoForward: () => false }
  async loadURL(url: string): Promise<void> {
    this.url = url
  }
  focus(): void {}
  isFocused(): boolean {
    return false
  }
  close(): void {}
  openDevTools(): void {}
}

class FakeView {
  webContents = new FakeContents()
  bounds: Rect | null = null
  visible = true
  setBounds(b: Rect): void {
    this.bounds = b
  }
  setVisible(v: boolean): void {
    this.visible = v
  }
  setBackgroundColor(): void {}
}

class FakeWindow {
  opts: Record<string, unknown>
  bounds: Rect
  maximized = false
  minimized = false
  destroyed = false
  handlers = new Map<string, Handler[]>()
  children: FakeView[] = []
  contentView = {
    addChildView: (v: FakeView): void => {
      this.children = [...this.children.filter((c) => c !== v), v]
    },
    removeChildView: (v: FakeView): void => {
      this.children = this.children.filter((c) => c !== v)
    }
  }
  constructor(opts: Record<string, unknown>) {
    this.opts = opts
    this.bounds = {
      x: (opts.x as number) ?? 100,
      y: (opts.y as number) ?? 100,
      width: (opts.width as number) ?? 1280,
      height: (opts.height as number) ?? 820
    }
    windows.push(this)
  }
  on(ev: string, cb: Handler): this {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), cb])
    return this
  }
  emit(ev: string): void {
    for (const cb of this.handlers.get(ev) ?? []) cb({ preventDefault: () => undefined })
  }
  setMenu(): void {}
  setAlwaysOnTop(): void {}
  moveTop(): void {}
  setTitle(): void {}
  show(): void {}
  hide(): void {}
  focus(): void {}
  isVisible(): boolean {
    return true
  }
  isFocused(): boolean {
    return false
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
  }
  isMaximized(): boolean {
    return this.maximized
  }
  isMinimized(): boolean {
    return this.minimized
  }
  maximize(): void {
    this.maximized = true
    this.emit('maximize')
  }
  unmaximize(): void {
    this.maximized = false
    this.emit('unmaximize')
  }
  minimize(): void {
    this.minimized = true
  }
  restore(): void {
    this.minimized = false
  }
  getBounds(): Rect {
    return { ...this.bounds }
  }
  getContentBounds(): Rect {
    return { ...this.bounds }
  }
  setBounds(b: Rect): void {
    this.bounds = { ...b }
  }
  /** окно растянули мышью */
  resizeTo(width: number): void {
    this.bounds = { ...this.bounds, width }
    this.emit('resize')
  }
}

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/poeth-test', on: () => undefined, isPackaged: false },
  BaseWindow: FakeWindow,
  WebContentsView: FakeView,
  globalShortcut: { register: () => true, unregister: () => undefined, isRegistered: () => false },
  screen: {
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    screenToDipRect: (_w: unknown, r: Rect) => r
  },
  shell: { openExternal: async () => undefined }
}))
vi.mock('../../src/main/services/atomicJson', () => ({
  readJson: async (file: string, fallback: unknown) => (files.has(file) ? structuredClone(files.get(file)) : fallback),
  writeJsonAtomic: async (file: string, data: unknown) => {
    files.set(file, structuredClone(data))
  }
}))
vi.mock('../../src/main/net/siteContents', () => ({ hardenSiteContents: () => undefined, siteWebPreferences: () => ({}) }))
vi.mock('../../src/main/focus/gameFocus', () => ({ isGameFocused: () => false, onGameFocusChange: () => () => undefined }))
vi.mock('../../src/main/windows/gameOverlay', () => ({ ensureGameForeground: () => undefined, getOverlayStatus: () => overlay }))
vi.mock('../../src/main/windows/rendererPage', () => ({ loadRendererPage: () => undefined }))
vi.mock('../../src/main/appIcon', () => ({ windowIcon: () => undefined }))
vi.mock('../../src/main/windows/siteTabs', () => ({
  activeTab: () => 'trade',
  closeAll: () => undefined,
  isSiteTabFocused: () => false,
  layoutSiteTabs: (b: Rect) => {
    tabsBounds = b
  },
  raiseSiteTabViews: () => {
    raised.tabs++
  },
  selectTab: async () => true,
  setSiteTabsHost: () => undefined,
  setSiteTabsShown: () => undefined,
  sitesEnabled: () => true
}))

type TradeWindowModule = typeof import('../../src/main/windows/tradeWindow')

/** Новый запуск приложения: модуль окна с нуля, файлы на «диске» — прежние. */
async function launch(): Promise<TradeWindowModule> {
  vi.resetModules()
  return import('../../src/main/windows/tradeWindow')
}

async function open(tw: TradeWindowModule): Promise<FakeWindow> {
  await tw.showTradeWindow({ title: 'POETH', defaultUrl: async () => 'https://www.pathofexile.com/trade/search/Standard' })
  return windows[windows.length - 1]
}

/** первым в окно кладётся сайдбар, вторым — сайт трейда (вкладки сайтов — в подставном siteTabs) */
async function openWithViews(tw: TradeWindowModule): Promise<{ w: FakeWindow; side: FakeView; site: FakeView }> {
  const w = await open(tw)
  const [side, site] = w.children
  return { w, side, site }
}

const STATE_FILE = path.join('C:/poeth-test', 'trade-window.json')
const saved = (): Record<string, unknown> => files.get(STATE_FILE) as Record<string, unknown>

beforeEach(() => {
  vi.useFakeTimers()
  files.clear()
  windows.length = 0
  raised.tabs = 0
  tabsBounds = null
  overlay = { tracking: false, attached: false, bounds: null }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('окно без системной рамки', () => {
  it('обычное окно и окно поверх игры — frame: false, размеры и минимум прежние', async () => {
    const tw = await launch()
    const { w } = await openWithViews(tw)
    expect(w.opts.frame).toBe(false)
    expect(w.opts.minWidth).toBe(900)
    expect(w.opts.minHeight).toBe(560)
    expect(tw.getTradeSiteState().overGame).toBe(false)

    overlay = { tracking: true, attached: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
    await open(tw)
    const game = windows[windows.length - 1]
    expect(game).not.toBe(w)
    expect(game.opts.frame).toBe(false)
    expect(tw.getTradeSiteState().overGame).toBe(true)
  })

  it('«Развернуть / Восстановить» и «Свернуть» — у обычного окна; развёрнутость запоминается', async () => {
    let tw = await launch()
    const { w } = await openWithViews(tw)
    tw.toggleMaximizeTradeWindow()
    expect(w.maximized).toBe(true)
    expect(tw.getTradeSiteState().maximized).toBe(true)
    await vi.advanceTimersByTimeAsync(700)
    expect(saved().maximized).toBe(true)
    tw.toggleMaximizeTradeWindow()
    expect(w.maximized).toBe(false)
    tw.minimizeTradeWindow()
    expect(w.minimized).toBe(true)

    // следующий запуск: окно было развёрнуто — открывается развёрнутым
    w.maximize()
    await vi.advanceTimersByTimeAsync(700)
    tw = await launch()
    const next = await open(tw)
    expect(next.maximized).toBe(true)
  })

  it('поверх игры кнопок окна нет — свернуть и развернуть ничего не делают', async () => {
    overlay = { tracking: true, attached: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
    const tw = await launch()
    const { w } = await openWithViews(tw)
    tw.minimizeTradeWindow()
    tw.toggleMaximizeTradeWindow()
    expect(w.minimized).toBe(false)
    expect(w.maximized).toBe(false)
  })
})

describe('рельс сайтов: выбор запоминается между запусками', () => {
  it('простой режим, игрок не выбирал — развёрнут; «свернуть» пишется в trade-window.json и переживает перезапуск', async () => {
    let tw = await launch()
    await openWithViews(tw)
    expect(tw.getTradeSiteState().rail).toEqual({ pref: null, wide: true, room: true })

    tw.setTradeRailPref('narrow')
    expect(tw.getTradeSiteState().rail).toEqual({ pref: 'narrow', wide: false, room: true })
    await vi.advanceTimersByTimeAsync(700)
    expect(saved().rail).toBe('narrow')

    tw = await launch()
    await openWithViews(tw)
    expect(tw.getTradeSiteState().rail).toEqual({ pref: 'narrow', wide: false, room: true })

    tw.setTradeRailPref('wide')
    await vi.advanceTimersByTimeAsync(700)
    tw = await launch()
    await openWithViews(tw)
    expect(tw.getTradeSiteState().rail.pref).toBe('wide')
  })

  it('экспертный режим без выбора — свёрнут; мусор в файле — «не выбирал»', async () => {
    files.set(STATE_FILE, { rail: 'huge' })
    const tw = await launch()
    tw.setTradeRailSimple(false)
    await openWithViews(tw)
    expect(tw.getTradeSiteState().rail).toEqual({ pref: null, wide: false, room: true })
    tw.setTradeRailSimple(true)
    expect(tw.getTradeSiteState().rail.wide).toBe(true)
  })

  it('сайт сдвигается за рельсом; узкое окно — рельс не встаёт рядом (шторка)', async () => {
    const tw = await launch()
    const { w, site } = await openWithViews(tw)
    tw.setTradeRailPref('wide')
    expect(site.bounds).toEqual({ x: 188 + 300, y: 32 + 40, width: 1280 - 488, height: 820 - 72 })
    expect(tabsBounds?.x).toBe(188)
    tw.setTradeRailPref('narrow')
    expect(site.bounds?.x).toBe(52 + 300)

    tw.setTradeRailPref('wide')
    w.resizeTo(1000)
    expect(tw.getTradeSiteState().rail).toEqual({ pref: 'wide', wide: false, room: false })
    expect(site.bounds?.x).toBe(52 + 300)
  })

  it('шторка: сайдбар поднимается над сайтами, закрыли — сайты снова поверх', async () => {
    const tw = await launch()
    const { w, side, site } = await openWithViews(tw)
    expect(w.children[w.children.length - 1]).toBe(site)
    tw.setTradeRailDrawer(true)
    expect(w.children[w.children.length - 1]).toBe(side)
    tw.setTradeRailDrawer(false)
    expect(w.children[w.children.length - 1]).toBe(site)
    expect(raised.tabs).toBe(1)
  })
})

describe('каналы окна — только главный кадр сайдбара этого окна', () => {
  it('сайдбар — да; сайт трейда, чужие webContents и iframe — нет', async () => {
    const tw = await launch()
    const { side, site } = await openWithViews(tw)
    const wc = side.webContents
    expect(tw.isTradeSidebarSender(wc, wc.mainFrame)).toBe(true)
    expect(tw.isTradeSidebarSender(site.webContents, site.webContents.mainFrame)).toBe(false)
    expect(tw.isTradeSidebarSender(new FakeContents(), wc.mainFrame)).toBe(false)
    expect(tw.isTradeSidebarSender(wc, { processId: wc.mainFrame.processId, routingId: 9 })).toBe(false)
    expect(tw.isTradeSidebarSender(wc, null)).toBe(false)
  })
})
