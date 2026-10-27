import { EventEmitter } from 'events'
import type { BlacklistHit, BlacklistStatus } from '@shared/types'
import {
  BLACKLIST_MAX_AGE_MS,
  BLACKLIST_URL,
  buildBlacklistIndex,
  checkBlacklist,
  parseBlacklistCsv,
  type BlacklistIndex
} from '@shared/deals/blacklist'
import { readJson, writeJsonAtomic } from './atomicJson'

// Чёрный список PoE Hub (The-Forbidden-Trove/ForbiddenTroveBlacklist, MIT): скачать blacklist.csv,
// держать кэш на диске (userData/cache/poehub-blacklist.json), обновлять не чаще раза в сутки.
// Сеть — за интерфейсом TextFetcher: сейчас net.fetch (ipc/deals.ts), после слияния S3 —
// net/http.ts (httpRequest, сессия без cookies). Без electron — тестируется с фейковой сетью.
//
// События: 'status' (BlacklistStatus).

export interface FetchResult {
  status: number
  body: string
  etag?: string
}

export type TextFetcher = (url: string, opts: { etag?: string; timeoutMs: number }) => Promise<FetchResult>

interface CacheFile {
  url: string
  fetchedAt: number
  etag?: string
  csv: string
}

const FETCH_TIMEOUT_MS = 30_000
/** Как часто проверять возраст кэша, пока приложение запущено. */
const CHECK_INTERVAL_MS = 60 * 60_000
/** Больше — не список, а что-то не то. */
const MAX_CSV_BYTES = 16 * 1024 * 1024
/** После ошибки не долбить сеть чаще. */
const RETRY_AFTER_ERROR_MS = 15 * 60_000

export interface BlacklistServiceOptions {
  cacheFile: string
  fetcher: TextFetcher
  now?: () => number
  url?: string
}

export class BlacklistService extends EventEmitter {
  private index: BlacklistIndex = buildBlacklistIndex([])
  private fetchedAt: number | null = null
  private etag: string | undefined
  private loading: Promise<void> | null = null
  private error: string | null = null
  private lastErrorAt = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private cacheLoaded = false
  private readonly now: () => number
  private readonly url: string

  constructor(private readonly opts: BlacklistServiceOptions) {
    super()
    this.now = opts.now ?? Date.now
    this.url = opts.url ?? BLACKLIST_URL
  }

  status(): BlacklistStatus {
    return { count: this.index.size, fetchedAt: this.fetchedAt, loading: this.loading !== null, error: this.error }
  }

  check(who: { account?: string; character?: string }): BlacklistHit | null {
    return checkBlacklist(this.index, who)
  }

  /** Поднять кэш с диска (без сети; обновление — refreshIfStale). Повторный вызов — no-op. */
  async loadCache(): Promise<void> {
    if (this.cacheLoaded) return
    this.cacheLoaded = true
    const cache = await readJson<CacheFile | null>(this.opts.cacheFile, null)
    if (cache && typeof cache.csv === 'string' && cache.url === this.url) {
      this.index = buildBlacklistIndex(parseBlacklistCsv(cache.csv))
      this.fetchedAt = typeof cache.fetchedAt === 'number' ? cache.fetchedAt : null
      this.etag = cache.etag
    }
    this.emitStatus()
  }

  isStale(): boolean {
    return this.fetchedAt === null || this.now() - this.fetchedAt >= BLACKLIST_MAX_AGE_MS
  }

  async refreshIfStale(): Promise<void> {
    await this.loadCache()
    if (!this.isStale()) return
    if (this.error && this.now() - this.lastErrorAt < RETRY_AFTER_ERROR_MS) return
    await this.refresh()
  }

  /** Скачать список (If-None-Match по ETag). Ошибка не трогает рабочий кэш. */
  refresh(): Promise<void> {
    if (!this.loading) {
      this.loading = this.doRefresh().finally(() => {
        this.loading = null
        this.emitStatus()
      })
      this.emitStatus()
    }
    return this.loading
  }

  private async doRefresh(): Promise<void> {
    await this.loadCache()
    try {
      const res = await this.opts.fetcher(this.url, { etag: this.etag, timeoutMs: FETCH_TIMEOUT_MS })
      const now = this.now()
      if (res.status === 304) {
        this.fetchedAt = now
        await this.saveMeta()
        this.error = null
        return
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      if (res.body.length > MAX_CSV_BYTES) throw new Error('слишком большой ответ')
      const entries = parseBlacklistCsv(res.body)
      if (entries.length === 0) throw new Error('пустой список')
      this.index = buildBlacklistIndex(entries)
      this.fetchedAt = now
      this.etag = res.etag
      await writeJsonAtomic(this.opts.cacheFile, {
        url: this.url,
        fetchedAt: now,
        etag: res.etag,
        csv: res.body
      } satisfies CacheFile)
      this.error = null
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.lastErrorAt = this.now()
      console.warn('[deals] чёрный список PoE Hub не обновлён:', this.error)
    }
  }

  /** 304: тот же список — обновить только время в кэше. */
  private async saveMeta(): Promise<void> {
    const cache = await readJson<CacheFile | null>(this.opts.cacheFile, null)
    if (cache) await writeJsonAtomic(this.opts.cacheFile, { ...cache, fetchedAt: this.fetchedAt ?? this.now() })
  }

  /** Раз в час проверять возраст кэша (обновление — раз в сутки). */
  startAutoRefresh(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refreshIfStale(), CHECK_INTERVAL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private emitStatus(): void {
    this.emit('status', this.status())
  }
}
