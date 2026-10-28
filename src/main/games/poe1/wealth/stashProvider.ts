// Источник содержимого стэша (S11a) за интерфейсом StashProvider: сейчас — legacy-эндпоинты
// сайта на сессии аккаунта, позже — OAuth (регистрация приложений у GGG пока закрыта).
//
// Ядро без electron: транспорт и статус входа передаются снаружи (боевой экземпляр собирает
// src/main/ipc/wealth.ts, тесты — tests/wealth/limiter.test.ts). Запросы идут через отдельный
// экземпляр шлюза S3 со своим лимитером политики backend-item-request-limit (30/мин, 90/30 мин,
// 180/2 ч по IP), фоновым приоритетом и резервом 25 %: лимиты трейда (прайс-чек) он не трогает,
// а сайт в браузере и другие инструменты сохраняют запас. Имя аккаунта в логи не попадает
// (шлюз пишет только вид запроса и код ответа).

import type { NetError } from '@shared/types/auth'
import type { WealthError } from '@shared/types/wealth'
import { parseStashResponse, type ParsedStash } from '@shared/wealth/stash'
import { normalizeAccountName, STASH_DEFAULT_WINDOWS, type BudgetWindow } from '@shared/wealth/tabs'
import { RateLimitRegistry } from '../../../net/rateLimit'
import { TradeGateway, type Transport, type TradeApiRequest } from '../../../net/tradeGateway'

export type StashResult<T> = { ok: true; data: T } | { ok: false; error: WealthError }

export interface StashQuery {
  account: string
  league: string
  /** tabIndex */
  index: number
}

export interface StashProvider {
  readonly name: 'legacy' | 'oauth'
  /** имя аккаунта текущей сессии сайта (без ввода); null — не удалось узнать */
  sessionAccountName(): Promise<string | null>
  /** список вкладок + предметы вкладки `index` */
  fetchTabs(q: StashQuery): Promise<StashResult<ParsedStash>>
  /** предметы одной вкладки */
  fetchTab(q: StashQuery): Promise<StashResult<ParsedStash>>
  /** окна лимита сайта (после первого ответа — из заголовков) */
  windows(): BudgetWindow[]
}

/** Стэш берём у www: имена и свойства на английском — по ним сопоставляются цены. */
export const STASH_HOST = 'www.pathofexile.com'
/** Сколько один запрос стэша может ждать места в лимите (фон, снимок показывает ожидание). */
export const STASH_MAX_WAIT_MS = 5 * 60_000

export interface LegacyDeps {
  transport: Transport
  /** вошли ли (401/403 без входа → «войдите», со входом 403 → чужой аккаунт) */
  loggedIn: () => boolean
  /** имя из статуса входа S3 (ссылка на профиль) */
  statusAccountName: () => string | undefined
  now?: () => number
  log?: (msg: string) => void
  /** для тестов — свой реестр лимитов */
  limits?: RateLimitRegistry
}

export function stashUrl(endpoint: string, rest = ''): string {
  if (!/^[a-z-]+$/.test(endpoint)) throw new Error('bad endpoint')
  return `https://${STASH_HOST}/character-window/${endpoint}${rest}`
}

export function stashQueryString(q: StashQuery, tabs: boolean): string {
  const p = new URLSearchParams({
    accountName: q.account,
    realm: 'pc',
    league: q.league,
    tabs: tabs ? '1' : '0',
    tabIndex: String(Math.max(0, Math.trunc(q.index)))
  })
  return `?${p.toString()}`
}

/** Ошибка шлюза → ошибка домена (что показать пользователю). */
export function toWealthError(e: NetError, loggedIn: boolean, now: number): WealthError {
  switch (e.code) {
    case 'unauthorized':
      return { code: 'auth' }
    case 'forbidden':
      return { code: loggedIn ? 'forbidden' : 'auth' }
    case 'blocked':
      return { code: 'blocked' }
    case 'rate-limited':
      return e.retryAfterMs !== undefined ? { code: 'rate-limited', retryAt: now + e.retryAfterMs } : { code: 'rate-limited' }
    case 'not-found':
    case 'bad-request':
      return { code: 'not-found' }
    case 'server':
      return { code: 'server' }
    case 'bad-response':
      return { code: 'bad-response' }
    default:
      return { code: 'network' }
  }
}

export class LegacyStashProvider implements StashProvider {
  readonly name = 'legacy' as const
  readonly gateway: TradeGateway
  private readonly now: () => number

  constructor(private readonly deps: LegacyDeps) {
    this.now = deps.now ?? Date.now
    this.gateway = new TradeGateway({
      transport: deps.transport,
      resolveUrl: (req: TradeApiRequest) => stashUrl(req.endpoint, req.rest),
      limits: deps.limits ?? new RateLimitRegistry({}, this.now()),
      now: this.now,
      log: deps.log
    })
  }

  async sessionAccountName(): Promise<string | null> {
    const fromStatus = normalizeAccountName(this.deps.statusAccountName())
    if (fromStatus) return fromStatus
    if (!this.deps.loggedIn()) return null
    // запасной путь: эндпоинт сайта (отдельная политика — свой лимитер 'data' этого шлюза)
    const r = await this.gateway.request<{ accountName?: unknown }>({
      kind: 'data',
      priority: 'background',
      maxWaitMs: 30_000,
      cache: false,
      req: { method: 'GET', endpoint: 'get-account-name' }
    })
    return r.ok ? normalizeAccountName(r.data?.accountName) : null
  }

  fetchTabs(q: StashQuery): Promise<StashResult<ParsedStash>> {
    return this.fetch(q, true)
  }

  fetchTab(q: StashQuery): Promise<StashResult<ParsedStash>> {
    return this.fetch(q, false)
  }

  windows(): BudgetWindow[] {
    const snap = this.gateway.limits.snapshot(this.now()).find((p) => p.kinds.includes('stash'))
    if (!snap?.windows.length) return [...STASH_DEFAULT_WINDOWS]
    return snap.windows.map((w) => ({ hits: w.hits, periodSec: w.periodSec }))
  }

  /** Сколько ждать места в лимите для следующего запроса стэша. */
  waitMs(): number {
    return this.gateway.estimateWaitMs('stash', 'background')
  }

  private async fetch(q: StashQuery, tabs: boolean): Promise<StashResult<ParsedStash>> {
    const r = await this.gateway.request<unknown>({
      kind: 'stash',
      priority: 'background',
      maxWaitMs: STASH_MAX_WAIT_MS,
      cache: false,
      req: { method: 'GET', endpoint: 'get-stash-items', rest: stashQueryString(q, tabs) }
    })
    if (!r.ok) return { ok: false, error: toWealthError(r.error, this.deps.loggedIn(), this.now()) }
    const parsed = parseStashResponse(r.data)
    if (!parsed || (tabs && !parsed.tabs)) return { ok: false, error: { code: 'bad-response' } }
    return { ok: true, data: parsed }
  }
}
