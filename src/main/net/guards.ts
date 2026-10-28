// Чистые правила сетевой безопасности (без electron — тестируются в tests/net/**):
// allowlist хостов сессии аккаунта, навигация окна сайта, доверенные страницы
// приложения, детект Cloudflare/HTML, маскирование cookie в логах, User-Agent.

/**
 * Хосты, которым net.request отправляет cookies сессии аккаунта
 * (persist:poe-account). Только точное совпадение имени хоста и только https.
 */
export const ACCOUNT_HOSTS: readonly string[] = [
  'www.pathofexile.com',
  'ru.pathofexile.com',
  'pathofexile.com',
  'web.poecdn.com'
]

/** Хост проверки Cloudflare (Turnstile) — можно открыть в окне сайта. */
export const CLOUDFLARE_CHALLENGE_HOST = 'challenges.cloudflare.com'

function parseUrl(url: unknown): URL | null {
  if (typeof url !== 'string') return null
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Запрос на этот URL идёт сессией аккаунта (с cookies): https + хост из ACCOUNT_HOSTS. */
export function isAccountUrl(url: unknown): boolean {
  const u = parseUrl(url)
  return !!u && u.protocol === 'https:' && ACCOUNT_HOSTS.includes(u.hostname)
}

/** pathofexile.com или любой его поддомен (но не pathofexile.com.evil.com). */
export function isPoeHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'pathofexile.com' || h.endsWith('.pathofexile.com')
}

/**
 * Вход через Steam: кнопка «Sign in through Steam» на странице входа GGG (/login/steam) ведёт
 * на steamcommunity.com/oauth/login?client_id=…&redirect_uri=https://www.pathofexile.com/login/steam-auth
 * (OAuth Steam, проверено вживую 28.10.2026; /openid/ — прежний вход OpenID 2.0 у других сайтов).
 * После входа Steam возвращает на pathofexile.com. Только эти страницы; форма входа Steam
 * ходит в login.steampowered.com запросами страницы (не навигацией главного фрейма).
 */
export const STEAM_LOGIN_HOST = 'steamcommunity.com'
const STEAM_LOGIN_PATHS = ['/oauth/', '/openid/']

/** https://steamcommunity.com/oauth/… или /openid/… — страница входа Steam для сайта GGG. */
export function isSteamLoginUrl(url: unknown): boolean {
  const u = parseUrl(url)
  return (
    !!u &&
    u.protocol === 'https:' &&
    u.hostname.toLowerCase() === STEAM_LOGIN_HOST &&
    STEAM_LOGIN_PATHS.some((p) => u.pathname.startsWith(p))
  )
}

/**
 * Страница, которую мы сами открываем в окне сайта (адресная строка, «Открыть лот»,
 * избранное): только https внутри pathofexile.com и страница проверки Cloudflare.
 */
export function isSitePageUrl(url: unknown): boolean {
  const u = parseUrl(url)
  if (!u || u.protocol !== 'https:') return false
  return isPoeHost(u.hostname) || u.hostname === CLOUDFLARE_CHALLENGE_HOST
}

/**
 * Можно ли окну сайта (вход, трейд-окно S5) перейти на этот URL в главном фрейме по
 * действию страницы: страницы сайта (isSitePageUrl) и вход через Steam (isSteamLoginUrl).
 * Остальное — в системный браузер через isSiteExternalUrl (@shared/links) или никуда.
 */
export function isSiteNavigationAllowed(url: unknown): boolean {
  return isSitePageUrl(url) || isSteamLoginUrl(url)
}

/**
 * Страница нашего приложения (компаньон, оверлей, сайдбар): file:// из сборки или
 * dev-сервер electron-vite. Только такие отправители могут звать IPC входа и
 * только им уходят события статуса.
 */
export function isTrustedAppUrl(url: unknown, devServerUrl?: string): boolean {
  const u = parseUrl(url)
  if (!u) return false
  if (u.protocol === 'file:') return true
  const dev = devServerUrl ? parseUrl(devServerUrl) : null
  return !!dev && u.origin === dev.origin
}

/** Формат POESESSID: 32 шестнадцатеричных символа. */
export function isValidPoesessid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value)
}

// ---------------------------------------------------------------------------
// Ответы: HTML / Cloudflare
// ---------------------------------------------------------------------------

export interface ResponseLike {
  status: number
  /** имена заголовков в нижнем регистре */
  headers: Record<string, string | undefined>
  body: string
}

// Только маркеры страницы-челленджа. Обычные страницы GGG (/login, /my-account → 401)
// тоже содержат следы Cloudflare — Turnstile с challenges.cloudflare.com и скрипт
// /cdn-cgi/challenge-platform/scripts/jsd/main.js, — это НЕ челлендж. Заголовок
// «Just a moment» локализуется по Accept-Language («Один момент…»), поэтому главные
// признаки — заголовок cf-mitigated, _cf_chl_opt и путь …/challenge-platform/h/…/orchestrate/.
const CF_MARKERS = [
  /<title>\s*just a moment/i,
  /\b_cf_chl_opt\b/,
  /\/cdn-cgi\/challenge-platform\/h\/[^"'\s]*\/orchestrate\//,
  /attention required!?\s*\|\s*cloudflare/i,
  /cf-browser-verification/i
]

/** Ответ — HTML-страница (по content-type или по началу тела). */
export function isHtmlResponse(res: ResponseLike): boolean {
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('text/html')) return true
  if (ct.includes('json')) return false
  return /^\s*</.test(res.body.slice(0, 64))
}

/** Страница проверки Cloudflare («Just a moment…», managed challenge, cf-mitigated). */
export function isCloudflareChallenge(res: ResponseLike): boolean {
  if ((res.headers['cf-mitigated'] ?? '').toLowerCase().includes('challenge')) return true
  if (!isHtmlResponse(res)) return false
  const head = res.body.slice(0, 20000)
  return CF_MARKERS.some((re) => re.test(head))
}

/**
 * Для JSON-API: любой HTML вместо JSON (челлендж Cloudflare, HTML 403, страница
 * ошибки прокси) = запрос заблокирован → код `blocked`, UI предлагает пройти
 * проверку в окне сайта.
 */
export function isBlockedApiResponse(res: ResponseLike): boolean {
  return isCloudflareChallenge(res) || isHtmlResponse(res)
}

const PROFILE_LINK = /\/account\/view-profile\/([^/?#"'<>\s]+)/

/**
 * Имя аккаунта со страницы /my-account (вошли): из итогового URL или первой ссылки
 * на профиль. Лучшее усилие — разметку сайта мы не контролируем.
 */
export function parseAccountName(finalUrl: string, html: string): string | undefined {
  const m = PROFILE_LINK.exec(finalUrl) ?? PROFILE_LINK.exec(html.slice(0, 200_000))
  if (!m) return undefined
  let name: string
  try {
    name = decodeURIComponent(m[1])
  } catch {
    return undefined
  }
  name = name.trim()
  return name && name.length <= 64 && !/[<>"']/.test(name) ? name : undefined
}

// ---------------------------------------------------------------------------
// Маскирование секретов в логах
// ---------------------------------------------------------------------------

const SECRET_COOKIES = /\b(POESESSID|cf_clearance|__cf_bm|_cfuvid|cf_chl_[\w]+)=([^;,\s"']+)/gi
const COOKIE_HEADER = /\b((?:set-)?cookie)(["']?\s*[:=]\s*["']?)([^"'\r\n]+)/gi
const HEX32 = /\b[0-9a-f]{32}\b/gi

/** Убрать из строки значения cookie и всё, похожее на POESESSID. */
export function maskSecrets(text: string): string {
  return text
    .replace(COOKIE_HEADER, (_m, name: string, sep: string) => `${name}${sep}***`)
    .replace(SECRET_COOKIES, (_m, name: string) => `${name}=***`)
    .replace(HEX32, '***')
}

const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization'])

/** Копия заголовков для лога: cookie/authorization заменены на ***. */
export function maskHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue
    out[k] = SECRET_HEADERS.has(k.toLowerCase())
      ? '***'
      : maskSecrets(Array.isArray(v) ? v.join(', ') : v)
  }
  return out
}

// ---------------------------------------------------------------------------
// Cookies / User-Agent
// ---------------------------------------------------------------------------

/**
 * Убрать атрибут `Partitioned` у Set-Cookie (как APT): иначе Chromium кладёт
 * cookie pathofexile.com в разделённое хранилище и net.request их не отправляет.
 */
export function stripPartitioned(
  headers: Record<string, string[]> | undefined
): Record<string, string[]> | undefined {
  if (!headers) return headers
  let changed = false
  const out: Record<string, string[]> = {}
  for (const [k, values] of Object.entries(headers)) {
    if (k.toLowerCase() === 'set-cookie') {
      out[k] = values.map((v) => {
        const next = v.replace(/;\s*Partitioned\b(?=\s*(;|$))/gi, '')
        if (next !== v) changed = true
        return next
      })
    } else {
      out[k] = values
    }
  }
  return changed ? out : headers
}

/**
 * UA Chromium + ` POETH/<версия>`: из UA Electron по умолчанию убираются токены
 * `Electron/…` и `<имя приложения>/…`. Один и тот же UA у окон и API —
 * `cf_clearance` Cloudflare привязан к UA.
 */
export function buildUserAgent(defaultUa: string, version: string, appNames: string[] = []): string {
  const names = ['Electron', 'POETH', 'poeth', ...appNames].map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const re = new RegExp(`\\s(?:${names.join('|')})\\/[^\\s]+`, 'g')
  const base = defaultUa.replace(re, '').replace(/\s{2,}/g, ' ').trim()
  return `${base} POETH/${version}`
}
