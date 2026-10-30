import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// S43: вкладки сайтов — на отдельной сессии persist:poeth-sites (cookies аккаунта ей не видны, и наоборот),
// webPreferences без preload и Node, разрешения — только запись в буфер, загрузки отменяются, window.open — deny,
// навигация — по allowlist своего сайта, «наружу» — только сразу после нажатия игрока.

class FakeSession extends EventEmitter {
  permissionRequest: ((wc: unknown, permission: string, cb: (ok: boolean) => void, details: unknown) => void) | null = null
  permissionCheck: ((wc: unknown, permission: string) => boolean) | null = null
  device: (() => boolean) | null = null
  cleared: string[] = []
  constructor(public partition: string) {
    super()
  }
  setUserAgent(): void {}
  setSpellCheckerEnabled(): void {}
  setPermissionRequestHandler(fn: FakeSession['permissionRequest']): void {
    this.permissionRequest = fn
  }
  setPermissionCheckHandler(fn: FakeSession['permissionCheck']): void {
    this.permissionCheck = fn
  }
  setDevicePermissionHandler(fn: FakeSession['device']): void {
    this.device = fn
  }
  webRequest = { onHeadersReceived: (): void => undefined }
  async clearStorageData(): Promise<void> {
    this.cleared.push('storage')
  }
  async clearCache(): Promise<void> {
    this.cleared.push('cache')
  }
  async clearAuthCache(): Promise<void> {
    this.cleared.push('auth')
  }
}

const sessions = new Map<string, FakeSession>()
const opened: string[] = []

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    userAgentFallback: 'Mozilla/5.0 Chrome/140 Electron/44 POETH/0.1.0',
    getVersion: () => '0.1.0',
    getName: () => 'POETH',
    getPath: () => '.',
    commandLine: { appendSwitch: () => undefined, getSwitchValue: () => '' }
  },
  session: {
    fromPartition: (p: string) => {
      if (!sessions.has(p)) sessions.set(p, new FakeSession(p))
      return sessions.get(p)
    }
  },
  shell: {
    openExternal: (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  },
  net: {},
  BrowserWindow: class {}
}))

const { getAccountSession, getSitesSession, clearSitesData, ACCOUNT_PARTITION } = await import('../../src/main/net/session')
const { sitesWebPreferences, hardenSitesContents, USER_ACTION_MS } = await import('../../src/main/net/sitesContents')
const { siteWebPreferences } = await import('../../src/main/net/siteContents')
const { SITES_PARTITION } = await import('@shared/sites')

describe('изоляция сессий', () => {
  it('сайты — своя партиция, не сессия аккаунта и не сессия по умолчанию', () => {
    expect(SITES_PARTITION).toBe('persist:poeth-sites')
    expect(SITES_PARTITION).not.toBe(ACCOUNT_PARTITION)
    const sites = getSitesSession() as unknown as FakeSession
    const account = getAccountSession() as unknown as FakeSession
    expect(sites.partition).toBe('persist:poeth-sites')
    expect(account.partition).toBe('persist:poe-account')
    expect(sites).not.toBe(account)
  })

  it('вью сайта — на сессии сайтов, окно сайта GGG — на сессии аккаунта', () => {
    expect(sitesWebPreferences().session).toBe(getSitesSession())
    expect(siteWebPreferences().session).toBe(getAccountSession())
    expect(sitesWebPreferences().session).not.toBe(siteWebPreferences().session)
  })

  it('«Очистить данные сайтов» стирает только сессию сайтов', async () => {
    const sites = getSitesSession() as unknown as FakeSession
    const account = getAccountSession() as unknown as FakeSession
    await clearSitesData()
    expect(sites.cleared).toEqual(['storage', 'cache', 'auth'])
    expect(account.cleared).toEqual([])
  })
})

describe('webPreferences вью сайта', () => {
  it('песочница, contextIsolation, без preload и Node, без webview и перетаскивания, без диалогов, без devTools в сборке', () => {
    const p = sitesWebPreferences()
    expect(p).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      disableDialogs: true,
      devTools: false
    })
    expect(p).not.toHaveProperty('preload')
    expect(p.webSecurity).not.toBe(false)
    expect(p.allowRunningInsecureContent).not.toBe(true)
  })
})

describe('разрешения и загрузки сессии сайтов', () => {
  it('запрос разрешений: да — только запись в буфер', () => {
    const s = getSitesSession() as unknown as FakeSession
    const ask = (permission: string): boolean => {
      let got: boolean | null = null
      s.permissionRequest!({}, permission, (ok) => (got = ok), {})
      return got!
    }
    expect(ask('clipboard-sanitized-write')).toBe(true)
    for (const p of ['clipboard-read', 'media', 'geolocation', 'notifications', 'fullscreen', 'openExternal', 'pointerLock'])
      expect(ask(p), p).toBe(false)
    expect(s.permissionCheck!({}, 'media')).toBe(false)
    expect(s.permissionCheck!({}, 'clipboard-sanitized-write')).toBe(true)
    expect(s.device!()).toBe(false)
  })

  it('загрузка отменяется', () => {
    const s = getSitesSession() as unknown as FakeSession
    const event = { prevented: false, preventDefault() {
      this.prevented = true
    } }
    const item = { cancelled: false, cancel() {
      this.cancelled = true
    } }
    s.emit('will-download', event, item)
    expect(event.prevented).toBe(true)
    expect(item.cancelled).toBe(true)
  })
})

// ---------------------------------------------------------------------------

class FakeWc extends EventEmitter {
  openHandler: ((d: { url: string }) => { action: string }) | null = null
  rtc = ''
  setWebRTCIPHandlingPolicy(p: string): void {
    this.rtc = p
  }
  setWindowOpenHandler(fn: FakeWc['openHandler']): void {
    this.openHandler = fn
  }
  nav(event: 'will-navigate' | 'will-redirect', url: string, isMainFrame = true): boolean {
    let prevented = false
    this.emit(event, { url, isMainFrame, preventDefault: () => (prevented = true) })
    return prevented
  }
  click(): void {
    this.emit('input-event', {}, { type: 'mouseDown' })
  }
}

function setup(tab: 'ninja' | 'poedb' = 'ninja') {
  const wc = new FakeWc()
  const routed: { kind: string; tab?: string; url: string }[] = []
  const here: string[] = []
  const blocked: { url: string; external: boolean }[] = []
  hardenSitesContents(wc as never, {
    tab,
    bookmarks: () => [],
    onRoute: (nav, url) => routed.push({ ...nav, url }),
    onOpenHere: (url) => here.push(url),
    onBlocked: (url, external) => blocked.push({ url, external })
  })
  return { wc, routed, here, blocked }
}

describe('правила вкладки сайта', () => {
  beforeEach(() => {
    opened.length = 0
    vi.useRealTimers()
  })

  it('WebRTC без прямого UDP', () => {
    expect(setup().wc.rtc).toBe('disable_non_proxied_udp')
  })

  it('свой сайт — переход идёт; подфреймы (реклама, Cloudflare) живут в песочнице страницы', () => {
    const { wc, blocked } = setup()
    expect(wc.nav('will-navigate', 'https://poe.ninja/poe1/economy/allflame/currency')).toBe(false)
    expect(wc.nav('will-redirect', 'https://poe.ninja/poe1/builds')).toBe(false)
    expect(wc.nav('will-navigate', 'https://ads.example.com/frame', false)).toBe(false)
    expect(blocked).toEqual([])
  })

  it('без нажатия игрока сайт никуда не уводит: ни в другую вкладку, ни в браузер', () => {
    const { wc, routed, blocked } = setup()
    expect(wc.nav('will-navigate', 'https://poedb.tw/us/Headhunter')).toBe(true)
    expect(wc.nav('will-redirect', 'https://www.pathofexile.com/trade/search/Allflame')).toBe(true)
    expect(wc.nav('will-navigate', 'https://boosty.to/x')).toBe(true)
    expect(routed).toEqual([])
    expect(opened).toEqual([])
    expect(blocked.map((b) => b.external)).toEqual([false, false, false])
  })

  it('по нажатию: другой сайт — его вкладка, поиск трейда — «Трейд», allowlist — браузер, прочее — никуда', () => {
    const { wc, routed, blocked } = setup()
    wc.click()
    expect(wc.nav('will-navigate', 'https://poedb.tw/us/Headhunter')).toBe(true)
    wc.click()
    expect(wc.nav('will-navigate', 'https://www.pathofexile.com/trade/search/Allflame?q=%7B%7D')).toBe(true)
    wc.click()
    expect(wc.nav('will-navigate', 'https://boosty.to/x')).toBe(true)
    wc.click()
    expect(wc.nav('will-navigate', 'https://evil.example.com/')).toBe(true)
    expect(routed).toEqual([
      { kind: 'tab', tab: 'poedb', url: 'https://poedb.tw/us/Headhunter' },
      { kind: 'trade', url: 'https://www.pathofexile.com/trade/search/Allflame?q=%7B%7D' }
    ])
    expect(opened).toEqual(['https://boosty.to/x'])
    expect(blocked).toEqual([
      { url: 'https://boosty.to/x', external: true },
      { url: 'https://evil.example.com/', external: false }
    ])
  })

  it('одно нажатие — один переход «наружу»', () => {
    const { wc, routed } = setup()
    wc.click()
    wc.nav('will-navigate', 'https://poedb.tw/us/A')
    wc.nav('will-navigate', 'https://poedb.tw/us/B')
    expect(routed.map((r) => r.url)).toEqual(['https://poedb.tw/us/A'])
  })

  it(`нажатие старше ${USER_ACTION_MS} мс не считается`, () => {
    vi.useFakeTimers()
    const { wc, routed } = setup()
    wc.click()
    vi.advanceTimersByTime(USER_ACTION_MS + 1)
    wc.nav('will-navigate', 'https://poedb.tw/us/A')
    expect(routed).toEqual([])
  })

  it('движение мыши и колесо — не нажатие', () => {
    const { wc, routed } = setup()
    wc.emit('input-event', {}, { type: 'mouseMove' })
    wc.emit('input-event', {}, { type: 'mouseWheel' })
    wc.nav('will-navigate', 'https://poedb.tw/us/A')
    expect(routed).toEqual([])
  })

  it('window.open — всегда deny; свой сайт по нажатию — в этой же вкладке; без нажатия — ничего', () => {
    const { wc, here, routed } = setup()
    expect(wc.openHandler!({ url: 'https://poe.ninja/poe1/builds' })).toEqual({ action: 'deny' })
    expect(here).toEqual([])
    wc.click()
    expect(wc.openHandler!({ url: 'https://poe.ninja/poe1/builds' })).toEqual({ action: 'deny' })
    expect(here).toEqual(['https://poe.ninja/poe1/builds'])
    expect(wc.openHandler!({ url: 'https://popunder.example.com/' })).toEqual({ action: 'deny' })
    expect(wc.openHandler!({ url: 'file:///C:/x' })).toEqual({ action: 'deny' })
    expect(routed).toEqual([])
    expect(opened).toEqual([])
  })

  it('<webview> не прикрепляется, «Покинуть страницу?» не держит вкладку', () => {
    const { wc } = setup()
    let webview = false
    wc.emit('will-attach-webview', { preventDefault: () => (webview = true) })
    expect(webview).toBe(true)
    let unload = false
    wc.emit('will-prevent-unload', { preventDefault: () => (unload = true) })
    expect(unload).toBe(true)
  })
})

// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '../..')
const code = (rel: string): string =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('сторож исходников', () => {
  const FILES = [
    'src/main/windows/siteTabs.ts',
    'src/main/net/sitesContents.ts',
    'src/main/services/sitesStore.ts',
    'src/shared/sites.ts',
    'src/shared/siteLinks.ts',
    'src/renderer/src/trade-sidebar/SiteRail.tsx',
    'src/renderer/src/trade-sidebar/SiteBar.tsx',
    'src/renderer/src/trade-sidebar/SitePages.tsx',
    'src/renderer/src/overlay/pricecheck/SiteLinks.tsx',
    'src/renderer/src/panels/build/SiteLink.tsx'
  ]

  it.each([
    [/executeJavaScript/, 'исполнение JS в странице сайта'],
    [/insertCSS|insertText|removeInsertedCSS/, 'инъекция в страницу'],
    [/sendInputEvent/, 'программный ввод'],
    [/\.debugger\b/, 'отладчик'],
    [/capturePage|savePage|printToPDF/, 'чтение страницы сайта'],
    [/getAccountSession|ACCOUNT_PARTITION|poe-account/, 'сессия аккаунта'],
    [/preload:/, 'preload у вью сайта'],
    [/webContents\.send\(|postMessage\(/, 'сообщения в страницу сайта']
  ])('нет %s (%s)', (re) => {
    for (const f of FILES) expect(re.test(code(f)), f).toBe(false)
  })

  it('каждая вью сайта — с sitesWebPreferences и hardenSitesContents', () => {
    const src = code('src/main/windows/siteTabs.ts')
    const views = src.match(/new WebContentsView\(/g) ?? []
    expect(views.length).toBe(1)
    expect(src).toMatch(/new WebContentsView\(\{ webPreferences: sitesWebPreferences\(\) \}\)/)
    expect(src).toMatch(/hardenSitesContents\(view\.webContents/)
  })

  it('вью грузит только страницу своей вкладки (isTabUrl перед loadURL)', () => {
    const src = code('src/main/windows/siteTabs.ts')
    expect(src).toMatch(/function load\(tab: SiteTabId, url: string\): void \{\s*const live = views\.get\(tab\)\s*if \(!live \|\| !isTabUrl\(tab, url, bookmarks\(\)\)\) return/)
    expect((src.match(/\.loadURL\(/g) ?? []).length).toBe(1)
  })

  it('«В браузере» — только адрес своего сайта', () => {
    const src = code('src/main/windows/siteTabs.ts')
    expect(src).toMatch(/if \(!url \|\| !isTabUrl\(active, url, bookmarks\(\)\)\) return false\s*void shell\.openExternal\(url\)/)
  })

  it('вкладка «Трейд» по-прежнему на siteWebPreferences (сессия аккаунта)', () => {
    const src = code('src/main/windows/tradeWindow.ts')
    expect(src).toMatch(/new WebContentsView\(\{ webPreferences: siteWebPreferences\(\) \}\)/)
    expect(src).not.toMatch(/sitesWebPreferences/)
  })
})
