// Хранилище часов фида обмена GGG — общее для учёта богатства (S11a) и флиппинга (S13). Ядро без electron:
// сеть и диск передаются снаружи (боевой экземпляр — feedService.ts, тесты — tests/flip/feedStore.test.ts).
//
//  - час — https://web.poecdn.com/api/currency-exchange/<hourId>, без авторизации; прошлые часы неизменны —
//    на диске навсегда (до KEEP_HOURS), текущий час недоступен (404) и не ошибка;
//  - при старте: недостающие свежие 24 ч сразу, остальное до `want` часов — в фоне, по запросу раз в 2 с;
//  - дальше раз в час, в начале часа + jitter (CDN публикует час с задержкой);
//  - в памяти — только рынки нужных лиг (весь час — на диске).

import { leagueHour, parseFeedHour, type FullHour } from '@shared/flip/feed'
import { hourStart } from '@shared/wealth/exchange'

export const FEED_URL = 'https://web.poecdn.com/api/currency-exchange'
/** сколько часов держать (неделя для коридора курса) */
export const KEEP_HOURS = 168
/** свежие часы — сразу при старте */
export const FIRST_HOURS = 24
const BACKFILL_GAP_MS = 2000
const HOURLY_DELAY_MS = 5 * 60_000
const HOURLY_JITTER_MS = 4 * 60_000
const MIN_REFRESH_MS = 10 * 60_000

export interface FeedDeps {
  /** GET без cookies аккаунта; бросает при сетевой ошибке */
  getJson: (url: string) => Promise<{ status: number; json: unknown }>
  readHour: (hour: number) => Promise<FullHour | null>
  writeHour: (h: FullHour) => Promise<void>
  listHours: () => Promise<number[]>
  removeHour: (hour: number) => Promise<void>
  now?: () => number
  random?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export class FeedStore {
  /** час → рынки нужных лиг */
  private mem = new Map<number, FullHour>()
  private leagues = new Set<string>()
  private onDisk: Set<number> | null = null
  private missing = new Set<number>()
  private lastRefresh = 0
  /** обновления идут по очереди; одинаковая лига в полёте — склеивается */
  private chain: Promise<unknown> = Promise.resolve()
  private inflight = new Map<string, Promise<boolean>>()
  private backfilling: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private problem = false
  private readonly now: () => number

  constructor(private readonly deps: FeedDeps) {
    this.now = deps.now ?? Date.now
  }

  onUpdate(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private changed(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch (e) {
        this.deps.log?.(`[feed] слушатель: ${e instanceof Error ? e.message : 'ошибка'}`)
      }
    }
  }

  /** Последняя попытка загрузки упала по сети (данные — из кэша). */
  hasProblem(): boolean {
    return this.problem
  }

  /** Часы лиги в памяти, от старых к новым (не больше `limit` последних). */
  hours(league: string, limit = KEEP_HOURS): FullHour[] {
    const list = [...this.mem.values()].sort((a, b) => a.hour - b.hour).map((h) => leagueHour(h, league))
    return list.slice(-limit)
  }

  lastHour(): number | null {
    let max: number | null = null
    for (const h of this.mem.keys()) if (max === null || h > max) max = h
    return max
  }

  /** Подключить лигу: первый раз — чтение диска, новая лига — её рынки перечитываются с диска. */
  private async ensureLeague(league: string): Promise<void> {
    const isNew = !this.leagues.has(league)
    this.leagues.add(league)
    if (!this.onDisk) {
      await this.loadDisk()
      return
    }
    if (!isNew) return
    for (const hour of [...this.mem.keys()]) {
      const full = await this.deps.readHour(hour)
      if (full) this.mem.set(hour, this.keep(full))
    }
    if (this.mem.size) this.changed()
  }

  private keep(h: FullHour): FullHour {
    return { hour: h.hour, markets: h.markets.filter((m) => this.leagues.has(m[0])) }
  }

  private async loadDisk(): Promise<void> {
    this.onDisk = new Set(await this.deps.listHours())
    const oldest = hourStart(this.now()) - (KEEP_HOURS + 1) * 3600
    for (const hour of [...this.onDisk]) {
      if (hour < oldest) {
        await this.deps.removeHour(hour)
        this.onDisk.delete(hour)
        continue
      }
      const full = await this.deps.readHour(hour)
      if (full) this.mem.set(hour, this.keep(full))
    }
  }

  /** Скачать час; true — есть (или уже был), false — ещё не опубликован. Бросает при сети. */
  private async fetchHour(hour: number): Promise<boolean> {
    if (this.mem.has(hour)) return true
    const res = await this.deps.getJson(`${FEED_URL}/${hour}`)
    if (res.status === 404) return false
    const full = res.status === 200 ? parseFeedHour(hour, res.json) : null
    if (!full) throw new Error(`HTTP ${res.status}`)
    await this.deps.writeHour(full)
    this.onDisk?.add(hour)
    this.mem.set(hour, this.keep(full))
    return true
  }

  /**
   * Свежие часы лиги: недостающие из последних FIRST_HOURS — сразу, остальные до `want` — в фоне.
   * Не чаще раза в 10 минут (прошлые часы неизменны). false — ошибка сети (данные из кэша).
   */
  refresh(league: string, want = FIRST_HOURS): Promise<boolean> {
    const hit = this.inflight.get(league)
    if (hit) return hit
    const w = Math.min(KEEP_HOURS, Math.max(1, want))
    const run = (): Promise<boolean> => this.doRefresh(league, w)
    // другая лига в полёте — после неё (иначе её рынки не попали бы в память)
    const p = this.chain.then(run, run).finally(() => this.inflight.delete(league))
    this.chain = p.catch(() => false)
    this.inflight.set(league, p)
    return p
  }

  private async doRefresh(league: string, want: number): Promise<boolean> {
    await this.ensureLeague(league)
    const now = this.now()
    const fresh = this.mem.size > 0 && now - this.lastRefresh < MIN_REFRESH_MS
    if (fresh && !this.missing.size) return !this.problem
    this.lastRefresh = now
    const current = hourStart(now)
    let ok = true
    let added = false
    for (let i = 1; i <= Math.min(want, FIRST_HOURS); i++) {
      const hour = current - i * 3600
      if (this.mem.has(hour)) continue
      try {
        if (await this.fetchHour(hour)) added = true
      } catch {
        ok = false
        break
      }
    }
    this.problem = !ok
    if (!ok) this.deps.log?.('[feed] фид обмена недоступен — данные из кэша')
    // остальное — в фоне
    this.missing.clear()
    for (let i = FIRST_HOURS + 1; i <= want; i++) {
      const hour = current - i * 3600
      if (!this.mem.has(hour)) this.missing.add(hour)
    }
    this.prune(current)
    if (added) this.changed()
    if (ok && this.missing.size) void this.backfill()
    return ok
  }

  private prune(current: number): void {
    const oldest = current - (KEEP_HOURS + 1) * 3600
    for (const hour of [...this.mem.keys()]) {
      if (hour < oldest) {
        this.mem.delete(hour)
        void this.deps.removeHour(hour)
        this.onDisk?.delete(hour)
      }
    }
  }

  private backfill(): Promise<void> {
    this.backfilling ??= (async () => {
      const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
      let added = 0
      // от свежих к старым: коридор недели набирается постепенно
      for (const hour of [...this.missing].sort((a, b) => b - a)) {
        await sleep(BACKFILL_GAP_MS)
        try {
          if (await this.fetchHour(hour)) added++
          this.missing.delete(hour)
        } catch {
          break
        }
        if (added && added % 12 === 0) this.changed()
      }
      if (added) this.changed()
    })().finally(() => {
      this.backfilling = null
    })
    return this.backfilling
  }

  /** Каждый час (в начале часа + jitter) — refresh лиги, которую вернёт `league()`. */
  start(league: () => Promise<string | null>, want = KEEP_HOURS): void {
    this.stop()
    const plan = (): void => {
      const now = this.now()
      const next = (hourStart(now) + 3600) * 1000 + HOURLY_DELAY_MS + Math.floor((this.deps.random ?? Math.random)() * HOURLY_JITTER_MS)
      this.timer = setTimeout(async () => {
        this.timer = null
        const lg = await league().catch(() => null)
        if (lg) await this.refresh(lg, want).catch(() => false)
        plan()
      }, Math.max(1000, next - now))
    }
    plan()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
