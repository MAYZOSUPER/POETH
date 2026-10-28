import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { getAnonSession, getUserAgent } from '../net/session'

// Кэш иконок валюты (S18). Renderer просит `poeth://icon/?u=<https://web.poecdn.com/…>` (адрес — из данных APT),
// main качает картинку сессией без cookies (только web.poecdn.com, без редиректов), проверяет тип
// (Content-Type PNG/WebP + сигнатура файла) и размер, хранит в userData/icons/<sha256>.png|webp.
// Нет сети, не та картинка или лимит — 404: renderer рисует прежний кружок ui-coin. CSP окон не расширяется:
// внешние картинки в окна не попадают, только через poeth://. Иконки GGG в репозитории не лежат.

export const ICON_HOST = 'web.poecdn.com'
/** Иконка валюты — 3–15 КБ; больше — не она. */
export const ICON_MAX_BYTES = 256 * 1024
/** Сколько файлов держим на диске (страховка от бесконечного роста, иконок валюты ~650). */
export const ICON_MAX_FILES = 2000
const RETRY_MS = 10 * 60_000
const TIMEOUT_MS = 15_000
const MAX_PARALLEL = 4

export type IconType = 'image/png' | 'image/webp'
export interface IconHit {
  bytes: Uint8Array
  type: IconType
}

const EXT: Record<IconType, string> = { 'image/png': '.png', 'image/webp': '.webp' }

/** Адрес иконки: только https://web.poecdn.com/…png|webp без логина, порта и якоря; иначе null. */
export function iconSourceUrl(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 2048) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.hostname !== ICON_HOST || u.port || u.username || u.password) return null
  if (!/\.(png|webp)$/i.test(u.pathname)) return null
  u.hash = ''
  return u
}

/** Тип картинки по сигнатуре: PNG (89 50 4E 47 0D 0A 1A 0A) или WebP (RIFF….WEBP). */
export function sniffIcon(b: Uint8Array): IconType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return 'image/png'
  }
  const ascii = (from: number, to: number): string => String.fromCharCode(...b.subarray(from, to))
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Content-Type ответа без параметров, если он из allowlist. */
function headerType(v: string | null): IconType | null {
  const t = (v ?? '').split(';')[0].trim().toLowerCase()
  return t === 'image/png' || t === 'image/webp' ? t : null
}

/** Тело ответа целиком, но не больше max байт (поток обрывается на превышении). */
async function readLimited(res: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('content-length'))
  if (Number.isFinite(len) && len > max) return null
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer())
    return b.length > max ? null : b
  }
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export type IconFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>

export interface IconCacheOptions {
  /** userData/icons */
  dir: string
  fetch: IconFetch
  maxBytes?: number
  maxFiles?: number
  retryMs?: number
  timeoutMs?: number
  now?: () => number
}

export interface IconCache {
  /** Иконка по адресу из данных: с диска, иначе скачать и сохранить; null — нет/нельзя. */
  get(raw: string | null | undefined): Promise<IconHit | null>
}

export function createIconCache(opts: IconCacheOptions): IconCache {
  const maxBytes = opts.maxBytes ?? ICON_MAX_BYTES
  const maxFiles = opts.maxFiles ?? ICON_MAX_FILES
  const retryMs = opts.retryMs ?? RETRY_MS
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const now = opts.now ?? Date.now
  const failedUntil = new Map<string, number>()
  const inflight = new Map<string, Promise<IconHit | null>>()
  const queue: Array<() => void> = []
  let running = 0
  let files: number | null = null

  const slot = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r))
    running++
    try {
      return await fn()
    } finally {
      running--
      queue.shift()?.()
    }
  }

  const fromDisk = async (key: string): Promise<IconHit | null> => {
    for (const type of Object.keys(EXT) as IconType[]) {
      try {
        const bytes = new Uint8Array(await fs.readFile(path.join(opts.dir, key + EXT[type])))
        if (bytes.length <= maxBytes && sniffIcon(bytes) === type) return { bytes, type }
      } catch {
        // нет файла этого типа
      }
    }
    return null
  }

  const store = async (key: string, hit: IconHit): Promise<void> => {
    if (files === null) files = (await fs.readdir(opts.dir).catch(() => [] as string[])).length
    if (files >= maxFiles) return // отдаём из памяти, на диск больше не пишем
    await fs.mkdir(opts.dir, { recursive: true })
    const file = path.join(opts.dir, key + EXT[hit.type])
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, hit.bytes)
    await fs.rename(tmp, file)
    files++
  }

  const download = async (url: URL): Promise<IconHit | null> => {
    const res = await opts.fetch(url.href, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status !== 200) return null
    const type = headerType(res.headers.get('content-type'))
    if (!type) return null
    const bytes = await readLimited(res, maxBytes)
    if (!bytes || sniffIcon(bytes) !== type) return null
    return { bytes, type }
  }

  const load = async (url: URL, key: string): Promise<IconHit | null> => {
    const cached = await fromDisk(key)
    if (cached) return cached
    if ((failedUntil.get(key) ?? 0) > now()) return null
    try {
      const hit = await slot(() => download(url))
      if (!hit) throw new Error('bad icon')
      await store(key, hit).catch((e: unknown) => console.warn('[icons] store failed:', e instanceof Error ? e.message : e))
      failedUntil.delete(key)
      return hit
    } catch {
      failedUntil.set(key, now() + retryMs)
      return null
    }
  }

  return {
    get(raw) {
      const url = iconSourceUrl(raw)
      if (!url) return Promise.resolve(null)
      const key = createHash('sha256').update(url.href).digest('hex').slice(0, 40)
      let p = inflight.get(key)
      if (!p) {
        p = load(url, key).finally(() => inflight.delete(key))
        inflight.set(key, p)
      }
      return p
    }
  }
}

let appCache: IconCache | null = null

/** Ответ протокола `poeth://icon/?u=…` (main/protocol.ts); 404 — renderer покажет кружок ui-coin. */
export async function iconResponse(raw: string | null): Promise<Response> {
  appCache ??= createIconCache({
    dir: path.join(app.getPath('userData'), 'icons'),
    fetch: (url, init) =>
      getAnonSession().fetch(url, {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        headers: { 'User-Agent': getUserAgent() }
      })
  })
  const hit = await appCache.get(raw)
  if (!hit) return new Response('Not found', { status: 404 })
  return new Response(hit.bytes, {
    headers: { 'Content-Type': hit.type, 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }
  })
}
