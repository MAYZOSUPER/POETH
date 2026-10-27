import { net } from 'electron'
import { isAccountUrl, maskSecrets } from './guards'
import { getAccountSession, getAnonSession, getUserAgent } from './session'

// HTTP через сетевой стек Chromium (проходит Cloudflare, без CORS). Хосты из allowlist
// (guards.ACCOUNT_HOSTS) идут сессией аккаунта с её cookies (useSessionCookies), все
// прочие — сессией без cookies. Заголовок Cookie руками не ставится никогда.
// Логи — только через netLog (маскирует cookie/POESESSID); включаются POETH_NET_DEBUG=1.

export interface HttpRequest {
  url: string
  method?: 'GET' | 'POST'
  /** доп. заголовки (Cookie/Authorization игнорируются) */
  headers?: Record<string, string>
  body?: string
  /** по умолчанию 20 с */
  timeoutMs?: number
  /** по умолчанию application/json */
  accept?: string
}

export interface HttpResponse {
  status: number
  /** имена в нижнем регистре */
  headers: Record<string, string>
  body: string
  /** итоговый URL после редиректов */
  url: string
}

export type HttpErrorCode = 'network' | 'timeout' | 'invalid-url' | 'redirect-blocked' | 'too-large'

export class HttpError extends Error {
  constructor(
    public readonly code: HttpErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'HttpError'
  }
}

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_BODY_BYTES = 32 * 1024 * 1024
const MAX_REDIRECTS = 5
const FORBIDDEN_HEADERS = new Set(['cookie', 'authorization', 'host', 'user-agent', 'content-length'])
const DEBUG = process.env.POETH_NET_DEBUG === '1'

/** Лог сети без секретов. Предупреждения пишутся всегда, отладка — с POETH_NET_DEBUG=1. */
export function netLog(level: 'debug' | 'warn', ...parts: unknown[]): void {
  if (level === 'debug' && !DEBUG) return
  const text = parts
    .map((p) => (typeof p === 'string' ? p : p instanceof Error ? p.message : JSON.stringify(p)))
    .join(' ')
  const line = `[net] ${maskSecrets(text)}`
  if (level === 'warn') console.warn(line)
  else console.log(line)
}

function normalizeHeaders(raw: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase()
    if (key === 'set-cookie') continue // cookies обрабатывает сессия; дальше main им не нужны
    out[key] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return '?'
  }
}

/**
 * Запрос через net.request. pathofexile.com (+ web.poecdn.com) — сессией аккаунта
 * с cookies; остальное — анонимной сессией. Редиректы: только https и не из
 * allowlist-хоста наружу (cookies аккаунта не уходят на чужой хост).
 */
export function httpRequest(r: HttpRequest): Promise<HttpResponse> {
  let start: URL
  try {
    start = new URL(r.url)
  } catch {
    return Promise.reject(new HttpError('invalid-url'))
  }
  if (start.protocol !== 'https:') return Promise.reject(new HttpError('invalid-url', 'https only'))

  const account = isAccountUrl(r.url)
  const method = r.method ?? 'GET'

  return new Promise<HttpResponse>((resolve, reject) => {
    let finalUrl = r.url
    let redirects = 0
    let settled = false
    const req = account
      ? net.request({
          url: r.url,
          method,
          session: getAccountSession(),
          useSessionCookies: true,
          redirect: 'manual'
        })
      : net.request({
          url: r.url,
          method,
          session: getAnonSession(),
          credentials: 'omit',
          redirect: 'manual'
        })

    const finish = (err: HttpError | null, res?: HttpResponse): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        netLog('debug', method, shortUrl(r.url), '→', err.code)
        reject(err)
      } else if (res) {
        netLog('debug', method, shortUrl(r.url), '→', res.status)
        resolve(res)
      }
    }

    const timer = setTimeout(() => {
      req.abort()
      finish(new HttpError('timeout'))
    }, r.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    req.setHeader('User-Agent', getUserAgent())
    req.setHeader('Accept', r.accept ?? 'application/json')
    for (const [k, v] of Object.entries(r.headers ?? {})) {
      if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) req.setHeader(k, v)
    }
    if (r.body !== undefined && !Object.keys(r.headers ?? {}).some((k) => k.toLowerCase() === 'content-type')) {
      req.setHeader('Content-Type', 'application/json')
    }

    req.on('redirect', (_status, _method, redirectUrl) => {
      let next: URL | null = null
      try {
        next = new URL(redirectUrl)
      } catch {
        next = null
      }
      const ok =
        !!next &&
        next.protocol === 'https:' &&
        ++redirects <= MAX_REDIRECTS &&
        // из сессии аккаунта — только на хосты allowlist (иначе стоп, cookies не уходят наружу)
        (!account || isAccountUrl(redirectUrl))
      if (!ok) {
        req.abort()
        finish(new HttpError('redirect-blocked'))
        return
      }
      finalUrl = redirectUrl
      req.followRedirect()
    })

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY_BYTES) {
          req.abort()
          finish(new HttpError('too-large'))
          return
        }
        chunks.push(Buffer.from(c))
      })
      res.on('end', () =>
        finish(null, {
          status: res.statusCode,
          headers: normalizeHeaders(res.headers as Record<string, string | string[]>),
          body: Buffer.concat(chunks).toString('utf8'),
          url: finalUrl
        })
      )
      res.on('error', () => finish(new HttpError('network')))
    })
    req.on('error', (e) => finish(new HttpError('network', maskSecrets(e.message))))

    if (r.body !== undefined) req.write(r.body)
    req.end()
  })
}
