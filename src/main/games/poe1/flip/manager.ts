// Помощник по флиппингу валюты PoE1 (S13). Ядро без electron: фид, лига, данные и хранение передаются
// снаружи (боевой экземпляр — src/main/ipc/flip.ts, тесты — tests/flip/manager.test.ts).
//
// Часы фида — общее хранилище (exchange/feedStore.ts): при старте до недели (свежие 24 ч сразу, остальное в
// фоне), дальше раз в час. После каждого обновления пересчёт: статистика пар за 1/6/24 ч, маршруты и курс
// divine:chaos. Только оценка по прошлым часам: ордера игрок выставляет сам, никакой автоматизации.

import type { FlipFilters, FlipState } from '@shared/types/flip'
import type { FullHour } from '@shared/flip/feed'
import { divineTrack } from '@shared/flip/divine'
import { computeRoutes, DEFAULT_FILTERS } from '@shared/flip/routes'

/** часов для маршрутов (окно 24 ч + час запаса) и для курса (неделя) */
const ROUTE_HOURS = 25
export const FEED_WANT_HOURS = 168
/** сколько маршрутов отдавать в окно (остальные — только счётчиком) */
const MAX_ROUTES = 60

export interface FlipFeed {
  refresh(league: string, want?: number): Promise<boolean>
  hours(league: string, limit?: number): FullHour[]
  onUpdate(cb: () => void): () => void
  hasProblem(): boolean
}

export interface GoldFees {
  fees: Record<string, number>
  source?: string
  generatedAt?: string
}

export interface FlipDeps {
  feed: FlipFeed
  league: () => Promise<string>
  /** id фида → английское имя (resources/data/poe1/wealth/exchange-ids.json) */
  loadNames: () => Promise<Record<string, string>>
  /** комиссия в золоте (resources/data/poe1/flip/gold-fees.json) */
  loadFees: () => Promise<GoldFees | null>
  loadConfig: () => Promise<unknown>
  saveConfig: (cfg: { version: 1; filters: FlipFilters }) => Promise<void>
  emit: (s: FlipState) => void
  log?: (msg: string) => void
}

const num = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

/** Фильтры из настроек/IPC → в разумных пределах. */
export function sanitizeFilters(raw: unknown): FlipFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof FlipFilters, unknown>>
  const d = DEFAULT_FILTERS
  const minSpread = num(r.minSpread, 0, 1, d.minSpread)
  return {
    minLiquidityDiv: num(r.minLiquidityDiv, 0, 1000, d.minLiquidityDiv),
    minActiveHours: Math.round(num(r.minActiveHours, 0, 24, d.minActiveHours)),
    minSpread,
    maxSpread: Math.max(minSpread, num(r.maxSpread, 0, 5, d.maxSpread)),
    maxVolatility: num(r.maxVolatility, 0, 5, d.maxVolatility),
    depthMultiple: num(r.depthMultiple, 1, 100, d.depthMultiple),
    maxTrend: num(r.maxTrend, 0, 5, d.maxTrend),
    budgetDiv: num(r.budgetDiv, 0.1, 100_000, d.budgetDiv)
  }
}

export class FlipManager {
  private league: string | null = null
  private filters: FlipFilters = { ...DEFAULT_FILTERS }
  private names: Record<string, string> = {}
  private fees: GoldFees | null = null
  private loaded = false
  private supported = false
  private loading = false
  private snap: Pick<FlipState, 'routes' | 'rejected' | 'divine' | 'hours' | 'lastHour'> = {
    routes: [],
    rejected: [],
    divine: null,
    hours: 0,
    lastHour: null
  }
  private unsub: (() => void) | null = null

  constructor(private readonly deps: FlipDeps) {}

  async start(): Promise<void> {
    if (!this.loaded) {
      this.names = await this.deps.loadNames().catch(() => ({}))
      this.fees = await this.deps.loadFees().catch(() => null)
      const cfg = (await this.deps.loadConfig().catch(() => null)) as { filters?: unknown } | null
      this.filters = sanitizeFilters(cfg?.filters)
      this.loaded = true
    }
    this.supported = true
    this.league = await this.deps.league().catch(() => this.league)
    this.unsub?.()
    this.unsub = this.deps.feed.onUpdate(() => this.compute())
    this.compute()
    void this.refresh()
  }

  stop(): void {
    this.supported = false
    this.unsub?.()
    this.unsub = null
    this.emit()
  }

  /** Подтянуть недостающие часы (свежие — сразу, остальные до недели — в фоне) и пересчитать. */
  async refresh(): Promise<void> {
    if (!this.supported) return
    this.league = await this.deps.league().catch(() => this.league)
    if (!this.league) return
    this.loading = true
    this.emit()
    try {
      await this.deps.feed.refresh(this.league, FEED_WANT_HOURS)
    } finally {
      this.loading = false
      this.compute()
    }
  }

  async onLeagueChanged(): Promise<void> {
    const next = await this.deps.league().catch(() => this.league)
    if (next === this.league) return
    this.league = next
    this.compute()
    void this.refresh()
  }

  async setFilters(patch: unknown): Promise<FlipState> {
    const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<FlipFilters>
    this.filters = sanitizeFilters({ ...this.filters, ...p })
    await this.deps.saveConfig({ version: 1, filters: this.filters })
    this.compute()
    return this.state()
  }

  /** Пересчёт по часам в памяти (быстро: один проход по рынкам). */
  compute(): void {
    const league = this.league
    if (!this.supported || !league) {
      this.emit()
      return
    }
    const all = this.deps.feed.hours(league, FEED_WANT_HOURS)
    const lastHour = all.length ? all[all.length - 1].hour : null
    const divine = all.length ? divineTrack(all, league) : null
    let routes: FlipState['routes'] = []
    let rejected: FlipState['rejected'] = []
    if (lastHour !== null && divine && this.fees) {
      const r = computeRoutes({
        hours: all.slice(-ROUTE_HOURS),
        league,
        lastHour,
        ctx: { rate: divine.current, names: this.names, fees: this.fees.fees, filters: this.filters }
      })
      routes = r.routes.slice(0, MAX_ROUTES)
      rejected = r.rejected.slice(0, MAX_ROUTES)
    }
    this.snap = { routes, rejected, divine, hours: all.length, lastHour: lastHour === null ? null : lastHour * 1000 }
    this.emit()
  }

  state(): FlipState {
    const fees = this.fees
    return {
      supported: this.supported,
      league: this.league,
      hours: this.snap.hours,
      lastHour: this.snap.lastHour,
      loading: this.loading,
      problem: this.deps.feed.hasProblem() ? 'network' : null,
      divine: this.snap.divine,
      routes: this.snap.routes,
      rejected: this.snap.rejected,
      filters: { ...this.filters },
      feesFrom: fees ? [fees.source, fees.generatedAt].filter(Boolean).join(', ') || null : null
    }
  }

  private emit(): void {
    this.deps.emit(this.state())
  }
}
