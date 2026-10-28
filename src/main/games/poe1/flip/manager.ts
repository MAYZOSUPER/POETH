// Помощник по флиппингу валюты PoE1 (S13). Ядро без electron: фид, лига, данные и хранение передаются
// снаружи (боевой экземпляр — src/main/ipc/flip.ts, тесты — tests/flip/manager.test.ts).
//
// Часы фида — общее хранилище (exchange/feedStore.ts): при старте до недели (свежие 24 ч сразу, остальное в
// фоне), дальше раз в час. После каждого обновления пересчёт: статистика пар за 1/6/24 ч, маршруты и курс
// divine:chaos. Только оценка по прошлым часам: ордера игрок выставляет сам, никакой автоматизации.
// Маршруты, отсеянные только трендом, идут в общий список (чип «Без тренда» во вкладке их прячет). Курс вышел
// из коридора недели — событие для тоста в оверлее (если включено), один раз на час фида.

import type { FlipAlert, FlipFilters, FlipOptions, FlipRoute, FlipState } from '@shared/types/flip'
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
  /** следующее плановое обновление (мс) */
  nextAt?(): number | null
}

export interface FlipConfig {
  version: 1
  filters: FlipFilters
  options: FlipOptions
  /** час фида (мс), о котором уже сообщили выходом из коридора */
  alertedHour?: number
}

export const DEFAULT_OPTIONS: FlipOptions = { divineAlert: false }

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
  saveConfig: (cfg: FlipConfig) => Promise<void>
  emit: (s: FlipState) => void
  /** курс вышел из коридора недели — тост в оверлее */
  alert?: (a: FlipAlert) => void
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

function sanitizeOptions(raw: unknown): FlipOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FlipOptions>
  return { divineAlert: r.divineAlert === true }
}

/** Маршрут прошёл все фильтры, кроме, может быть, тренда. */
const onlyTrend = (r: FlipRoute): boolean => r.rejects.length === 1 && r.rejects[0] === 'trend'

export class FlipManager {
  private league: string | null = null
  private filters: FlipFilters = { ...DEFAULT_FILTERS }
  private options: FlipOptions = { ...DEFAULT_OPTIONS }
  private alertedHour: number | undefined
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
      const cfg = (await this.deps.loadConfig().catch(() => null)) as Partial<FlipConfig> | null
      this.filters = sanitizeFilters(cfg?.filters)
      this.options = sanitizeOptions(cfg?.options)
      if (typeof cfg?.alertedHour === 'number') this.alertedHour = cfg.alertedHour
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

  private save(): Promise<void> {
    const cfg: FlipConfig = { version: 1, filters: this.filters, options: this.options }
    if (this.alertedHour !== undefined) cfg.alertedHour = this.alertedHour
    return this.deps.saveConfig(cfg)
  }

  async setFilters(patch: unknown): Promise<FlipState> {
    const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<FlipFilters>
    this.filters = sanitizeFilters({ ...this.filters, ...p })
    await this.save()
    this.compute()
    return this.state()
  }

  async setOptions(patch: unknown): Promise<FlipState> {
    const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<FlipOptions>
    this.options = sanitizeOptions({ ...this.options, ...p })
    await this.save()
    this.emit()
    return this.state()
  }

  /** Тост «курс вышел из коридора» — один раз на час фида, только если включено. */
  private maybeAlert(d: FlipState['divine']): void {
    if (!this.options.divineAlert || !d?.outside || !d.week || d.hour === this.alertedHour) return
    this.alertedHour = d.hour
    void this.save().catch(() => undefined)
    this.deps.alert?.({ dir: d.outside, rate: d.lastHour, lo: d.week.lo, hi: d.week.hi, hour: d.hour })
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
      // отсеянные только трендом — в общий список (чип «Без тренда» во вкладке)
      const score = (x: FlipRoute): number => x.confidence * x.perHour
      routes = [...r.routes, ...r.rejected.filter(onlyTrend)].sort((a, b) => score(b) - score(a)).slice(0, MAX_ROUTES)
      rejected = r.rejected.filter((x) => !onlyTrend(x)).slice(0, MAX_ROUTES)
    }
    this.snap = { routes, rejected, divine, hours: all.length, lastHour: lastHour === null ? null : lastHour * 1000 }
    this.maybeAlert(divine)
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
      feesFrom: fees ? [fees.source, fees.generatedAt].filter(Boolean).join(', ') || null : null,
      nextUpdateAt: this.deps.feed.nextAt?.() ?? null,
      options: { ...this.options }
    }
  }

  private emit(): void {
    this.deps.emit(this.state())
  }
}
