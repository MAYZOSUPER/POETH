import { createHash } from 'crypto'
import type { Cookie } from 'electron'
import type { SiteHost } from '@shared/games'
import type { AuthStatus, PasteSessionResult } from '@shared/types'
import { getAccountSession } from './session'
import { httpRequest, netLog } from './http'
import { isCloudflareChallenge, isPoeHost, isValidPoesessid, parseAccountName } from './guards'
import { clearAccountSecret, loadAccountSecret, saveAccountSecret } from './accountSecret'
import { closeLoginWindow, isLoginWindowOpen, openLoginWindow } from './siteContents'

// Статус входа в аккаунт pathofexile.com (только main; значение cookie в renderer не уходит).
//
// POESESSID сайт выдаёт ЛЮБОМУ посетителю (domain=.pathofexile.com — общий для www и ru),
// поэтому наличие cookie ≠ вход. При изменении POESESSID (cookies 'changed') и при старте
// статус проверяется запросом GET /my-account сессией аккаунта: 200 — вошли (имя аккаунта
// берём из ссылки на профиль, если она есть), 401/редирект на /login — не вошли.

const COOKIE_NAME = 'POESESSID'
const COOKIE_DOMAIN = '.pathofexile.com'
/** срок cookie, вставленного вручную (сайт сам продлевает свою сессию) */
const PASTED_COOKIE_TTL_S = 28 * 24 * 3600
/** срок, с которым пересохраняется сессионный POESESSID сайта (см. makePersistent) */
const PERSIST_COOKIE_TTL_S = 30 * 24 * 3600
const VERIFY_DEBOUNCE_MS = 700
const LOGIN_CLOSE_DELAY_MS = 1200

interface AccountDeps {
  /** хост сайта из настроек (siteHost) */
  getHost: () => Promise<SiteHost>
}

let deps: AccountDeps | null = null
let status: AuthStatus = { loggedIn: false, checking: true, problem: null }
const listeners = new Set<(s: AuthStatus) => void>()
let debounce: ReturnType<typeof setTimeout> | null = null
let running: Promise<AuthStatus> | null = null
let rerun = false
/** sha256 вставленного POESESSID (само значение в памяти не держим) */
let pastedHash: string | null = null

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export function getAuthStatus(): AuthStatus {
  return status
}

export function onAuthStatus(cb: (s: AuthStatus) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function update(next: AuthStatus): AuthStatus {
  const prev = status
  status = next
  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    for (const cb of listeners) cb(next)
    if (!prev.loggedIn && next.loggedIn && isLoginWindowOpen()) {
      // вошли — окно входа больше не нужно
      setTimeout(closeLoginWindow, LOGIN_CLOSE_DELAY_MS)
    }
  }
  return next
}

function host(): Promise<SiteHost> {
  if (!deps) throw new Error('account: initAccount() was not called')
  return deps.getHost()
}

function isSessionCookie(c: Pick<Cookie, 'name' | 'domain'>): boolean {
  return c.name === COOKIE_NAME && isPoeHost((c.domain ?? '').replace(/^\./, ''))
}

async function sessionCookie(h: SiteHost): Promise<Cookie | null> {
  const list = await getAccountSession().cookies.get({ url: `https://${h}/`, name: COOKIE_NAME })
  return list.find((c) => !!c.value) ?? null
}

/** Подключить сессию аккаунта: слежение за POESESSID, восстановление вставленного, проверка. */
export function initAccount(d: AccountDeps): void {
  if (deps) return
  deps = d
  getAccountSession().cookies.on('changed', (_event, cookie, _cause, removed) => {
    // проверку Cloudflare прошли в окне сайта — перепроверить вход без кнопки
    if (cookie.name === 'cf_clearance' && !removed && status.problem === 'blocked') scheduleVerify()
    if (!isSessionCookie(cookie)) return
    if (!removed && cookie.session) void makePersistent(cookie)
    scheduleVerify()
  })
  void restorePasted().finally(() => void verify())
}

/**
 * Сайт ставит POESESSID сессионным (без Expires), а Chromium такие cookies на диск не
 * пишет — вход пропадал бы после перезапуска. Пересохраняем его постоянным: сервер
 * по-прежнему решает, жива ли сессия (это ловит проверка /my-account), а на диске
 * cookie зашифрован (fuse EnableCookieEncryption).
 */
async function makePersistent(c: Cookie): Promise<void> {
  try {
    const ses = getAccountSession()
    const domain = (c.domain ?? '').replace(/^\./, '')
    await ses.cookies.set({
      url: `https://${domain}${c.path ?? '/'}`,
      ...(c.hostOnly ? {} : { domain: c.domain }),
      path: c.path ?? '/',
      name: c.name,
      value: c.value,
      secure: true,
      httpOnly: true,
      sameSite: c.sameSite === 'unspecified' ? 'lax' : c.sameSite,
      expirationDate: Math.floor(Date.now() / 1000) + PERSIST_COOKIE_TTL_S
    })
    await ses.cookies.flushStore()
  } catch (e) {
    netLog('warn', 'account: persist cookie failed', e instanceof Error ? e.message : String(e))
  }
}

/** Cookie потерян, а копия вставленного POESESSID есть — вернуть cookie. */
async function restorePasted(): Promise<void> {
  const secret = await loadAccountSecret()
  if (!secret || !isValidPoesessid(secret)) {
    pastedHash = null
    return
  }
  pastedHash = sha256(secret)
  try {
    if (!(await sessionCookie(await host()))) await setSessionCookie(secret)
  } catch (e) {
    netLog('warn', 'account: restore failed', e instanceof Error ? e.message : String(e))
  }
}

async function setSessionCookie(value: string): Promise<void> {
  const ses = getAccountSession()
  await ses.cookies.set({
    url: `https://${await host()}/`,
    domain: COOKIE_DOMAIN,
    path: '/',
    name: COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + PASTED_COOKIE_TTL_S
  })
  await ses.cookies.flushStore()
}

async function removeSessionCookies(): Promise<void> {
  const ses = getAccountSession()
  const all = await ses.cookies.get({ name: COOKIE_NAME })
  for (const c of all) {
    if (!isSessionCookie(c)) continue
    const domain = (c.domain ?? '').replace(/^\./, '')
    await ses.cookies.remove(`https://${domain}${c.path ?? '/'}`, COOKIE_NAME)
  }
}

function scheduleVerify(): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    debounce = null
    void verify()
  }, VERIFY_DEBOUNCE_MS)
}

/** Проверить сессию на сайте (параллельные вызовы склеиваются, изменения во время — перепроверка). */
export function verify(): Promise<AuthStatus> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    let result: AuthStatus
    do {
      rerun = false
      result = await verifyOnce()
    } while (rerun)
    return result
  })().finally(() => {
    running = null
  })
  return running
}

export function recheck(): Promise<AuthStatus> {
  return verify()
}

async function verifyOnce(): Promise<AuthStatus> {
  const h = await host()
  const cookie = await sessionCookie(h)
  if (!cookie) return update({ loggedIn: false, checking: false, problem: null })

  update({ ...status, checking: true })
  let res
  try {
    res = await httpRequest({
      url: `https://${h}/my-account`,
      accept: 'text/html,application/xhtml+xml',
      timeoutMs: 15_000
    })
  } catch (e) {
    netLog('warn', 'account: check failed', e instanceof Error ? e.message : String(e))
    return update({ ...status, checking: false, problem: 'network' })
  }
  if (isCloudflareChallenge(res)) return update({ ...status, checking: false, problem: 'blocked' })

  let path = ''
  try {
    path = new URL(res.url).pathname
  } catch {
    path = ''
  }
  const loggedIn = res.status === 200 && !path.startsWith('/login')
  if (!loggedIn) {
    if (res.status >= 500) return update({ ...status, checking: false, problem: 'network' })
    return update({ loggedIn: false, checking: false, problem: null })
  }

  const isPasted = !!pastedHash && sha256(cookie.value) === pastedHash
  if (pastedHash && !isPasted) {
    // вошли через окно сайта — старая копия вставленного POESESSID больше не нужна
    pastedHash = null
    await clearAccountSecret()
  }
  const accountName = parseAccountName(res.url, res.body)
  return update({
    loggedIn: true,
    ...(accountName ? { accountName } : {}),
    checking: false,
    problem: null,
    source: isPasted ? 'pasted' : 'window'
  })
}

/** Открыть окно входа на официальной странице GGG. */
export async function openLogin(title?: string): Promise<void> {
  openLoginWindow({ host: await host(), title, aboveAlwaysOnTop: true })
}

/**
 * Фолбэк: POESESSID, вставленный вручную. Cookie (secure, httpOnly) кладётся в partition,
 * зашифрованная копия — в account-secret.json. Сайт не узнал аккаунт — всё откатывается.
 */
export async function pasteSession(raw: unknown): Promise<PasteSessionResult> {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!isValidPoesessid(value)) return { ok: false, error: 'invalid-format', status }

  await removeSessionCookies()
  await setSessionCookie(value)
  pastedHash = sha256(value)
  const saved = await saveAccountSecret(value)
  if (!saved) netLog('warn', 'account: OS encryption unavailable — pasted session kept only as a cookie')

  const s = await verify()
  if (s.loggedIn) return { ok: true, status: s }
  if (s.problem) return { ok: false, error: s.problem, status: s }

  // сайт не узнал аккаунт — не держим мусор
  pastedHash = null
  await clearAccountSecret()
  await removeSessionCookies()
  return { ok: false, error: 'not-logged-in', status: await verify() }
}

/**
 * Выход: очистить ВСЁ хранилище partition persist:poe-account (cookies, кэш, storage)
 * и копию вставленного POESESSID. Сессия на сервере GGG при этом не завершается —
 * «Выйти» на сайте GGG завершает все сессии (подсказка в UI).
 */
export async function logout(): Promise<AuthStatus> {
  closeLoginWindow()
  const ses = getAccountSession()
  await ses.clearStorageData()
  await ses.clearCache()
  await ses.clearAuthCache()
  await ses.cookies.flushStore()
  pastedHash = null
  await clearAccountSecret()
  return update({ loggedIn: false, checking: false, problem: null })
}
