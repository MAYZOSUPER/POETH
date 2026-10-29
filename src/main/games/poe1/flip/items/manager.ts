// «Обмен → Предметы» (S33, main): цены уников из снимка poe.ninja (ветка `prices`), тиры, «6L против без
// связей» и проверка «Недооценённых» на трейде по клику игрока. Ядро без electron — сеть, шлюз трейда и диск
// передаются снаружи (боевой экземпляр — ./ipc.ts, тесты — tests/flip/items/manager.test.ts).
//
// Правила GGG: одна кнопка — один поиск (search + один fetch до 10 лотов, приоритет interactive в шлюзе), никаких
// поисков по таймеру; «Следить» отдаёт тот же запрос в live search игрока (S6). По таймеру обновляется только
// снимок цен с GitHub — к трейду он не ходит.

import type {
  ItemCheckError,
  ItemCheckResult,
  ItemFlipConfig,
  ItemFlipState,
  ItemLine,
  ItemRow,
  ItemWatchResult,
  NetError
} from '@shared/types'
import { buildRows } from '@shared/flip/items/tiers'
import { sixLinkRows } from '@shared/flip/items/sixlink'
import { CHECK_LOTS, DEFAULT_K, buildItemQuery, clampK, maxPriceOf, watchTitle, type ItemSearchBody } from '@shared/flip/items/query'
import { checkLots, lotRates, lotStats, type LotInput } from '@shared/flip/items/antiscam'
import { normalizeListing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import type { LoadResult } from './snapshotSource'

const MAX_PICKS = 60
const REFRESH_EVERY_MS = 60 * 60_000

export interface SearchData {
  id: string
  result: string[]
  total: number
}

export type NetResult<T> = { ok: true; data: T } | { ok: false; error: NetError }

/** Курсы фида обмена GGG: chaos за divine и chaos за штуку по id фида. */
export interface FeedPrices {
  divine: number
  byId: ReadonlyMap<string, { chaos: number }>
}

export interface ItemFlipDeps {
  league: () => Promise<string | null>
  snapshot: { load(league: string, force?: boolean): Promise<LoadResult>; nextAt(league: string): number | null }
  feed: (league: string) => Promise<FeedPrices | null>
  /** POST search (interactive) */
  search: (league: string, body: ItemSearchBody) => Promise<NetResult<SearchData>>
  /** GET fetch до 10 id (interactive) */
  fetch: (ids: string[], searchId: string) => Promise<NetResult<{ result: Array<TradeFetchItem | null> }>>
  siteUrl: (league: string, searchId: string) => Promise<string>
  isFixer: (account: string) => boolean
  loadConfig: () => Promise<unknown>
  saveConfig: (cfg: ItemFlipConfig) => Promise<void>
  emit: (s: ItemFlipState) => void
  now?: () => number
  log?: (msg: string) => void
}

export const EXALTED_ID = 'Currency/CurrencyAddModToRare'
export const FUSING_FEED_ID = 'Currency/CurrencyRerollSocketLinks'
export const JEWELLER_FEED_ID = 'Currency/CurrencyRerollSocketNumbers'

export function normalizeConfig(raw: unknown): ItemFlipConfig {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const picks = Array.isArray(o.picks)
    ? [...new Set(o.picks.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 200))].slice(0, MAX_PICKS)
    : []
  return { k: clampK(o.k ?? DEFAULT_K), picks, list: o.list === 'mine' ? 'mine' : 'top' }
}

function checkError(e: NetError): { error: ItemCheckError; retryAfterMs?: number } {
  if (e.code === 'rate-limited') return e.retryAfterMs !== undefined ? { error: 'rate-limited', retryAfterMs: e.retryAfterMs } : { error: 'rate-limited' }
  if (e.code === 'blocked') return { error: 'blocked' }
  if (e.code === 'bad-request') return { error: 'bad' }
  return { error: 'net' }
}

export class ItemFlipManager {
  private config: ItemFlipConfig = normalizeConfig(null)
  private configLoaded = false
  private league: string | null = null
  private lines = new Map<string, ItemLine>()
  private rows: ItemRow[] = []
  private s: ItemFlipState
  private busy = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private refreshing: Promise<void> | null = null
  private readonly now: () => number

  constructor(private readonly deps: ItemFlipDeps) {
    this.now = deps.now ?? Date.now
    this.s = this.empty(false)
  }

  private empty(loading: boolean): ItemFlipState {
    return {
      supported: true,
      league: this.league,
      loading,
      problem: null,
      at: null,
      nextAt: null,
      divine: 0,
      fusing: null,
      jewellers: null,
      rows: [],
      sixLinks: [],
      config: this.config
    }
  }

  state(): ItemFlipState {
    return this.s
  }

  private async ensureConfig(): Promise<void> {
    if (this.configLoaded) return
    this.configLoaded = true
    this.config = normalizeConfig(await this.deps.loadConfig().catch(() => null))
  }

  /** Обновить снимок (если устарел) и курсы фида, пересчитать. Не бросает. */
  refresh(force = false): Promise<void> {
    this.refreshing ??= this.doRefresh(force).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(force: boolean): Promise<void> {
    await this.ensureConfig()
    const league = await this.deps.league().catch(() => null)
    if (league !== this.league) {
      this.league = league
      this.lines.clear()
      this.rows = []
    }
    if (!league) {
      this.s = { ...this.empty(false), league: null }
      this.deps.emit(this.s)
      return
    }
    if (!this.rows.length) {
      this.s = { ...this.s, league, loading: true, config: this.config }
      this.deps.emit(this.s)
    }
    const [loaded, feed] = await Promise.all([this.deps.snapshot.load(league, force), this.deps.feed(league).catch(() => null)])
    if (this.league !== league) return
    const snap = loaded.snap
    const divine = feed && feed.divine > 0 ? feed.divine : (snap?.divine ?? 0)
    this.lines = new Map((snap?.lines ?? []).map((l) => [l.id, l]))
    this.rows = snap ? buildRows(snap.lines, divine) : []
    const fusing = feed?.byId.get(FUSING_FEED_ID)?.chaos ?? null
    const jewellers = feed?.byId.get(JEWELLER_FEED_ID)?.chaos ?? null
    this.s = {
      supported: true,
      league,
      loading: false,
      problem: loaded.problem,
      at: snap?.at ?? null,
      nextAt: this.deps.snapshot.nextAt(league),
      divine: Math.round(divine * 100) / 100,
      fusing,
      jewellers,
      rows: this.rows,
      sixLinks: sixLinkRows(this.rows, fusing, jewellers),
      config: this.config
    }
    this.deps.emit(this.s)
  }

  async setConfig(patch: unknown): Promise<ItemFlipState> {
    await this.ensureConfig()
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>
    this.config = normalizeConfig({ ...this.config, ...p })
    await this.deps.saveConfig(this.config).catch((e) => this.deps.log?.(`[itemflip] config: ${String(e)}`))
    this.s = { ...this.s, config: this.config }
    this.deps.emit(this.s)
    return this.s
  }

  private target(rowId: unknown): { row: ItemRow; line: ItemLine } | null {
    if (typeof rowId !== 'string') return null
    const row = this.rows.find((r) => r.id === rowId)
    const line = this.lines.get(rowId)
    return row && line ? { row, line } : null
  }

  private query(row: ItemRow, line: ItemLine, k: number): { body: ItemSearchBody; maxChaos: number } {
    const maxChaos = maxPriceOf(row, k)
    return { body: buildItemQuery({ ...row, trade: line.trade, corrupted: line.corrupted }, maxChaos, this.s.divine), maxChaos }
  }

  /** «Проверить сейчас»: один поиск и один fetch до 10 лотов, разбор антискамом. */
  async check(rowId: unknown, kArg?: unknown): Promise<ItemCheckResult> {
    const id = typeof rowId === 'string' ? rowId : ''
    const t = this.target(rowId)
    if (!t) return { ok: false, rowId: id, error: 'no-row' }
    const league = this.league
    if (!league) return { ok: false, rowId: id, error: 'no-league' }
    if (this.busy.has(id)) return { ok: false, rowId: id, error: 'busy' }
    this.busy.add(id)
    try {
      const { body, maxChaos } = this.query(t.row, t.line, kArg === undefined ? this.config.k : clampK(kArg))
      const search = await this.deps.search(league, body)
      if (!search.ok) return { ok: false, rowId: id, ...checkError(search.error) }
      const { id: searchId, result, total } = search.data
      const siteUrl = await this.deps.siteUrl(league, searchId)
      const ids = (Array.isArray(result) ? result : []).filter((x) => typeof x === 'string').slice(0, CHECK_LOTS)
      let items: Array<TradeFetchItem | null> = []
      if (ids.length) {
        const fetched = await this.deps.fetch(ids, searchId)
        if (!fetched.ok) return { ok: false, rowId: id, ...checkError(fetched.error) }
        items = fetched.data.result ?? []
      }
      const input: LotInput[] = []
      for (const r of items) {
        if (!r || typeof r.id !== 'string') continue
        input.push({ ...normalizeListing(r), stats: lotStats(r.item) })
      }
      const feed = await this.deps.feed(league).catch(() => null)
      const divine = feed && feed.divine > 0 ? feed.divine : this.s.divine
      const exalted = feed?.byId.get(EXALTED_ID)?.chaos
      const out = checkLots(
        input,
        { ...t.row, trade: t.line.trade, corrupted: t.line.corrupted, implicits: t.line.implicits },
        { rates: lotRates(divine, exalted ? { exalted } : {}), now: this.now(), isFixer: this.deps.isFixer, maxChaos }
      )
      return { ok: true, rowId: id, at: this.now(), total: Number(total) || 0, maxChaos, sell: out.sell, market: out.market, lots: out.lots, siteUrl }
    } finally {
      this.busy.delete(id)
    }
  }

  /** «Следить»: тот же запрос — один поиск ради id; адрес отдаётся в live search игрока (renderer, S6). */
  async watchUrl(rowId: unknown, kArg?: unknown): Promise<ItemWatchResult> {
    const t = this.target(rowId)
    if (!t) return { ok: false, error: 'no-row' }
    const league = this.league
    if (!league) return { ok: false, error: 'no-league' }
    const { body, maxChaos } = this.query(t.row, t.line, kArg === undefined ? this.config.k : clampK(kArg))
    const search = await this.deps.search(league, body)
    if (!search.ok) return { ok: false, ...checkError(search.error) }
    return { ok: true, siteUrl: await this.deps.siteUrl(league, search.data.id), title: watchTitle(t.row, maxChaos, this.s.divine) }
  }

  /** Снимок цен — раз в час (только GitHub, не трейд). */
  async start(): Promise<void> {
    this.s = { ...this.s, supported: true }
    await this.refresh()
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), REFRESH_EVERY_MS + Math.floor(Math.random() * 5 * 60_000))
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  onLeagueChanged(): Promise<void> {
    return this.refresh()
  }
}
