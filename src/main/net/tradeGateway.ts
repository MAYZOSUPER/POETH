// Шлюз трейд-API (ядро без electron — транспорт и URL передаются снаружи; боевой
// экземпляр собирает src/main/net/index.ts, тесты — tests/net/tradeGateway.test.ts).
//
// Правила:
//  - очередь на каждую политику лимитов, interactive (Ctrl+D) всегда впереди background;
//  - fail-fast: если ждать дольше maxWaitMs (interactive — 1.5 с), сразу ошибка
//    {code:'rate-limited', retryAfterMs} — без вечного спиннера, UI показывает отсчёт;
//  - background (live search) — только если в каждом окне остаётся ≥ 25 % (rateLimit.ts);
//  - после 429 — не больше одного повтора, и только если укладываемся в maxWaitMs;
//  - кэш 5 минут по хэшу (метод + URL + тело): повторный Ctrl+D бесплатен;
//    одинаковые запросы в полёте склеиваются.
// Возвращаемые data общие для склеенных запросов и кэша — не мутировать.

import { createHash } from 'crypto'
import type { GameId, SiteHost } from '@shared/games'
import type { NetError, NetErrorCode } from '@shared/types/auth'
import {
  RateLimitRegistry,
  headerGetter,
  parseRetryAfterMs,
  type PolicyKind,
  type PolicyLimiter,
  type PolicySnapshot,
  type Priority
} from './rateLimit'
import { isBlockedApiResponse } from './guards'

export const INTERACTIVE_MAX_WAIT_MS = 1500
export const BACKGROUND_MAX_WAIT_MS = 120_000
export const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX_ENTRIES = 300
/** 429 без retry-after и без состояния окон — всё равно пауза. */
const FALLBACK_429_BLOCK_MS = 10_000

/** Запрос к трейд-API: URL строит games.ts (apiUrl) — руками не склеивать. */
export interface TradeApiRequest {
  method: 'GET' | 'POST'
  /** путь после /api/<trade|trade2>/: 'search', 'fetch', 'exchange', 'data/leagues'… */
  endpoint: string
  /** уже закодированный хвост: лига, id через запятую, '?query=…' */
  rest?: string
  /** JSON-тело для POST */
  body?: unknown
  /** по умолчанию poe1 */
  game?: GameId
  /** по умолчанию — настройка siteHost (PoE1) / www (PoE2) */
  host?: SiteHost
}

export interface GatewayRequest {
  kind: PolicyKind
  priority?: Priority
  /** сколько можно ждать места в лимите; по умолчанию 1.5 с / 120 с */
  maxWaitMs?: number
  req: TradeApiRequest
  /** кэшировать успешный ответ на 5 минут (по умолчанию да) */
  cache?: boolean
}

export interface TransportRequest {
  url: string
  method: 'GET' | 'POST'
  body?: string
}

export interface TransportResponse {
  status: number
  /** имена в нижнем регистре */
  headers: Record<string, string>
  body: string
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>

export type GatewayResult<T> =
  | { ok: true; data: T; status: number; cached: boolean }
  | { ok: false; error: NetError }

export interface GatewayOptions {
  transport: Transport
  /** URL запроса (games.ts apiUrl); бросает — запрос отклоняется как bad-request */
  resolveUrl: (req: TradeApiRequest) => string | Promise<string>
  limits?: RateLimitRegistry
  now?: () => number
  cacheTtlMs?: number
  /** диагностика (строки уже без секретов: тела/cookie сюда не попадают) */
  log?: (msg: string) => void
}

interface Pending {
  seq: number
  kind: PolicyKind
  priority: Priority
  deadline: number
  url: string
  method: 'GET' | 'POST'
  body?: string
  retried: boolean
  resolve: (r: GatewayResult<unknown>) => void
}

function fail(code: NetErrorCode, extra: Omit<NetError, 'code'> = {}): { ok: false; error: NetError } {
  return { ok: false, error: { code, ...extra } }
}

function rateLimited(waitMs: number): { ok: false; error: NetError } {
  return fail('rate-limited', Number.isFinite(waitMs) ? { retryAfterMs: Math.ceil(Math.max(0, waitMs)) } : {})
}

function apiErrorMessage(json: unknown): string | undefined {
  const err = (json as { error?: { message?: unknown } } | null)?.error
  return typeof err?.message === 'string' ? err.message.slice(0, 300) : undefined
}

/** Ответ API → результат шлюза (HTML/Cloudflare → blocked). */
export function classifyResponse<T>(res: TransportResponse): GatewayResult<T> {
  const status = res.status
  if (isBlockedApiResponse(res)) return fail('blocked', { status })
  let json: unknown
  try {
    json = JSON.parse(res.body)
  } catch {
    json = undefined
  }
  if (status >= 200 && status < 300) {
    return json === undefined ? fail('bad-response', { status }) : { ok: true, data: json as T, status, cached: false }
  }
  const message = apiErrorMessage(json)
  const extra = message ? { status, message } : { status }
  if (status === 400) return fail('bad-request', extra)
  if (status === 401) return fail('unauthorized', extra)
  if (status === 403) return fail('forbidden', extra)
  if (status === 404) return fail('not-found', extra)
  if (status === 429) return fail('rate-limited', extra)
  if (status >= 500) return fail('server', extra)
  return fail('bad-response', extra)
}

export function cacheKey(method: string, url: string, body?: string): string {
  return createHash('sha1')
    .update(`${method} ${url}\n${body ?? ''}`)
    .digest('hex')
}

const RANK: Record<Priority, number> = { interactive: 0, background: 1 }

export class TradeGateway {
  readonly limits: RateLimitRegistry
  private readonly now: () => number
  private readonly ttl: number
  private queue: Pending[] = []
  private seq = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private cache = new Map<string, { at: number; status: number; body: string }>()
  private inflight = new Map<string, Promise<GatewayResult<unknown>>>()

  constructor(private readonly opts: GatewayOptions) {
    this.now = opts.now ?? Date.now
    this.ttl = opts.cacheTtlMs ?? CACHE_TTL_MS
    this.limits = opts.limits ?? new RateLimitRegistry({}, this.now())
  }

  async request<T = unknown>(r: GatewayRequest): Promise<GatewayResult<T>> {
    const priority: Priority = r.priority ?? 'interactive'
    const maxWait = r.maxWaitMs ?? (priority === 'interactive' ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS)
    let url: string
    try {
      url = await this.opts.resolveUrl(r.req)
    } catch {
      return fail('bad-request')
    }
    const body = r.req.body === undefined ? undefined : JSON.stringify(r.req.body)
    const key = r.cache === false ? null : cacheKey(r.req.method, url, body)

    if (key) {
      const hit = this.cacheGet(key)
      if (hit) return { ok: true, data: JSON.parse(hit.body) as T, status: hit.status, cached: true }
      const joined = this.inflight.get(`${priority}:${key}`)
      if (joined) return joined as Promise<GatewayResult<T>>
    }

    const p = this.enqueue(r.kind, priority, maxWait, url, r.req.method, body).then((res) => {
      if (key && res.ok) this.cachePut(key, res.status, res.data)
      return res
    })
    if (key) {
      const k = `${priority}:${key}`
      this.inflight.set(k, p)
      void p.then(() => this.inflight.delete(k))
    }
    return p as Promise<GatewayResult<T>>
  }

  /** Оценка ожидания для запроса вида kind (для UI/планировщиков S6). */
  estimateWaitMs(kind: PolicyKind, priority: Priority = 'interactive'): number {
    const lim = this.limits.get(kind)
    return lim.waitMs(priority, this.now(), this.aheadOf(lim, priority))
  }

  snapshot(): { queued: number; cached: number; policies: PolicySnapshot[] } {
    return { queued: this.queue.length, cached: this.cache.size, policies: this.limits.snapshot(this.now()) }
  }

  clearCache(): void {
    this.cache.clear()
  }

  // ---- очередь ----

  private aheadOf(lim: PolicyLimiter, priority: Priority): number {
    let n = 0
    for (const q of this.queue) {
      if (this.limits.get(q.kind) !== lim) continue
      if (priority === 'background' || q.priority === 'interactive') n++
    }
    return n
  }

  private enqueue(
    kind: PolicyKind,
    priority: Priority,
    maxWait: number,
    url: string,
    method: 'GET' | 'POST',
    body: string | undefined
  ): Promise<GatewayResult<unknown>> {
    const now = this.now()
    const lim = this.limits.get(kind)
    const wait = lim.waitMs(priority, now, this.aheadOf(lim, priority))
    if (wait > maxWait) {
      this.opts.log?.(`[gateway] ${kind}/${priority}: fail-fast, wait ${Math.round(wait)} ms`)
      return Promise.resolve(rateLimited(wait))
    }
    return new Promise((resolve) => {
      this.queue.push({
        seq: this.seq++,
        kind,
        priority,
        deadline: now + maxWait,
        url,
        method,
        body,
        retried: false,
        resolve
      })
      this.pump()
    })
  }

  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const now = this.now()
    this.queue.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.seq - b.seq)
    const ahead = new Map<PolicyLimiter, number>()
    let next = Infinity
    for (const item of [...this.queue]) {
      const lim = this.limits.get(item.kind)
      const before = ahead.get(lim) ?? 0
      const wait = lim.waitMs(item.priority, now, before)
      if (wait <= 0 && before === 0) {
        this.remove(item)
        this.dispatch(item, lim, now)
      } else if (now + wait > item.deadline) {
        // место не освободится до дедлайна — не держим пользователя
        this.remove(item)
        item.resolve(rateLimited(wait))
      } else {
        ahead.set(lim, before + 1)
        next = Math.min(next, wait)
      }
    }
    if (this.queue.length && Number.isFinite(next)) {
      this.timer = setTimeout(() => this.pump(), Math.max(5, Math.ceil(next)))
    }
  }

  private remove(item: Pending): void {
    const i = this.queue.indexOf(item)
    if (i >= 0) this.queue.splice(i, 1)
  }

  private dispatch(item: Pending, lim: PolicyLimiter, now: number): void {
    const ticket = lim.record(now)
    void this.send(item, ticket)
  }

  private async send(item: Pending, ticket: number): Promise<void> {
    let res: TransportResponse
    try {
      res = await this.opts.transport({ url: item.url, method: item.method, body: item.body })
    } catch {
      this.limits.get(item.kind).complete(ticket, this.now())
      item.resolve(fail('network'))
      this.pump()
      return
    }
    const now = this.now()
    const lim = this.limits.applyHeaders(item.kind, headerGetter(res.headers), now)
    lim.complete(ticket, now)

    if (res.status === 429) {
      if (lim.blockedUntil <= now) lim.block(now + FALLBACK_429_BLOCK_MS, now)
      const wait = lim.waitMs(item.priority, now)
      this.opts.log?.(`[gateway] ${item.kind}: 429, wait ${Math.round(wait)} ms, retried=${item.retried}`)
      if (!item.retried && now + wait <= item.deadline) {
        item.retried = true
        this.queue.push(item)
        this.pump()
        return
      }
      item.resolve(rateLimited(Math.max(wait, parseRetryAfterMs(res.headers['retry-after']))))
      this.pump()
      return
    }

    const result = classifyResponse(res)
    if (!result.ok) this.opts.log?.(`[gateway] ${item.kind}: ${result.error.code} (${res.status})`)
    item.resolve(result)
    this.pump()
  }

  // ---- кэш ----

  private cacheGet(key: string): { status: number; body: string } | null {
    const e = this.cache.get(key)
    if (!e) return null
    if (this.now() - e.at > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return e
  }

  private cachePut(key: string, status: number, data: unknown): void {
    this.cache.delete(key)
    this.cache.set(key, { at: this.now(), status, body: JSON.stringify(data) })
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}
