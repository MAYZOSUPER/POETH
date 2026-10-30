import { app, net } from 'electron'
import type { LootFilterError } from '@shared/types/lootFilter'
import { isLootFilterUrl } from '@shared/lootFilter/source'
import { getAnonSession } from '../net/session'

// Сеть фильтра лута (S53; tests/lootFilter/fetch.test.ts — с подменой electron). Как загрузка кода PoB (S35):
//  - только адреса isLootFilterUrl: https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/… и
//    https://codeload.github.com/NeverSinkDev/NeverSink-Filter/zip/refs/tags/<тег>;
//  - анонимная сессия poeth-anon: без cookies (credentials 'omit'), без кэша, без referrer;
//  - редиректы не идём никуда (адреса строим сами, GitHub отвечает на них сразу);
//  - потолок размера: заявленный Content-Length больше — отказ сразу, поток больше — обрыв;
//  - тип ответа — JSON у API и ZIP у архива; таймаут на весь запрос;
//  - User-Agent `POETH/<версия> (+https://github.com/MAYZOSUPER/POETH)` — API GitHub требует UA; без данных игрока,
//    без токенов и Authorization.
// В лог — только хост и код ошибки.

const CONTACT = 'https://github.com/MAYZOSUPER/POETH'

export function lootFilterUserAgent(version: string): string {
  return `POETH/${version} (+${CONTACT})`
}

export type FetchKind = 'json' | 'zip'

export interface FetchOptions {
  kind: FetchKind
  maxBytes: number
  timeoutMs: number
}

export type FetchResult = { ok: true; body: Buffer } | { ok: false; error: LootFilterError; status?: number }

/** Content-Type без параметров подходит к виду ответа. */
export function typeMatches(kind: FetchKind, header: string | string[] | undefined): boolean {
  const t = (Array.isArray(header) ? header[0] : header ?? '').split(';')[0].trim().toLowerCase()
  if (kind === 'json') return t === 'application/json' || t === 'application/vnd.github+json'
  return t === 'application/zip' || t === 'application/x-zip-compressed' || t === 'application/octet-stream'
}

function statusError(status: number, headers: Record<string, string | string[]>): LootFilterError {
  const remaining = headers['x-ratelimit-remaining']
  if (status === 429 || (status === 403 && (Array.isArray(remaining) ? remaining[0] : remaining) === '0')) return 'rate-limited'
  return 'http'
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '?'
  }
}

export function lootFilterGet(url: string, o: FetchOptions): Promise<FetchResult> {
  if (!isLootFilterUrl(url)) return Promise.resolve({ ok: false, error: 'refused' })
  return new Promise<FetchResult>((resolve) => {
    let settled = false
    let req: Electron.ClientRequest
    try {
      req = net.request({
        url,
        method: 'GET',
        session: getAnonSession(),
        credentials: 'omit',
        redirect: 'manual',
        cache: 'no-store',
        referrerPolicy: 'no-referrer'
      })
    } catch {
      resolve({ ok: false, error: 'network' })
      return
    }

    const finish = (res: FetchResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!res.ok) console.warn(`[lootfilter] ${hostOf(url)} → ${res.error}${res.status ? ` ${res.status}` : ''}`)
      resolve(res)
    }
    const fail = (error: LootFilterError, status?: number): void => {
      try {
        req.abort()
      } catch {
        // уже закрыт
      }
      finish({ ok: false, error, status })
    }
    const timer = setTimeout(() => fail('timeout'), o.timeoutMs)

    req.setHeader('User-Agent', lootFilterUserAgent(app.getVersion()))
    req.setHeader('Accept', o.kind === 'json' ? 'application/vnd.github+json' : 'application/zip')
    if (o.kind === 'json') req.setHeader('X-GitHub-Api-Version', '2022-11-28')

    req.on('redirect', () => fail('refused'))
    req.on('response', (res) => {
      const headers = res.headers as Record<string, string | string[]>
      if (res.statusCode !== 200) {
        fail(statusError(res.statusCode, headers), res.statusCode)
        return
      }
      if (!typeMatches(o.kind, headers['content-type'])) {
        fail('http', res.statusCode)
        return
      }
      const declared = Number(Array.isArray(headers['content-length']) ? headers['content-length'][0] : headers['content-length'])
      if (Number.isFinite(declared) && declared > o.maxBytes) {
        fail('too-large')
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        if (settled) return
        size += c.length
        if (size > o.maxBytes) {
          fail('too-large')
          return
        }
        chunks.push(Buffer.from(c))
      })
      res.on('end', () => finish({ ok: true, body: Buffer.concat(chunks) }))
      res.on('error', () => fail('network'))
    })
    req.on('error', () => fail('network'))
    req.end()
  })
}

/** Потолки: ответ API релиза и дерева (~40 КБ сейчас), архив тега (~8 МБ сейчас). */
export const JSON_MAX_BYTES = 2 * 1024 * 1024
export const ZIP_MAX_BYTES = 40 * 1024 * 1024
export const JSON_TIMEOUT_MS = 15_000
export const ZIP_TIMEOUT_MS = 120_000

export async function getJson(url: string): Promise<{ ok: true; json: unknown } | { ok: false; error: LootFilterError }> {
  const r = await lootFilterGet(url, { kind: 'json', maxBytes: JSON_MAX_BYTES, timeoutMs: JSON_TIMEOUT_MS })
  if (!r.ok) return r
  try {
    return { ok: true, json: JSON.parse(r.body.toString('utf8')) }
  } catch {
    return { ok: false, error: 'bad-release' }
  }
}
