import { app, shell, type WebContents, type WebPreferences } from 'electron'
import { siteNavDecision, type SiteBookmark, type SiteNav, type SiteTabId } from '@shared/sites'
import { getSitesSession } from './session'
import { WEBRTC_IP_POLICY } from './siteContents'
import { netLog } from './http'

// Вкладки сайтов трейд-окна (S43): poe.ninja, poedb, вики, Maxroll, poelab, Craft of Exile, PoE Scout и закладки
// игрока. Правила (тесты — tests/sites/**):
//  - сессия persist:poeth-sites (net/session.ts): без cookies аккаунта, отдельно от сессии API; разрешения —
//    только запись в буфер, загрузки отменяются;
//  - sandbox, contextIsolation, без preload, nodeIntegration*: false, webviewTag: false, navigateOnDragDrop: false,
//    диалоги страницы выключены, devTools — только без упаковки;
//  - главный фрейм ходит только по хостам СВОЕГО сайта (siteNavDecision в @shared/sites); другой сайт реестра,
//    поиск трейда и системный браузер (allowlist) — только сразу после нажатия игрока в этой вкладке, иначе никуда;
//  - window.open → deny (по нажатию — тот же маршрут), <webview> — нет;
//  - никаких executeJavaScript, insertCSS и чтения DOM чужих сайтов, рекламу не режем.

/** Сколько после нажатия игрока в вкладке переход «наружу» считается его действием. */
export const USER_ACTION_MS = 2500

/** webPreferences вью сайта (не сайта GGG — у него siteWebPreferences и сессия аккаунта). */
export function sitesWebPreferences(): WebPreferences {
  return {
    session: getSitesSession(),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    disableDialogs: true,
    spellcheck: false,
    backgroundThrottling: true,
    devTools: !app.isPackaged
  }
}

export interface SitesHardenOptions {
  /** вкладка, которой принадлежит webContents */
  tab: SiteTabId
  /** текущие закладки (хосты вкладки закладки) */
  bookmarks: () => readonly SiteBookmark[]
  /** переход в другую вкладку или «Трейд» (уже после нажатия игрока) */
  onRoute: (nav: Extract<SiteNav, { kind: 'tab' | 'trade' }>, url: string) => void
  /** то же для window.open на свой сайт: открыть в этой же вкладке */
  onOpenHere: (url: string) => void
  /** переход не пустили или отдали в браузер (строка над сайтом) */
  onBlocked: (url: string, external: boolean) => void
}

/** Навесить правила вкладки сайта на webContents. */
export function hardenSitesContents(wc: WebContents, opts: SitesHardenOptions): void {
  wc.setWebRTCIPHandlingPolicy(WEBRTC_IP_POLICY)
  let lastInput = 0
  // только время нажатия в нашей вью: что нажато, не читаем и в страницу ничего не вводим
  wc.on('input-event', (_e, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown' || input.type === 'gestureTap') lastInput = Date.now()
  })
  const acted = (): boolean => Date.now() - lastInput <= USER_ACTION_MS

  /** не своя страница: другой вкладке / «Трейду» / браузеру — только по нажатию игрока */
  const route = (url: string, nav: SiteNav): void => {
    if (nav.kind === 'allow' || nav.kind === 'block' || !acted()) {
      if (nav.kind !== 'allow') {
        netLog('debug', 'sites: blocked navigation to', url.split(/[?#]/)[0])
        opts.onBlocked(url, false)
      }
      return
    }
    lastInput = 0
    if (nav.kind === 'external') {
      void shell.openExternal(url)
      opts.onBlocked(url, true)
    } else opts.onRoute(nav, url)
  }

  const guard = (details: { url: string; isMainFrame: boolean; preventDefault(): void }): void => {
    if (!details.isMainFrame) return
    const nav = siteNavDecision(opts.tab, details.url, opts.bookmarks())
    if (nav.kind === 'allow') return
    details.preventDefault()
    route(details.url, nav)
  }
  wc.on('will-navigate', (details) => guard(details))
  wc.on('will-redirect', (details) => guard(details))
  wc.setWindowOpenHandler(({ url }) => {
    const nav = siteNavDecision(opts.tab, url, opts.bookmarks())
    if (nav.kind === 'allow') {
      if (acted()) opts.onOpenHere(url)
      else opts.onBlocked(url, false)
    } else route(url, nav)
    return { action: 'deny' }
  })
  wc.on('will-attach-webview', (event) => event.preventDefault())
  // «Покинуть страницу?» сайта не держит вкладку (диалоги страницы выключены)
  wc.on('will-prevent-unload', (event) => event.preventDefault())
  // вход по HTTP (Basic) не обрабатываем: по умолчанию Electron его отменяет
}
