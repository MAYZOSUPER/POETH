import { app, session, type Session } from 'electron'
import { buildUserAgent, isPoeHost, stripPartitioned } from './guards'

// Сессии сети (этап S3).
//  - persist:poe-account — ТОЛЬКО pathofexile.com: окно входа, трейд-окно S5 (siteView),
//    net.request шлюза и ws live search S6. Cookies (POESESSID, cf_clearance) живут
//    только здесь и только в main; на диске их шифрует fuse EnableCookieEncryption.
//  - poeth-anon (в памяти) — все прочие хосты, без cookies.
// Наши окна (компаньон, оверлей, сайдбар) — на сессии по умолчанию: там poeth://.
//
// webRequest: у сессии один слушатель на событие — onHeadersReceived аккаунта занят
// здесь (снятие Partitioned). Нужен ещё хук — расширять этот модуль, не вешать второй.

export const ACCOUNT_PARTITION = 'persist:poe-account'
const ANON_PARTITION = 'poeth-anon'
const POE_URLS = ['https://pathofexile.com/*', 'https://*.pathofexile.com/*']

let userAgent = ''
let identityReady = false
let accountSession: Session | null = null
let anonSession: Session | null = null

/**
 * Сетевая «личность» приложения. Вызвать в main/index.ts ДО app.whenReady()
 * (переключатель командной строки читается при старте Chromium):
 *  - app.userAgentFallback = UA Chromium + ` POETH/<версия>` — один UA у окон и API
 *    (cf_clearance Cloudflare привязан к UA);
 *  - disable-blink-features=AutomationControlled (navigator.webdriver = false).
 * Повторный вызов — no-op.
 */
export function initNetIdentity(): void {
  if (identityReady) return
  identityReady = true
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
  userAgent = buildUserAgent(app.userAgentFallback, app.getVersion(), [app.getName()])
  app.userAgentFallback = userAgent
}

export function getUserAgent(): string {
  if (!userAgent) initNetIdentity()
  return userAgent
}

/** Запретить разрешения (камера, уведомления, …), загрузки и HID/USB в сессии. */
function lockDown(ses: Session): void {
  ses.setUserAgent(getUserAgent())
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    item.cancel()
  })
}

/** Изолированная сессия аккаунта pathofexile.com (после app ready). */
export function getAccountSession(): Session {
  if (accountSession) return accountSession
  const ses = session.fromPartition(ACCOUNT_PARTITION)
  lockDown(ses)
  // Атрибут Partitioned (CHIPS) прячет cookie от net.request — снимаем, как APT.
  ses.webRequest.onHeadersReceived({ urls: POE_URLS }, (details, callback) => {
    callback({ responseHeaders: stripPartitioned(details.responseHeaders) })
  })
  accountSession = ses
  return ses
}

/** Сессия без cookies для прочих хостов (в памяти, на диск ничего не пишет). */
export function getAnonSession(): Session {
  if (anonSession) return anonSession
  const ses = session.fromPartition(ANON_PARTITION)
  lockDown(ses)
  anonSession = ses
  return ses
}

/**
 * Заголовок Cookie для запроса из main (ws live search S6): cookies сессии аккаунта,
 * применимые к url. Только для pathofexile.com; в renderer не передавать и не логировать.
 */
export async function cookieHeaderFor(url: string): Promise<string> {
  const u = new URL(url)
  if ((u.protocol !== 'https:' && u.protocol !== 'wss:') || !isPoeHost(u.hostname)) {
    throw new Error('cookieHeaderFor: only https/wss pathofexile.com')
  }
  u.protocol = 'https:'
  const cookies = await getAccountSession().cookies.get({ url: u.toString() })
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}
