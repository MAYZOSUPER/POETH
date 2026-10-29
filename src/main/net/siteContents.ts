import { app, BrowserWindow, shell, type WebContents, type WebPreferences } from 'electron'
import type { SiteHost } from '@shared/games'
import { isSiteExternalUrl } from '@shared/links'
import { isSiteNavigationAllowed } from './guards'
import { getAccountSession } from './session'
import { netLog } from './http'
import { windowIcon } from '../appIcon'

// Содержимое официального сайта pathofexile.com в нашем приложении: окно входа (S3) и
// siteView трейд-окна (S5). Правила одни:
//  - сессия persist:poe-account; sandbox, contextIsolation, без preload/nodeIntegration/webview;
//  - главный фрейм ходит только внутри https://*.pathofexile.com (+ проверка Cloudflare и
//    страница входа Steam steamcommunity.com/oauth|openid/…); остальное — в системный браузер
//    через isSiteExternalUrl (@shared/links: allowlist + прочий Steam), иначе никуда;
//  - window.open запрещён; загрузки и разрешения запрещены на уровне сессии (session.ts).
// S5: `new WebContentsView({ webPreferences: siteWebPreferences() })` +
// `hardenSiteContents(view.webContents)` + `loadURL(siteLoginUrl(host))` для входа.

/** webPreferences для любого окна/вью с сайтом GGG. */
export function siteWebPreferences(): WebPreferences {
  return {
    session: getAccountSession(),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    safeDialogs: true,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: !app.isPackaged
  }
}

export function siteLoginUrl(host: SiteHost): string {
  return `https://${host}/login`
}

function openOutside(url: string): void {
  const allowed: boolean = isSiteExternalUrl(url)
  if (allowed) void shell.openExternal(url)
  else netLog('debug', 'site: blocked navigation to', url.split('?')[0])
}

export interface HardenOptions {
  /** главный фрейм попытался уйти с сайта (вход через Steam и т.п.) */
  onBlockedNavigation?: (url: string) => void
}

/**
 * WebRTC без прямого UDP (S29, находка S34): вход GGG и проверка Cloudflare (Turnstile) создают RTCPeerConnection со
 * STUN Google/Cloudflare — это открывало порт на приём (вопрос брандмауэра Windows при первом трейд-окне) и раскрывало
 * IP STUN-серверам. POETH WebRTC не нужен: UDP только через прокси, а прокси нет — кандидатов нет.
 */
export const WEBRTC_IP_POLICY = 'disable_non_proxied_udp' as const

/** Навесить ограничения навигации на webContents с сайтом GGG. */
export function hardenSiteContents(wc: WebContents, opts: HardenOptions = {}): void {
  wc.setWebRTCIPHandlingPolicy(WEBRTC_IP_POLICY)
  // Только главный фрейм: подфреймы (Turnstile Cloudflare и т.п.) живут в песочнице
  // страницы и cookies аккаунта чужим хостам не достаются.
  const guard = (details: { url: string; isMainFrame: boolean; preventDefault(): void }): void => {
    if (!details.isMainFrame || isSiteNavigationAllowed(details.url)) return
    details.preventDefault()
    opts.onBlockedNavigation?.(details.url)
    openOutside(details.url)
  }
  wc.on('will-navigate', (details) => guard(details))
  wc.on('will-redirect', (details) => guard(details))
  wc.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  wc.on('will-attach-webview', (event) => event.preventDefault())
}

// ---------------------------------------------------------------------------
// Окно входа
// ---------------------------------------------------------------------------

let loginWin: BrowserWindow | null = null

export interface LoginWindowOptions extends HardenOptions {
  host: SiteHost
  title?: string
  /** поверх какого окна показать (компаньон висит на уровне screen-saver) */
  aboveAlwaysOnTop?: boolean
}

/** Открыть (или показать) окно входа на официальной странице GGG. */
export function openLoginWindow(opts: LoginWindowOptions): BrowserWindow {
  if (loginWin && !loginWin.isDestroyed()) {
    if (loginWin.isMinimized()) loginWin.restore()
    loginWin.show()
    loginWin.focus()
    return loginWin
  }
  const win = new BrowserWindow({
    title: opts.title ?? 'Path of Exile — вход',
    icon: windowIcon(),
    width: 1000,
    height: 820,
    minWidth: 480,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0b0e',
    webPreferences: siteWebPreferences()
  })
  win.setMenu(null)
  // окно сайта: заголовок не даём менять странице (видно, что это окно POETH)
  win.on('page-title-updated', (event) => event.preventDefault())
  if (opts.aboveAlwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver')
  hardenSiteContents(win.webContents, opts)
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.close()
  })
  // ready-to-show может не прийти, если первым отрисовался и сменился челлендж
  // Cloudflare, — тогда показываем по таймеру
  const reveal = (): void => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 1500)
  win.on('closed', () => {
    if (loginWin === win) loginWin = null
  })
  loginWin = win
  void win.loadURL(siteLoginUrl(opts.host)).catch((e: unknown) => {
    netLog('warn', 'login window: load failed', e instanceof Error ? e.message : String(e))
    if (!win.isDestroyed()) win.show()
  })
  return win
}

export function closeLoginWindow(): void {
  if (loginWin && !loginWin.isDestroyed()) loginWin.close()
  loginWin = null
}

export function isLoginWindowOpen(): boolean {
  return !!loginWin && !loginWin.isDestroyed()
}
