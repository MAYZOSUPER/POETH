// Менеджер учёта богатства PoE1 (S11a). Ядро без electron: стэш, цены, хранилище, лига и
// статус входа передаются снаружи (боевой экземпляр — src/main/ipc/wealth.ts, тесты —
// tests/wealth/manager.test.ts).
//
// Снимок: без входа — сразу «войдите», без запросов. Иначе 1-й запрос — список вкладок вместе
// с первой выбранной вкладкой, дальше по запросу на каждую выбранную; ошибка любой вкладки
// обрывает снимок целиком (частичная сумма испортила бы фарм в час). Цены обновляются
// параллельно (ошибка источника цен снимок не останавливает).
// Авто-снимки — если включены в настройках или идёт сессия фарма; интервал не меньше того,
// что выдерживает лимит сайта при выбранном числе вкладок (tabs.ts).
// API для трекера карт S11b: onSnapshot(cb), getNetWorthAt(at, league?), takeSnapshot().

import type {
  FarmSession,
  WealthAccountResult,
  WealthDiff,
  WealthError,
  WealthOptions,
  WealthPoint,
  WealthResult,
  WealthSnapshot,
  WealthState,
  WealthStatus,
  WealthSummary,
  WealthTab
} from '@shared/types/wealth'
import { farmView, netWorthAt, startSession, stopSession } from '@shared/wealth/farm'
import { buildSnapshot, diffSnapshots, type TabItems } from '@shared/wealth/snapshot'
import {
  DEFAULT_MAX_TABS,
  HARD_MAX_TABS,
  effectiveAutoIntervalMin,
  minAutoIntervalMin,
  normalizeAccountName,
  reconcileSelection
} from '@shared/wealth/tabs'
import type { StashProvider } from './stashProvider'
import type { PriceService } from './priceService'
import { KEEP_DETAILED, newSnapshotId, sanitizeConfig, type WealthConfig, type WealthStore } from './store'

/** Первый авто-снимок после запуска/входа — не раньше чем через минуту (сеть, вход, лиги). */
const FIRST_AUTO_DELAY_MS = 60_000
/** Повтор авто-снимка после ошибки сети/сайта. */
const AUTO_RETRY_MS = 5 * 60_000

export interface WealthManagerDeps {
  provider: StashProvider & { waitMs?(): number }
  prices: PriceService
  store: Pick<
    WealthStore,
    'loadConfig' | 'saveConfig' | 'loadHistory' | 'appendHistory' | 'saveDetail' | 'loadDetail' | 'detailedIds' | 'pruneDetails'
  >
  /** действующая лига PoE1 (настройка или текущая лига сайта) */
  league: () => Promise<string>
  loggedIn: () => boolean
  emit: (s: WealthState) => void
  now?: () => number
  log?: (msg: string) => void
}

type Pre = { ok: true; account: string; league: string } | { ok: false; error: WealthError }

export class WealthManager {
  private cfg: WealthConfig = sanitizeConfig(null)
  private points = new Map<string, WealthPoint[]>()
  private last = new Map<string, WealthSummary>()
  private detailed: string[] = []
  private league: string | null = null
  private supported = false
  private loaded = false
  private status: WealthStatus = { phase: 'idle' }
  private sessionAccount: string | null = null
  private inflight: Promise<WealthResult> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextAutoAt: number | undefined
  private lastAttemptAt = 0
  private startedAt = 0
  private listeners = new Set<(s: WealthSummary) => void>()
  private readonly now: () => number

  constructor(private readonly deps: WealthManagerDeps) {
    this.now = deps.now ?? Date.now
  }

  // ------------------------------------------------------------------ жизненный цикл

  async start(): Promise<void> {
    if (!this.loaded) {
      this.cfg = await this.deps.store.loadConfig()
      for (const s of await this.deps.store.loadHistory()) this.addSummary(s)
      this.detailed = await this.deps.store.detailedIds()
      this.loaded = true
    }
    this.supported = true
    this.startedAt = this.now()
    this.league = await this.deps.league().catch(() => this.league)
    this.schedule()
    this.emit()
  }

  stop(): void {
    this.supported = false
    this.clearTimer()
    this.emit()
  }

  /** Сменился статус входа (S3): имя аккаунта из сессии перечитать, авто-снимки перепланировать. */
  onAuthChanged(): void {
    this.sessionAccount = null
    if (this.status.error?.code === 'auth' || this.status.error?.code === 'forbidden') this.status = { phase: this.status.phase }
    this.schedule()
    this.emit()
  }

  /** Сменилась лига (настройка/список лиг S3). */
  async onLeagueChanged(): Promise<void> {
    const next = await this.deps.league().catch(() => this.league)
    if (next === this.league) return
    this.league = next
    this.schedule()
    this.emit()
  }

  // ------------------------------------------------------------------ API для S11b

  /** Подписка на новые снимки (итог). */
  onSnapshot(cb: (s: WealthSummary) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Стоимость стэша (chaos) на момент `at` по снимкам лиги; после последнего снимка — его стоимость. */
  getNetWorthAt(at: number, league?: string): number | null {
    const lg = league ?? this.league
    return lg ? netWorthAt(this.points.get(lg) ?? [], at, true) : null
  }

  /** Сделать снимок (как кнопка). */
  takeSnapshot(): Promise<WealthResult> {
    return this.snapshot(true)
  }

  // ------------------------------------------------------------------ состояние

  private addSummary(s: WealthSummary): void {
    const list = this.points.get(s.league) ?? []
    list.push({ at: s.at, chaos: s.chaos, divineRate: s.divineRate })
    list.sort((a, b) => a.at - b.at)
    this.points.set(s.league, list)
    const prev = this.last.get(s.league)
    if (!prev || prev.at <= s.at) this.last.set(s.league, s)
  }

  private selection(league: string): string[] {
    const list = this.cfg.tabs[league]?.list
    const saved = this.cfg.selected[league] ?? null
    if (!list) return saved ? saved.slice(0, HARD_MAX_TABS) : []
    return reconcileSelection(list, saved)
  }

  private session(): FarmSession | null {
    const s = this.cfg.session
    return s && s.league === this.league ? s : null
  }

  private sessionActive(): boolean {
    const s = this.session()
    return !!s && s.stoppedAt === undefined
  }

  state(): WealthState {
    const league = this.league
    const list = league ? (this.cfg.tabs[league]?.list ?? []) : []
    const sel = league ? this.selection(league) : []
    const tabs: WealthTab[] = list.map((t) => {
      const v: WealthTab = { id: t.id, index: t.index, name: t.name, type: t.type, selected: sel.includes(t.id) }
      if (t.colour) v.colour = t.colour
      if (t.unsupported) v.unsupported = true
      return v
    })
    const windows = this.deps.provider.windows()
    const requests = sel.length
    const points = league ? (this.points.get(league) ?? []) : []
    const opts = { poeWatch: this.cfg.options.poeWatch }
    const state: WealthState = {
      supported: this.supported,
      league,
      loggedIn: this.deps.loggedIn(),
      account: this.cfg.accountName
        ? { name: this.cfg.accountName, source: 'manual' }
        : { name: this.sessionAccount, source: this.sessionAccount ? 'session' : null },
      status: this.status,
      tabs,
      maxTabs: DEFAULT_MAX_TABS,
      options: { ...this.cfg.options },
      budget: {
        requests,
        minIntervalMin: minAutoIntervalMin(requests, windows),
        intervalMin: effectiveAutoIntervalMin(this.cfg.options.autoIntervalMin, requests, windows)
      },
      latest: league ? (this.last.get(league) ?? null) : null,
      detailed: [...this.detailed],
      history: points,
      farm: farmView(this.session(), points),
      prices: league ? this.deps.prices.info(league, opts) : { exchangeItems: 0, poeWatchItems: 0 }
    }
    const tabsAt = league ? this.cfg.tabs[league]?.at : undefined
    if (tabsAt) state.tabsAt = tabsAt
    if (this.nextAutoAt) state.nextAutoAt = this.nextAutoAt
    return state
  }

  private emit(): void {
    this.deps.emit(this.state())
  }

  private setStatus(s: WealthStatus): void {
    this.status = s
    this.emit()
  }

  private fail(error: WealthError): WealthResult {
    this.setStatus({ phase: 'idle', error })
    return { ok: false, error }
  }

  private async save(): Promise<void> {
    await this.deps.store.saveConfig(this.cfg)
  }

  // ------------------------------------------------------------------ проверки перед запросами

  private async account(): Promise<string | null> {
    if (this.cfg.accountName) return this.cfg.accountName
    if (!this.sessionAccount) this.sessionAccount = await this.deps.provider.sessionAccountName().catch(() => null)
    return this.sessionAccount
  }

  private async precheck(): Promise<Pre> {
    if (!this.supported) return { ok: false, error: { code: 'unsupported-game' } }
    // без входа сайт стэш не отдаёт — не тратим запросы
    if (!this.deps.loggedIn()) return { ok: false, error: { code: 'auth' } }
    this.league = await this.deps.league().catch(() => this.league)
    if (!this.league) return { ok: false, error: { code: 'not-found' } }
    const account = await this.account()
    if (!account) return { ok: false, error: { code: 'no-account' } }
    return { ok: true, account, league: this.league }
  }

  // ------------------------------------------------------------------ вкладки, аккаунт, настройки

  async refreshTabs(): Promise<WealthResult> {
    if (this.inflight) return this.inflight
    const pre = await this.precheck()
    if (!pre.ok) return this.fail(pre.error)
    this.setStatus({ phase: 'tabs' })
    const r = await this.deps.provider.fetchTabs({ account: pre.account, league: pre.league, index: 0 })
    if (!r.ok) return this.fail(r.error)
    const list = r.data.tabs ?? []
    this.cfg.tabs[pre.league] = { at: this.now(), list }
    const saved = this.cfg.selected[pre.league]
    if (saved) this.cfg.selected[pre.league] = reconcileSelection(list, saved)
    await this.save()
    this.schedule()
    this.setStatus({ phase: 'idle' })
    return { ok: true }
  }

  async setTabs(ids: unknown): Promise<WealthResult> {
    const league = this.league ?? (await this.deps.league().catch(() => null))
    if (!league) return { ok: false, error: { code: 'not-found' } }
    const want = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
    const list = this.cfg.tabs[league]?.list
    this.cfg.selected[league] = list ? reconcileSelection(list, want) : want.slice(0, HARD_MAX_TABS)
    await this.save()
    this.schedule()
    this.emit()
    return { ok: true }
  }

  async setAccount(name: unknown): Promise<WealthAccountResult> {
    if (name === null || name === undefined || (typeof name === 'string' && !name.trim())) {
      delete this.cfg.accountName
    } else {
      const norm = normalizeAccountName(name)
      if (!norm) return 'bad-format'
      this.cfg.accountName = norm
    }
    this.sessionAccount = null
    if (this.status.error?.code === 'no-account' || this.status.error?.code === 'forbidden') this.status = { phase: this.status.phase }
    await this.save()
    this.emit()
    return 'ok'
  }

  async setOptions(patch: unknown): Promise<WealthState> {
    const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<WealthOptions>
    this.cfg = sanitizeConfig({ ...this.cfg, options: { ...this.cfg.options, ...p } })
    await this.save()
    this.schedule()
    this.emit()
    return this.state()
  }

  // ------------------------------------------------------------------ снимок

  snapshot(manual = true): Promise<WealthResult> {
    if (this.inflight) return this.inflight
    this.lastAttemptAt = this.now()
    this.inflight = this.doSnapshot(manual).finally(() => {
      this.inflight = null
      this.schedule()
    })
    return this.inflight
  }

  private progress(done: number, total: number): void {
    const wait = this.deps.provider.waitMs?.() ?? 0
    const s: WealthStatus = { phase: 'snapshot', progress: { done, total } }
    if (wait > 1000) s.waitUntil = this.now() + wait
    this.setStatus(s)
  }

  private async doSnapshot(manual: boolean): Promise<WealthResult> {
    const pre = await this.precheck()
    if (!pre.ok) return this.fail(pre.error)
    const { account, league } = pre
    const opts = { poeWatch: this.cfg.options.poeWatch }
    const pricesReady = this.deps.prices.refresh(league, opts)

    const known = this.cfg.tabs[league]?.list ?? []
    let sel = reconcileSelection(known, this.cfg.selected[league] ?? null)
    const firstIndex = known.find((t) => t.id === sel[0])?.index ?? 0
    this.progress(0, Math.max(1, sel.length))

    const first = await this.deps.provider.fetchTabs({ account, league, index: firstIndex })
    if (!first.ok) return this.fail(first.error)
    const list = first.data.tabs ?? []
    this.cfg.tabs[league] = { at: this.now(), list }
    sel = reconcileSelection(list, this.cfg.selected[league] ?? null)
    if (!sel.length) {
      await this.save()
      return this.fail({ code: 'no-tabs' })
    }

    const byId = new Map(list.map((t) => [t.id, t]))
    const got: TabItems[] = []
    for (const id of sel) {
      const tab = byId.get(id)
      if (!tab) continue
      let items = first.data.items
      if (tab.index !== firstIndex) {
        this.progress(got.length, sel.length)
        const r = await this.deps.provider.fetchTab({ account, league, index: tab.index })
        if (!r.ok) {
          await this.save()
          return this.fail(r.error)
        }
        items = r.data.items
      }
      got.push({ id, name: tab.name, items })
    }
    this.progress(got.length, sel.length)

    await pricesReady
    const at = this.now()
    const snap = buildSnapshot({
      id: newSnapshotId(at),
      at,
      league,
      tabs: got,
      index: this.deps.prices.index(league, opts),
      divineRate: this.deps.prices.divineRate(league, opts),
      manual
    })
    await this.deps.store.saveDetail(snap)
    await this.deps.store.appendHistory(snap.summary)
    const pinned = this.cfg.session && this.cfg.session.stoppedAt === undefined ? [this.cfg.session.startId] : []
    this.detailed = await this.deps.store.pruneDetails(KEEP_DETAILED, pinned)
    this.addSummary(snap.summary)
    await this.save()
    this.setStatus({ phase: 'idle' })
    for (const cb of this.listeners) {
      try {
        cb(snap.summary)
      } catch (e) {
        this.deps.log?.(`[wealth] onSnapshot: ${e instanceof Error ? e.message : 'ошибка'}`)
      }
    }
    return { ok: true }
  }

  // ------------------------------------------------------------------ фарм

  async startFarm(): Promise<WealthResult> {
    const r = await this.snapshot(true)
    if (!r.ok) return r
    const last = this.league ? this.last.get(this.league) : undefined
    if (!last) return { ok: false, error: { code: 'bad-response' } }
    this.cfg.session = startSession(last.league, last.at, last.id, last.chaos)
    await this.save()
    this.schedule()
    this.emit()
    return { ok: true }
  }

  async stopFarm(): Promise<WealthResult> {
    const s = this.session()
    if (!s || s.stoppedAt !== undefined) return { ok: true }
    const r = await this.snapshot(true)
    // снимок не удался — останавливаем по последнему снимку сессии
    const last = this.league ? this.last.get(this.league) : undefined
    const end = last && last.at >= s.startedAt ? last : null
    this.cfg.session = end ? stopSession(s, end.at, end.id, end.chaos) : stopSession(s, s.startedAt, s.startId, s.startChaos)
    await this.save()
    this.schedule()
    this.emit()
    return r
  }

  // ------------------------------------------------------------------ детали и разница

  async detail(id?: unknown): Promise<WealthSnapshot | null> {
    if (typeof id === 'string' && id) return this.deps.store.loadDetail(id)
    const last = this.league ? this.last.get(this.league) : undefined
    return last ? this.deps.store.loadDetail(last.id) : null
  }

  async diff(fromId?: unknown, toId?: unknown): Promise<WealthDiff | null> {
    const to = typeof toId === 'string' && toId ? await this.deps.store.loadDetail(toId) : await this.detail()
    if (!to) return null
    let from: WealthSnapshot | null = null
    if (typeof fromId === 'string' && fromId) from = await this.deps.store.loadDetail(fromId)
    else {
      const s = this.session()
      if (s && s.startId !== to.summary.id) from = await this.deps.store.loadDetail(s.startId)
      if (!from) {
        // предыдущий детализированный снимок той же лиги (id сортируются по времени)
        const ids = this.detailed.filter((id) => id < to.summary.id)
        for (let i = ids.length - 1; i >= 0 && !from; i--) {
          const d = await this.deps.store.loadDetail(ids[i])
          if (d && d.summary.league === to.summary.league) from = d
        }
      }
    }
    return from ? diffSnapshots(from, to) : null
  }

  // ------------------------------------------------------------------ авто-снимки

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.nextAutoAt = undefined
  }

  private schedule(): void {
    this.clearTimer()
    const league = this.league
    if (!this.supported || !league || !this.deps.loggedIn()) return
    if (!this.cfg.options.autoEnabled && !this.sessionActive()) return
    const sel = this.selection(league)
    const interval = effectiveAutoIntervalMin(this.cfg.options.autoIntervalMin, sel.length, this.deps.provider.windows()) * 60_000
    const now = this.now()
    const lastAt = this.last.get(league)?.at ?? 0
    let at = Math.max(lastAt + interval, this.startedAt + FIRST_AUTO_DELAY_MS)
    const err = this.status.error
    if (err && this.lastAttemptAt) {
      const retry = err.code === 'rate-limited' && err.retryAt ? err.retryAt : this.lastAttemptAt + AUTO_RETRY_MS
      at = Math.max(at, retry)
    }
    at = Math.max(at, now + 1000)
    this.nextAutoAt = at
    this.timer = setTimeout(() => {
      this.timer = null
      void this.snapshot(false)
    }, at - now)
  }
}
