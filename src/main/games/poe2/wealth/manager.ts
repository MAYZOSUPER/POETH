// Менеджер «Богатства PoE 2» (S70). Ядро без electron: хранилище, цены, лига, чтение экрана и трекер карт
// передаются снаружи (боевой экземпляр — src/main/ipc/wealth.ts, тесты — tests/wealth/poe2Manager.test.ts).
//
// API тайника у PoE 2 нет — снимок складывается из источников игрока (src/shared/wealth/poe2.ts): ручной ввод,
// ценные предметы из окна цены и вкладки, прочитанные с экрана по клавише (модуль S68, только по нажатию; снимок
// экрана живёт в памяти S68 и здесь не появляется — только имена и числа). Сеть — только фид обмена GGG через
// сервис цен; запросов к сайту трейда нет.
//
// Снимок богатства (история, график, прибыль) записывается, когда игрок что-то поменял:
//  - ввод подряд («+1», «+10», поле) — через EDIT_DEBOUNCE_MS тишины; несколько правок в пределах COALESCE_MS
//    правят один и тот же снимок (график не превращается в гребёнку);
//  - «Принять» снимок вкладок, ценный предмет, начало и конец сессии — сразу.
// Прибыль сессии фарма (трекер карт, FarmPanel): «Начать» → снимок-отсчёт (в первые START_GRACE_MS его заменяет
// новый ввод или снимок вкладок — игрок «отмечает» богатство в начале); закончившиеся забеги получают прибыль
// от границы до следующего снимка (qtyProfit — без дрейфа цен, как у PoE 1); после «Стоп» ещё END_GRACE_MS
// снимок (ввод) считается концом сессии — последняя группа пересчитывается.

import type {
  Poe2ScreenEdit,
  Poe2ScreenFail,
  Poe2ScreenSession,
  Poe2Sources,
  Poe2WealthState,
  WealthDiff,
  WealthPoint,
  WealthSnapshot,
  WealthSummary
} from '@shared/types/wealth'
import type { ScreenFail, ScreenRead } from '@shared/types/screen'
import { chartPoints } from '@shared/wealth/farm'
import { diffSnapshots, qtyProfit } from '@shared/wealth/snapshot'
import {
  acceptSession,
  addToSession,
  addValuable,
  buildPoe2Snapshot,
  cardTotal,
  cleanValuableInput,
  dropFromSession,
  editCardLine,
  emptySources,
  manualRows,
  poe2PriceIndex,
  poe2Totals,
  priceCardTab,
  removeScreenTab,
  removeValuable,
  screenCardTab,
  setGold,
  setManual,
  STALE_MS,
  type Poe2CurrencyList
} from '@shared/wealth/poe2'
import type { FarmEventLike, FarmLink, FarmRunProfit } from '../../poe1/wealth/manager'
import { newSnapshotId } from '../../poe1/wealth/store'
import type { Poe2PriceView } from './prices'
import { emptyLink, type Poe2SessionLink, type Poe2WealthStore } from './store'

export const EDIT_DEBOUNCE_MS = 4_000
export const COALESCE_MS = 10 * 60_000
export const START_GRACE_MS = 15 * 60_000
export const END_GRACE_MS = 2 * 3_600_000
/** цены перечитываются по запросу вкладки не чаще (FeedStore и сам не ходит чаще 10 минут) */
const PRICES_TTL_MS = 10 * 60_000
const KEEP_DETAILED = 20

/** Сообщение поверх игры после нажатия клавиши «Снимок вкладки в богатство» (тексты — в ipc/wealth.ts). */
export type Poe2Notice =
  | { code: 'busy' }
  | { code: 'read'; items: number; check: number; tabs: number }
  | { code: 'fail'; fail: Poe2ScreenFail }

export interface Poe2WealthDeps {
  store: Pick<
    Poe2WealthStore,
    'loadSources' | 'saveSources' | 'loadLink' | 'saveLink' | 'loadHistoryCompact' | 'appendHistory' | 'saveDetail' | 'loadDetail' | 'pruneDetails'
  >
  prices: { view(league: string): Poe2PriceView; refresh(league: string): Promise<Poe2PriceView> }
  /** список валюты для ручного ввода (данные) */
  currency: () => Promise<Poe2CurrencyList | null>
  /** действующая лига PoE 2 */
  league: () => Promise<string | null>
  /** снимок и распознавание открытой вкладки (S68 readStashFromScreen) — только по клавише игрока */
  readScreen?: () => Promise<ScreenRead | ScreenFail>
  notify?: (n: Poe2Notice) => void
  emit: (s: Poe2WealthState) => void
  now?: () => number
  log?: (msg: string) => void
  /** таймер ввода подряд (тесты — без ожидания) */
  debounceMs?: number
}

export type Poe2AddResult = { ok: true; id: string } | { ok: false }

const FALLBACK_LIST: Poe2CurrencyList = {
  main: [{ name: 'Divine Orb', tag: 'divine' }, { name: 'Exalted Orb', tag: 'exalted' }, { name: 'Chaos Orb', tag: 'chaos' }],
  common: []
}

export class Poe2WealthManager {
  private byLeague: Record<string, Poe2Sources> = {}
  private link: Poe2SessionLink = emptyLink()
  private summaries: WealthSummary[] = []
  private list: Poe2CurrencyList = FALLBACK_LIST
  private league: string | null = null
  private supported = false
  private loaded = false
  private screen: Poe2ScreenSession | null = null
  private live: { key: string; snap: WealthSnapshot } | null = null
  private version = 0
  /** снимки, сделанные по вводу подряд (их можно править следующим вводом) */
  private soft = new Set<string>()
  private editTimer: ReturnType<typeof setTimeout> | null = null
  private pricesAt = 0
  private queue: Promise<unknown> = Promise.resolve()
  private seq = 0
  // ---- трекер карт
  private farm: FarmLink | null = null
  private farmUnsub: (() => void) | null = null
  private readonly now: () => number

  constructor(private readonly deps: Poe2WealthDeps) {
    this.now = deps.now ?? Date.now
  }

  // ------------------------------------------------------------------ жизненный цикл

  async start(): Promise<void> {
    if (!this.loaded) {
      this.byLeague = await this.deps.store.loadSources()
      this.link = await this.deps.store.loadLink()
      this.summaries = await this.deps.store.loadHistoryCompact()
      this.list = (await this.deps.currency().catch(() => null)) ?? FALLBACK_LIST
      this.loaded = true
    }
    this.supported = true
    this.league = await this.deps.league().catch(() => this.league)
    this.emit()
    void this.refreshPrices(true)
  }

  stop(): void {
    this.supported = false
    if (this.editTimer) clearTimeout(this.editTimer)
    this.editTimer = null
    this.attachFarm(null)
    this.emit()
  }

  onLeagueChanged(): Promise<void> {
    return this.serial(async () => {
      const next = await this.deps.league().catch(() => this.league)
      if (next === this.league) return
      await this.flushNow()
      this.league = next
      this.screen = null
      this.touch()
      this.emit()
      void this.refreshPrices(true)
    })
  }

  /** Ввод, ждущий паузы, — записать сейчас и дождаться очереди записи (тесты, выход). */
  async idle(): Promise<void> {
    await this.serial(() => this.flushNow())
    let q: Promise<unknown>
    do {
      q = this.queue
      await q
    } while (q !== this.queue)
  }

  // ------------------------------------------------------------------ цены

  private async refreshPrices(force = false): Promise<void> {
    const league = this.league
    if (!league || (!force && this.now() - this.pricesAt < PRICES_TTL_MS)) return
    this.pricesAt = this.now()
    this.emit()
    await this.deps.prices.refresh(league).catch(() => null)
    if (league !== this.league) return
    // цены поменялись — итог, строки ручного ввода и карточка снимка пересчитываются
    const view = this.deps.prices.view(league)
    if (this.screen) this.screen = { ...this.screen, tabs: this.screen.tabs.map((t) => priceCardTab(t, view.priceOf)) }
    this.touch()
    this.emit()
  }

  // ------------------------------------------------------------------ источники

  private sources(): Poe2Sources {
    return (this.league && this.byLeague[this.league]) || emptySources()
  }

  private touch(): void {
    this.version++
    this.live = null
  }

  private async setSources(next: Poe2Sources): Promise<void> {
    const league = this.league
    if (!league || next === this.byLeague[league]) return
    this.byLeague = { ...this.byLeague, [league]: next }
    this.touch()
    await this.deps.store.saveSources(this.byLeague)
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn)
    this.queue = p.catch((e: unknown) => this.deps.log?.(`[wealth2] ${e instanceof Error ? e.message : 'ошибка'}`))
    return p
  }

  /** Ручной ввод валюты: штук (0 — убрать). Снимок — после паузы во вводе. */
  setManual(name: unknown, qty: unknown): Promise<Poe2WealthState> {
    return this.serial(async () => {
      if (typeof name !== 'string' || !this.supported) return this.state()
      await this.setSources(setManual(this.sources(), name, qty, this.now()))
      this.scheduleEdit()
      this.emit()
      return this.state()
    })
  }

  setGold(qty: unknown): Promise<Poe2WealthState> {
    return this.serial(async () => {
      if (!this.supported) return this.state()
      await this.setSources(setGold(this.sources(), qty, this.now()))
      this.emit()
      return this.state()
    })
  }

  /** Ценный предмет из окна цены (недоверенный ввод). */
  addValuable(raw: unknown): Promise<Poe2AddResult> {
    return this.serial(async () => {
      const input = cleanValuableInput(raw)
      if (!input || !this.supported || !this.league) return { ok: false as const }
      const at = this.now()
      const id = `v${at.toString(36)}${(++this.seq).toString(36)}`
      await this.setSources(addValuable(this.sources(), input, id, at))
      await this.record('hard')
      return { ok: true as const, id }
    })
  }

  removeValuable(id: unknown): Promise<Poe2WealthState> {
    return this.serial(async () => {
      if (typeof id === 'string') {
        const next = removeValuable(this.sources(), id)
        if (next !== this.sources()) {
          await this.setSources(next)
          await this.record('hard')
        }
      }
      return this.state()
    })
  }

  removeScreenTab(id: unknown): Promise<Poe2WealthState> {
    return this.serial(async () => {
      if (typeof id === 'string') {
        const next = removeScreenTab(this.sources(), id)
        if (next !== this.sources()) {
          await this.setSources(next)
          await this.record('hard')
        }
      }
      return this.state()
    })
  }

  // ------------------------------------------------------------------ снимок вкладки (S68)

  /** Клавиша «Снимок вкладки в богатство»: одно нажатие — один снимок открытой вкладки → карточка в компаньоне. */
  async screenHotkey(): Promise<void> {
    if (!this.supported || !this.deps.readScreen) return
    if (this.screen?.busy) {
      this.deps.notify?.({ code: 'busy' })
      return
    }
    this.screen = { ...(this.screen ?? { startedAt: this.now(), tabs: [] }), busy: true }
    delete this.screen.fail
    this.emit()
    let r: ScreenRead | ScreenFail
    try {
      r = await this.deps.readScreen()
    } catch {
      r = 'error'
    }
    const cur = this.screen ?? { startedAt: this.now(), tabs: [] }
    if (typeof r === 'string') {
      const next: Poe2ScreenSession = { startedAt: cur.startedAt, tabs: cur.tabs, fail: r }
      this.screen = next
      this.deps.notify?.({ code: 'fail', fail: r })
    } else {
      const league = this.league
      const priceOf = league ? this.deps.prices.view(league).priceOf : () => null
      const tab = screenCardTab(r, priceOf)
      this.screen = addToSession({ startedAt: cur.startedAt, tabs: cur.tabs }, tab, this.now())
      const t = cardTotal(tab)
      this.deps.notify?.({ code: 'read', items: tab.lines.length, check: t.check, tabs: this.screen.tabs.length })
    }
    this.emit()
    void this.refreshPrices()
  }

  screenEdit(tabId: unknown, key: unknown, edit: unknown): Poe2WealthState {
    const s = this.screen
    if (!s || typeof tabId !== 'string' || typeof key !== 'string' || !edit || typeof edit !== 'object') return this.state()
    const e = edit as Record<string, unknown>
    const clean: Poe2ScreenEdit = {}
    if (typeof e.qty === 'number') clean.qty = e.qty
    if (typeof e.name === 'string') clean.name = e.name
    const priceOf = this.league ? this.deps.prices.view(this.league).priceOf : () => null
    this.screen = { ...s, tabs: s.tabs.map((t) => (t.id === tabId ? editCardLine(t, key, clean, priceOf) : t)) }
    this.emit()
    return this.state()
  }

  /** «Переснять» вкладку (id) или отменить весь сеанс (без id). */
  screenDrop(tabId?: unknown): Poe2WealthState {
    if (this.screen?.busy) return this.state()
    this.screen = dropFromSession(this.screen, typeof tabId === 'string' ? tabId : undefined)
    this.emit()
    return this.state()
  }

  /** «Принять»: вкладки сеанса → источник «Снимок вкладок» → снимок богатства. */
  screenAccept(): Promise<Poe2WealthState> {
    return this.serial(async () => {
      const s = this.screen
      if (!s || s.busy || !s.tabs.length || !this.league) return this.state()
      await this.setSources(acceptSession(this.sources(), s, this.now()))
      this.screen = null
      await this.record('hard')
      return this.state()
    })
  }

  // ------------------------------------------------------------------ запись снимков

  private scheduleEdit(): void {
    if (this.editTimer) clearTimeout(this.editTimer)
    this.editTimer = setTimeout(() => {
      this.editTimer = null
      void this.serial(() => this.record('soft'))
    }, this.deps.debounceMs ?? EDIT_DEBOUNCE_MS)
  }

  /** Ввод, который ещё ждёт паузы, — записать сейчас (смена лиги, начало и конец сессии). Только внутри serial. */
  private async flushNow(): Promise<void> {
    if (!this.editTimer) return
    clearTimeout(this.editTimer)
    this.editTimer = null
    await this.record('soft')
  }

  private pinned(): string[] {
    const out: string[] = []
    if (this.link.session) out.push(this.link.session.startId)
    if (this.link.boundary) out.push(this.link.boundary.id)
    if (this.link.lastGroup) out.push(this.link.lastGroup.fromId)
    return out
  }

  private leagueSummaries(): WealthSummary[] {
    return this.summaries.filter((s) => s.league === this.league)
  }

  /** Итог сейчас (кэш до правки источников или цен). */
  private current(): WealthSnapshot | null {
    const league = this.league
    if (!league) return null
    const key = `${league}|${this.version}`
    if (this.live?.key === key) return this.live.snap
    const view = this.deps.prices.view(league)
    const snap = buildPoe2Snapshot({
      id: 'live',
      at: this.now(),
      league,
      sources: this.sources(),
      index: poe2PriceIndex(view.priceOf, view.size),
      exPerDivine: view.exPerDivine ?? 0
    })
    this.live = { key, snap }
    return snap
  }

  /**
   * Записать снимок богатства. 'soft' — ввод подряд; 'hard' — принятый снимок вкладок, ценный предмет; 'pin' —
   * начало сессии (никогда не правится). Снимок по вводу, сделанный меньше COALESCE_MS назад, правится на месте.
   */
  private async record(kind: 'soft' | 'hard' | 'pin'): Promise<WealthSnapshot | null> {
    const league = this.league
    if (!league || !this.supported) return null
    await this.refreshPrices()
    const view = this.deps.prices.view(league)
    const at = this.now()
    const last = this.leagueSummaries().at(-1)
    const reuse = kind !== 'pin' && !!last && this.soft.has(last.id) && at - last.at < COALESCE_MS && !this.pinned().includes(last.id)
    const id = reuse && last ? last.id : newSnapshotId(at)
    const snap = buildPoe2Snapshot({
      id,
      at,
      league,
      sources: this.sources(),
      index: poe2PriceIndex(view.priceOf, view.size),
      exPerDivine: view.exPerDivine ?? 0,
      manual: true
    })
    await this.deps.store.saveDetail(snap)
    await this.deps.store.appendHistory(snap.summary)
    this.summaries = [...this.summaries.filter((s) => s.id !== id), snap.summary].sort((a, b) => a.at - b.at)
    if (kind === 'soft') this.soft.add(id)
    else this.soft.delete(id)
    await this.afterRecord(snap)
    await this.deps.store.pruneDetails(KEEP_DETAILED, this.pinned())
    this.emit()
    return snap
  }

  // ------------------------------------------------------------------ сессия фарма (трекер карт)

  /** Подключить трекер карт (null — отключить). */
  attachFarm(link: FarmLink | null): void {
    this.farmUnsub?.()
    this.farmUnsub = null
    this.farm = link
    if (link) this.farmUnsub = link.onFarmEvent((e) => void this.serial(() => this.onFarmEvent(e)))
  }

  private async saveLink(): Promise<void> {
    await this.deps.store.saveLink(this.link)
  }

  private async onFarmEvent(e: FarmEventLike): Promise<void> {
    if (!this.supported) return
    if (e.type === 'runEnd') {
      if (e.run.sessionId !== null && this.link.session && this.link.session.stoppedAt === undefined && !this.link.pending.includes(e.run.id)) {
        this.link = { ...this.link, pending: [...this.link.pending, e.run.id] }
        await this.saveLink()
      }
      return
    }
    if (e.type !== 'session') return
    if (e.state === 'start') {
      await this.flushNow()
      this.link = { league: this.league, session: null, boundary: null, pending: [], lastGroup: null }
      const snap = await this.record('pin')
      if (snap) {
        this.link = {
          ...this.link,
          session: { startedAt: snap.summary.at, startId: snap.summary.id, startEx: snap.summary.chaos },
          boundary: { id: snap.summary.id, at: snap.summary.at }
        }
      }
      await this.saveLink()
      this.emit()
      return
    }
    if (e.state === 'stop') {
      await this.flushNow()
      const s = this.link.session
      if (s && s.stoppedAt === undefined) {
        this.link = { ...this.link, session: { ...s, stoppedAt: this.now(), awaitingEnd: true } }
        await this.saveLink()
      }
      this.emit()
    }
  }

  /** После снимка: начало сессии (в первые минуты), прибыль закончившихся забегов, итог сессии. */
  private async afterRecord(snap: WealthSnapshot): Promise<void> {
    const L = this.link
    const s = L.session
    if (!s || L.league !== snap.summary.league || snap.summary.id === s.startId) return
    const at = snap.summary.at
    const active = s.stoppedAt === undefined
    if (!active && at - (s.stoppedAt ?? 0) > END_GRACE_MS) return
    // игрок «отметил» богатство в начале: ещё ни одного забега — этот снимок и есть отсчёт
    if (active && !L.pending.length && !L.lastGroup && at - s.startedAt <= START_GRACE_MS) {
      this.link = {
        ...L,
        session: { startedAt: s.startedAt, startId: snap.summary.id, startEx: snap.summary.chaos },
        boundary: { id: snap.summary.id, at }
      }
      await this.saveLink()
      return
    }
    const rate = snap.summary.divineRate
    const setProfit = (runId: string, runs: number, p: { chaos: number; low: boolean }): void => {
      const profit: FarmRunProfit = { chaos: p.chaos, runs }
      if (rate > 0) profit.divineRate = rate
      if (p.low) profit.low = true
      this.farm?.setRunProfit(runId, profit)
    }
    let next: Poe2SessionLink = { ...L }
    if (L.pending.length && L.boundary) {
      const base = await this.deps.store.loadDetail(L.boundary.id)
      const runId = L.pending[L.pending.length - 1]
      if (base) {
        setProfit(runId, L.pending.length, qtyProfit(base, snap))
        next.lastGroup = { runId, runs: L.pending.length, fromId: L.boundary.id }
      }
      next.boundary = { id: snap.summary.id, at }
      next.pending = []
    } else if (!active && L.lastGroup) {
      // после «Стоп» игрок поправил богатство ещё раз — конец сессии сдвигается, последняя группа пересчитывается
      const base = await this.deps.store.loadDetail(L.lastGroup.fromId)
      if (base) setProfit(L.lastGroup.runId, L.lastGroup.runs, qtyProfit(base, snap))
      next.boundary = { id: snap.summary.id, at }
    }
    const start = await this.deps.store.loadDetail(s.startId)
    const session = { ...s, endId: snap.summary.id, endEx: snap.summary.chaos }
    if (start) {
      const p = qtyProfit(start, snap)
      session.profitEx = p.chaos
      if (p.low) session.low = true
      else delete session.low
    }
    if (!active) delete session.awaitingEnd
    next = { ...next, session }
    this.link = next
    await this.saveLink()
  }

  // ------------------------------------------------------------------ состояние и детали

  state(): Poe2WealthState {
    const league = this.league
    const s = this.sources()
    const now = this.now()
    const view = league ? this.deps.prices.view(league) : null
    const snap = this.current()
    const summaries = this.leagueSummaries()
    const points: WealthPoint[] = summaries.map((x) => ({ at: x.at, chaos: x.chaos, divineRate: x.divineRate }))
    const totals = snap ? poe2Totals(s, snap, now) : null
    const empty = { ex: 0, at: null, stale: false, unpriced: 0 }
    const session = this.link.session && this.link.league === league ? this.link.session : null
    return {
      supported: this.supported,
      league,
      exPerDivine: view?.exPerDivine ?? null,
      prices: view?.info ?? {},
      total: {
        ex: snap?.summary.chaos ?? 0,
        unpriced: snap?.summary.tabs.reduce((a, t) => a + t.unpriced, 0) ?? 0,
        approx: totals?.approx ?? false,
        at: summaries.at(-1)?.at ?? null
      },
      gold: { qty: s.gold, at: s.goldAt, stale: s.goldAt !== null && now - s.goldAt > STALE_MS },
      sources: {
        screen: totals?.screen ?? { ...empty, tabs: 0 },
        manual: totals?.manual ?? empty,
        valuables: totals?.valuables ?? { ...empty, count: 0 }
      },
      manual: manualRows(this.list, s, poe2PriceIndex(view?.priceOf ?? (() => null), view?.size ?? 0)),
      valuables: s.valuables.map((v) => ({ ...v, stale: now - v.at > STALE_MS })),
      screenTabs: totals?.screenTabs ?? [],
      screen: this.screen,
      history: chartPoints(points, now),
      latest: summaries.at(-1) ?? null,
      session,
      farmLinked: !!this.farm
    }
  }

  /** Для вкладки: состояние и цены (если пора — фид обновится фоном). */
  stateFresh(): Poe2WealthState {
    void this.refreshPrices()
    return this.state()
  }

  private emit(): void {
    this.deps.emit(this.state())
  }

  async detail(id?: unknown): Promise<WealthSnapshot | null> {
    if (typeof id === 'string' && id) return this.deps.store.loadDetail(id)
    const last = this.leagueSummaries().at(-1)
    return last ? this.deps.store.loadDetail(last.id) : null
  }

  /** «Что изменилось»: по умолчанию прошлый снимок → последний; 'session' — от начала сессии. */
  async diff(fromId?: unknown, toId?: unknown): Promise<WealthDiff | null> {
    const to = typeof toId === 'string' && toId ? await this.deps.store.loadDetail(toId) : await this.detail()
    if (!to) return null
    let from: WealthSnapshot | null = null
    if (fromId === 'session') {
      const s = this.link.session
      if (s && s.startId !== to.summary.id) from = await this.deps.store.loadDetail(s.startId)
    } else if (typeof fromId === 'string' && fromId) from = await this.deps.store.loadDetail(fromId)
    else {
      const list = this.leagueSummaries().filter((x) => x.at < to.summary.at)
      for (let i = list.length - 1; i >= 0 && !from; i--) from = await this.deps.store.loadDetail(list[i].id)
    }
    return from ? diffSnapshots(from, to) : null
  }
}
