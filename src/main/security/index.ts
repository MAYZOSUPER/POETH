import { app, ipcMain, session, shell, type WebContents } from 'electron'
import path from 'path'
import { isAllowedExternalUrl } from '@shared/links'
import { guardIpcMain, senderUrl } from './ipcGuard'
import { appNavigationAllowed, appPageOf, appPermissionAllowed, ipcAllowed, type AppOrigin } from './policy'
import { devEnv } from '../devEnv'
import { WEBRTC_IP_POLICY } from '../net/siteContents'

// Защита наших окон (S29), одним вызовом из main/index.ts ДО регистрации IPC и создания окон:
//  1. IPC: каждый канал — только с наших страниц (policy.ts), ввод в игру — не из сайдбара трейд-окна,
//     вставка POESESSID — только из компаньона;
//  2. окна на сессии по умолчанию (компаньон, оверлей, сайдбар, служебные — все с preload): переходы —
//     только на свои страницы, window.open и <webview> запрещены (ссылка allowlist — в системный браузер);
//  3. разрешения сессии по умолчанию — только буфер обмена для своих страниц.
// Окна сайта GGG живут на persist:poe-account со своими правилами (net/session.ts, net/siteContents.ts).

/** Откуда наши страницы. Адрес dev-сервера учитывается только в dev: в сборке переменная окружения
 *  не должна превращать чужой сайт в «нашу страницу». */
export function appOrigin(): AppOrigin {
  return {
    rendererDir: path.join(__dirname, '../renderer'),
    devServerUrl: devEnv('ELECTRON_RENDERER_URL')
  }
}

/** Адрес — одна из наших страниц (для рассылки событий доменов: сайту GGG и чужим file:// — ничего). */
export function isAppPageUrl(url: unknown): boolean {
  return appPageOf(url, appOrigin()) !== null
}

const reported = new Set<string>()

function logRejected(what: string, url: string): void {
  const key = `${what} ${url.split(/[?#]/)[0]}`
  if (reported.has(key)) return
  reported.add(key)
  console.warn(`[security] blocked ${key || what}`)
}

/** Ограничения навигации для страницы приложения (вызывается на каждый новый webContents). */
function guardAppContents(wc: WebContents): void {
  // сайт GGG (siteView, окно входа, окно live) — на сессии аккаунта, его стережёт net/siteContents.ts
  if (wc.session !== session.defaultSession) return
  const guard = (e: { url: string; preventDefault(): void }): void => {
    if (appNavigationAllowed(e.url, appOrigin())) return
    e.preventDefault()
    logRejected('navigation to', e.url)
  }
  wc.on('will-navigate', guard)
  wc.on('will-frame-navigate', guard)
  wc.on('will-redirect', guard)
  wc.on('will-attach-webview', (e) => e.preventDefault())
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    else logRejected('window.open', url)
    return { action: 'deny' }
  })
}

function lockDefaultSession(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(appPermissionAllowed(permission, details.requestingUrl || wc?.getURL(), appOrigin()))
  )
  ses.setPermissionCheckHandler((wc, permission, _origin, details) =>
    appPermissionAllowed(permission, details.requestingUrl || wc?.getURL(), appOrigin())
  )
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (e) => e.preventDefault())
}

/** Вызвать до app ready и до registerIpcHandlers(). */
export function installAppSecurity(): void {
  guardIpcMain(
    ipcMain,
    (event, channel) => ipcAllowed(appPageOf(senderUrl(event), appOrigin()), channel),
    (channel, url) => logRejected(`ipc ${channel} from`, url)
  )
  app.on('web-contents-created', (_e, wc) => {
    // WebRTC без прямого UDP — у всех окон, до первой загрузки (сайт GGG ставит то же в hardenSiteContents)
    wc.setWebRTCIPHandlingPolicy(WEBRTC_IP_POLICY)
    guardAppContents(wc)
  })
  void app.whenReady().then(lockDefaultSession)
}
