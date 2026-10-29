import { app, net } from 'electron'
import { POB_CODE_MAX_CHARS } from '@shared/pob/decode'
import type { PobFetchError } from '@shared/pob/import'
import { isPobFetchUrl } from '@shared/pob/links'
import { getAnonSession } from '../net/session'

// Сырой код PoB по ссылке игрока (S35; tests/pob/fetch.test.ts — с подменой electron).
//  - только https и хосты POB_FETCH_HOSTS (pobb.in, pastebin, pob.codes, poedb, Maxroll, rentry);
//  - анонимная сессия без cookies (poeth-anon, как иконки и данные): credentials 'omit', без кэша, без referrer;
//  - редиректы вручную и только внутри allowlist, не больше трёх;
//  - таймаут 10 с на всё, ответ ≤ 1 МБ (обрыв на превышении), только 200 и text/plain;
//  - честный User-Agent `POETH/<версия> (+https://github.com/MAYZOSUPER/POETH)` — просьба pobb.in и poedb;
//  - один запрос на одно действие игрока: пока идёт загрузка, вторая сразу получает 'busy'; повторов нет.
// В лог пишется только хост и код ошибки — без адреса пасты.

export const POB_FETCH_TIMEOUT_MS = 10_000
export const POB_FETCH_MAX_BYTES = POB_CODE_MAX_CHARS
const MAX_REDIRECTS = 3
export const POB_CONTACT = 'https://github.com/MAYZOSUPER/POETH'

export type PobFetchResult = { ok: true; code: string; url: string } | { ok: false; error: PobFetchError; status?: number }

export function pobUserAgent(version: string): string {
  return `POETH/${version} (+${POB_CONTACT})`
}

/**
 * Content-Type — text/plain (с параметрами). poedb.tw отвечает заголовком со значением
 * «Content-type: text/plain» — имя внутри значения тоже принимаем.
 */
export function isPlainText(v: string | string[] | undefined): boolean {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase().replace(/^content-type\s*:\s*/, '')
  return s.split(';')[0].trim() === 'text/plain'
}

function statusError(status: number): PobFetchError {
  if (status === 404 || status === 410) return 'not-found'
  if (status === 401 || status === 403) return 'blocked'
  if (status === 429) return 'rate-limited'
  return 'http'
}

let inFlight = false

/** Загрузить сырой код по адресу из parsePobInput (rawUrl). */
export function fetchPobCode(rawUrl: string): Promise<PobFetchResult> {
  if (!isPobFetchUrl(rawUrl)) return Promise.resolve({ ok: false, error: 'bad-url' })
  if (inFlight) return Promise.resolve({ ok: false, error: 'busy' })
  inFlight = true
  return request(rawUrl)
    .catch((): PobFetchResult => ({ ok: false, error: 'network' })) // net.request бросил синхронно
    .finally(() => {
      inFlight = false
    })
}

function request(rawUrl: string): Promise<PobFetchResult> {
  return new Promise<PobFetchResult>((resolve) => {
    let finalUrl = rawUrl
    let redirects = 0
    let settled = false
    const req = net.request({
      url: rawUrl,
      method: 'GET',
      session: getAnonSession(),
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    })

    const finish = (res: PobFetchResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!res.ok) console.warn(`[pob] ${hostOf(rawUrl)} → ${res.error}${res.status ? ` ${res.status}` : ''}`)
      resolve(res)
    }
    const fail = (error: PobFetchError, status?: number): void => {
      try {
        req.abort()
      } catch {
        // уже закрыт
      }
      finish({ ok: false, error, status })
    }

    const timer = setTimeout(() => fail('timeout'), POB_FETCH_TIMEOUT_MS)

    req.setHeader('User-Agent', pobUserAgent(app.getVersion()))
    req.setHeader('Accept', 'text/plain')

    req.on('redirect', (_status, _method, redirectUrl) => {
      if (++redirects > MAX_REDIRECTS || !isPobFetchUrl(redirectUrl)) {
        fail('redirect')
        return
      }
      finalUrl = redirectUrl
      req.followRedirect()
    })

    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        fail(statusError(res.statusCode), res.statusCode)
        return
      }
      if (!isPlainText(res.headers['content-type'])) {
        fail('not-text', res.statusCode)
        return
      }
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > POB_FETCH_MAX_BYTES) {
        fail('too-large')
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        if (settled) return
        size += c.length
        if (size > POB_FETCH_MAX_BYTES) {
          fail('too-large')
          return
        }
        chunks.push(Buffer.from(c))
      })
      res.on('end', () => finish({ ok: true, code: Buffer.concat(chunks).toString('utf8').trim(), url: finalUrl }))
      res.on('error', () => fail('network'))
    })
    req.on('error', () => fail('network'))
    req.end()
  })
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '?'
  }
}
