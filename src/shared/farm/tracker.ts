// Забеги и сессия фарма по строкам Client.txt (чистый TS, без electron; этап S11b).
//
// Забег — от входа в карту (или прочий контент) из хайдаута/города до входа в ДРУГУЮ карту:
//  - экземпляр зоны = areaId + seed: порталы туда-обратно и перезаход после смерти дают тот же
//    seed — это тот же забег (entries + 1);
//  - зона, в которую вошли прямо из зоны забега (без хайдаута: побочная область, комнаты
//    лабиринта), — часть того же забега;
//  - вход в новый экземпляр из хайдаута/города закрывает забег (endTs = последний выход) и
//    открывает новый: события runEnd(A) → runStart(B) подряд;
//  - «Стоп» сессии закрывает открытый забег.
// Время забега (activeMs) идёт, пока игрок внутри и сессия не на паузе. Пауза снимается сама при
// входе в зону забега (игрок вернулся к игре). Без сессии забеги тоже пишутся (sessionId: null).
// Время: из строк лога (секунды, локальное время ПК) и Date.now() кнопок — отрицательные
// промежутки от округления обрезаются до нуля.

import type {
  FarmConfig,
  FarmEvent,
  FarmLocation,
  FarmProfit,
  FarmRun,
  FarmSession,
  FarmSessionSummary,
  FarmState,
  FarmStats
} from '../types/farm'
import { classifyArea, isRunArea, mapTier, parseFarmLine, type ZoneEnter } from './zones'

/** Сколько завершённых забегов и сессий хранить. */
export const FARM_RUNS_LIMIT = 1000
export const FARM_SESSIONS_LIMIT = 200
/** Сессия короче — «в час» не считаем (шум). */
const MIN_RATE_MS = 60_000
const HOUR = 3_600_000

export const DEFAULT_FARM_CONFIG: FarmConfig = { overlayWidget: false, widgetPos: null }

const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)

/** Позиция виджета: обе доли 0…1, иначе null (сверху по центру). */
export function cleanWidgetPos(v: unknown): FarmConfig['widgetPos'] {
  const p = v as { x?: unknown; y?: unknown } | null
  const x = unit(p?.x)
  const y = unit(p?.y)
  return x !== null && y !== null ? { x, y } : null
}

/** Всё, что трекер сохраняет (userData/farm.json). */
export interface FarmTrackerData {
  version: 1
  runs: FarmRun[]
  current: FarmRun | null
  /** экземпляры зон текущего забега: `${areaId}#${seed}` */
  currentZones: string[]
  inside: boolean
  /** начало текущего промежутка внутри (null — время не идёт) */
  enteredAt: number | null
  lastExit: number | null
  location: FarmLocation | null
  session: FarmSession | null
  sessions: FarmSessionSummary[]
  config: FarmConfig
  /** когда сохранено (для восстановления после выхода) */
  savedAt?: number
}

export function emptyFarmData(): FarmTrackerData {
  return {
    version: 1,
    runs: [],
    current: null,
    currentZones: [],
    inside: false,
    enteredAt: null,
    lastExit: null,
    location: null,
    session: null,
    sessions: [],
    config: { ...DEFAULT_FARM_CONFIG }
  }
}

const zoneKey = (z: ZoneEnter): string => `${z.areaId}#${z.seed}`
/** Копия забега наружу (события, снимок): прибыль — тоже копия. */
const copyRun = (r: FarmRun): FarmRun => (r.profit ? { ...r, profit: { ...r.profit } } : { ...r })

/** Прибыль от S11a: chaos обязателен, runs ≥ 1 (по умолчанию 1); прочее — если корректно. */
export function cleanProfit(v: unknown): FarmProfit | null {
  const p = v as Partial<FarmProfit> | null
  if (!p || typeof p.chaos !== 'number' || !Number.isFinite(p.chaos)) return null
  const runs = typeof p.runs === 'number' && Number.isFinite(p.runs) && p.runs >= 1 ? Math.floor(p.runs) : 1
  return {
    chaos: p.chaos,
    runs,
    ...(typeof p.divineRate === 'number' && Number.isFinite(p.divineRate) && p.divineRate > 0 ? { divineRate: p.divineRate } : {}),
    ...(p.low === true ? { low: true } : {})
  }
}
const span = (from: number, to: number): number => Math.max(0, to - from)

function cleanRun(r: unknown): FarmRun | null {
  const x = r as FarmRun
  if (!x || typeof x.id !== 'string' || typeof x.areaId !== 'string' || typeof x.startTs !== 'number') return null
  const profit = cleanProfit(x.profit)
  return {
    id: x.id,
    areaId: x.areaId,
    areaName: typeof x.areaName === 'string' ? x.areaName : null,
    kind: x.kind === 'other' ? 'other' : 'map',
    areaLevel: Number.isFinite(x.areaLevel) ? x.areaLevel : 0,
    tier: Number.isFinite(x.tier) ? x.tier : null,
    seed: typeof x.seed === 'string' ? x.seed : '',
    startTs: x.startTs,
    endTs: Number.isFinite(x.endTs) ? x.endTs : null,
    activeMs: Number.isFinite(x.activeMs) ? Math.max(0, x.activeMs) : 0,
    entries: Number.isFinite(x.entries) ? x.entries : 1,
    deaths: Number.isFinite(x.deaths) ? x.deaths : 0,
    sessionId: typeof x.sessionId === 'string' ? x.sessionId : null,
    ...(profit ? { profit } : {})
  }
}

/** Прочитанный с диска JSON → данные трекера (битые поля — по умолчанию). */
export function normalizeFarmData(raw: unknown): FarmTrackerData {
  const d = emptyFarmData()
  const x = (raw ?? {}) as Partial<FarmTrackerData>
  if (Array.isArray(x.runs)) d.runs = x.runs.map(cleanRun).filter((r): r is FarmRun => !!r).slice(0, FARM_RUNS_LIMIT)
  d.current = cleanRun(x.current)
  if (d.current) {
    d.current.endTs = null
    d.currentZones = Array.isArray(x.currentZones) ? x.currentZones.filter((k) => typeof k === 'string') : []
    if (d.currentZones.length === 0) d.currentZones = [`${d.current.areaId}#${d.current.seed}`]
    d.inside = x.inside === true
    d.enteredAt = d.inside && Number.isFinite(x.enteredAt) ? (x.enteredAt as number) : null
    d.lastExit = Number.isFinite(x.lastExit) ? (x.lastExit as number) : null
  }
  if (x.location && typeof x.location.areaId === 'string') d.location = { ...x.location }
  const s = x.session
  if (s && typeof s.id === 'string' && Number.isFinite(s.startedAt)) {
    d.session = {
      id: s.id,
      startedAt: s.startedAt,
      endedAt: null,
      pausedAt: Number.isFinite(s.pausedAt) ? s.pausedAt : null,
      pausedMs: Number.isFinite(s.pausedMs) ? Math.max(0, s.pausedMs) : 0
    }
  }
  if (Array.isArray(x.sessions)) {
    d.sessions = x.sessions
      .filter((v) => v && typeof v.id === 'string' && Number.isFinite(v.endedAt) && v.stats)
      .slice(0, FARM_SESSIONS_LIMIT)
  }
  if (x.config) d.config = { overlayWidget: x.config.overlayWidget === true, widgetPos: cleanWidgetPos(x.config.widgetPos) }
  if (Number.isFinite(x.savedAt)) d.savedAt = x.savedAt
  return d
}

export class FarmTracker {
  private d: FarmTrackerData

  constructor(data?: FarmTrackerData) {
    this.d = data ?? emptyFarmData()
  }

  /** Данные для сохранения (копия). */
  toData(savedAt?: number): FarmTrackerData {
    const copy = structuredClone(this.d)
    if (savedAt !== undefined) copy.savedAt = savedAt
    return copy
  }

  get config(): FarmConfig {
    return this.d.config
  }

  setConfig(patch: Partial<FarmConfig>): void {
    if (typeof patch.overlayWidget === 'boolean') this.d.config.overlayWidget = patch.overlayWidget
    if ('widgetPos' in patch) this.d.config.widgetPos = cleanWidgetPos(patch.widgetPos)
  }

  private get ticking(): boolean {
    return this.d.inside && this.d.enteredAt !== null
  }

  // ---------------------------------------------------------------------------
  // Строки лога
  // ---------------------------------------------------------------------------

  /** Строки Client.txt по порядку. `fallbackTs` — для строк без времени. */
  ingestLines(lines: string[], fallbackTs: number): FarmEvent[] {
    const out: FarmEvent[] = []
    for (const line of lines) {
      const p = parseFarmLine(line)
      if (!p) continue
      const ts = p.ts ?? fallbackTs
      if (p.event.type === 'zone') out.push(...this.enterZone(p.event.zone, ts))
      else if (p.event.type === 'areaName') this.areaName(p.event.name)
      else this.death()
    }
    return out
  }

  /** Вход в зону. */
  enterZone(zone: ZoneEnter, ts: number): FarmEvent[] {
    const d = this.d
    const out: FarmEvent[] = []
    const kind = classifyArea(zone.areaId, zone.level)
    const wasInside = d.inside
    this.leave(ts)
    d.location = { kind, areaId: zone.areaId, areaName: null, level: zone.level, since: ts }
    if (!isRunArea(kind)) return out

    // игрок вернулся к игре — пауза снимается сама
    if (d.session?.pausedAt != null) out.push(...this.resumeSession(ts))

    const key = zoneKey(zone)
    if (d.current && d.currentZones.includes(key)) {
      // портал обратно / перезаход после смерти — тот же экземпляр (возврат из побочной
      // области прямо в карту — не новый вход)
      if (!wasInside) d.current.entries += 1
    } else if (d.current && wasInside) {
      // прямо из зоны забега — побочная область, комната лабиринта
      d.currentZones.push(key)
    } else {
      if (d.current) out.push(this.finishRun(d.lastExit ?? ts, ts))
      const run: FarmRun = {
        id: `r${ts.toString(36)}${zone.seed.slice(-4)}`,
        areaId: zone.areaId,
        areaName: null,
        kind,
        areaLevel: zone.level,
        tier: kind === 'map' ? mapTier(zone.level) : null,
        seed: zone.seed,
        startTs: ts,
        endTs: null,
        activeMs: 0,
        entries: 1,
        deaths: 0,
        sessionId: d.session?.id ?? null
      }
      d.current = run
      d.currentZones = [key]
      out.push({ type: 'runStart', run: copyRun(run), at: ts })
    }
    d.inside = true
    d.enteredAt = d.session?.pausedAt != null ? null : ts
    return out
  }

  /** Имя зоны на языке клиента — для последней зоны и, если пусто, для забега. */
  areaName(name: string): void {
    const d = this.d
    if (!d.location || d.location.areaName) return
    d.location.areaName = name
    if (d.inside && d.current && !d.current.areaName && d.current.areaId === d.location.areaId) {
      d.current.areaName = name
    }
  }

  /** Смерть игрока: считаем только в зонах забега. */
  death(): void {
    if (this.d.inside && this.d.current) this.d.current.deaths += 1
  }

  /** Выход из текущей зоны: накопить время внутри. */
  private leave(ts: number): void {
    const d = this.d
    if (!d.inside) return
    if (d.current && d.enteredAt !== null) d.current.activeMs += span(d.enteredAt, ts)
    d.enteredAt = null
    d.inside = false
    d.lastExit = ts
  }

  private finishRun(endTs: number, at: number): FarmEvent {
    const d = this.d
    const run = d.current as FarmRun
    run.endTs = Math.max(run.startTs, endTs)
    d.runs.unshift(run)
    if (d.runs.length > FARM_RUNS_LIMIT) d.runs.length = FARM_RUNS_LIMIT
    d.current = null
    d.currentZones = []
    return { type: 'runEnd', run: copyRun(run), at }
  }

  /** Закрыть открытый забег (смена игры, «Стоп»). Если игрок внутри — конец сейчас. */
  endCurrentRun(ts: number): FarmEvent[] {
    const d = this.d
    if (!d.current) return []
    const inside = d.inside
    this.leave(ts)
    // игрок остаётся в зоне, но забега больше нет: следующий вход начнёт новый
    return [this.finishRun(inside ? ts : (d.lastExit ?? ts), ts)]
  }

  // ---------------------------------------------------------------------------
  // Сессия: Начать / Пауза / Продолжить / Стоп
  // ---------------------------------------------------------------------------

  startSession(ts: number): FarmEvent[] {
    const d = this.d
    if (d.session) return []
    const session: FarmSession = { id: `s${ts.toString(36)}`, startedAt: ts, endedAt: null, pausedAt: null, pausedMs: 0 }
    d.session = session
    // начали посреди карты — карта идёт в сессию
    if (d.current && !d.current.sessionId) d.current.sessionId = session.id
    return [{ type: 'session', state: 'start', session: { ...session }, at: ts }]
  }

  pauseSession(ts: number): FarmEvent[] {
    const s = this.d.session
    if (!s || s.pausedAt !== null) return []
    const d = this.d
    if (d.inside && d.current && d.enteredAt !== null) {
      d.current.activeMs += span(d.enteredAt, ts)
      d.enteredAt = null
    }
    s.pausedAt = Math.max(ts, s.startedAt)
    return [{ type: 'session', state: 'pause', session: { ...s }, at: ts }]
  }

  resumeSession(ts: number): FarmEvent[] {
    const s = this.d.session
    if (!s || s.pausedAt === null) return []
    s.pausedMs += span(s.pausedAt, ts)
    s.pausedAt = null
    if (this.d.inside && this.d.current) this.d.enteredAt = ts
    return [{ type: 'session', state: 'resume', session: { ...s }, at: ts }]
  }

  stopSession(ts: number): FarmEvent[] {
    const d = this.d
    const s = d.session
    if (!s) return []
    const out: FarmEvent[] = []
    if (s.pausedAt !== null) {
      s.pausedMs += span(s.pausedAt, ts)
      s.pausedAt = null
    }
    if (d.current?.sessionId === s.id) out.push(...this.endCurrentRun(ts))
    s.endedAt = Math.max(ts, s.startedAt)
    const summary: FarmSessionSummary = { ...s, endedAt: s.endedAt, stats: this.statsFor(s, s.endedAt) }
    d.sessions.unshift(summary)
    if (d.sessions.length > FARM_SESSIONS_LIMIT) d.sessions.length = FARM_SESSIONS_LIMIT
    d.session = null
    out.push({ type: 'session', state: 'stop', session: { ...s }, at: ts })
    return out
  }

  /**
   * Приложение закрывается (или запуск после закрытия): время внутри до `ts`, сессия на паузу —
   * пока приложение не работает, неизвестно, где игрок.
   */
  suspend(ts: number): FarmEvent[] {
    const out = this.pauseSession(ts)
    this.leave(ts)
    return out
  }

  /**
   * После перезапуска: по хвосту лога игрок всё ещё в зоне открытого забега (входа после
   * закрытия не было) — снова «внутри», без лишнего входа. Время пойдёт, когда сессия не на паузе.
   */
  markInside(zone: ZoneEnter, ts: number): boolean {
    const d = this.d
    if (!d.current || d.inside || !d.currentZones.includes(zoneKey(zone))) return false
    d.inside = true
    d.enteredAt = d.session?.pausedAt != null ? null : ts
    return true
  }

  // ---------------------------------------------------------------------------
  // История
  // ---------------------------------------------------------------------------

  /**
   * Прибыль забега от S11a (на группу из profit.runs забегов — на последний из них); null или
   * некорректная — убрать. false — забега нет.
   */
  setRunProfit(runId: string, profit: FarmProfit | null): boolean {
    const run = this.d.current?.id === runId ? this.d.current : this.d.runs.find((r) => r.id === runId)
    if (!run) return false
    const clean = cleanProfit(profit)
    if (clean) run.profit = clean
    else delete run.profit
    return true
  }

  removeRun(runId: string): boolean {
    const i = this.d.runs.findIndex((r) => r.id === runId)
    if (i < 0) return false
    this.d.runs.splice(i, 1)
    return true
  }

  /** Очистить историю забегов и сессий (открытый забег и идущая сессия остаются). */
  clearHistory(): void {
    this.d.runs = []
    this.d.sessions = []
  }

  // ---------------------------------------------------------------------------
  // Снимок
  // ---------------------------------------------------------------------------

  /** activeMs забега на момент `now` (у текущего — с идущим промежутком). */
  private liveActive(run: FarmRun, now: number): number {
    const d = this.d
    return run === d.current && d.enteredAt !== null ? run.activeMs + span(d.enteredAt, now) : run.activeMs
  }

  private statsFor(s: FarmSession, now: number): FarmStats {
    const d = this.d
    const end = s.endedAt ?? now
    const pausedNow = s.pausedAt !== null ? span(s.pausedAt, end) : 0
    const durationMs = Math.max(0, end - s.startedAt - s.pausedMs - pausedNow)
    const runs = d.runs.filter((r) => r.sessionId === s.id)
    const all = d.current?.sessionId === s.id ? [d.current, ...runs] : runs
    const maps = all.filter((r) => r.kind === 'map').length
    const doneMaps = runs.filter((r) => r.kind === 'map')
    const withProfit = all.filter((r) => r.profit)
    const profitChaos = withProfit.length ? withProfit.reduce((a, r) => a + (r.profit as FarmProfit).chaos, 0) : null
    const hours = durationMs / HOUR
    const rated = durationMs >= MIN_RATE_MS
    return {
      durationMs,
      maps,
      runs: all.length,
      mapsPerHour: rated ? maps / hours : null,
      avgMapMs: doneMaps.length ? doneMaps.reduce((a, r) => a + r.activeMs, 0) / doneMaps.length : null,
      fastestMapMs: doneMaps.length ? Math.min(...doneMaps.map((r) => r.activeMs)) : null,
      deaths: all.reduce((a, r) => a + r.deaths, 0),
      mapsWithDeaths: all.filter((r) => r.kind === 'map' && r.deaths > 0).length,
      profitChaos,
      profitPerHour: profitChaos !== null && rated ? profitChaos / hours : null
    }
  }

  /** Состояние для renderer и S11a; `runsLimit` — сколько забегов отдать в историю. */
  snapshot(now: number, runsLimit = FARM_RUNS_LIMIT): FarmState {
    const d = this.d
    const current = d.current ? { ...copyRun(d.current), activeMs: this.liveActive(d.current, now) } : null
    return {
      at: now,
      current,
      inside: d.inside,
      ticking: this.ticking,
      location: d.location ? { ...d.location } : null,
      session: d.session ? { ...d.session } : null,
      stats: d.session ? this.statsFor(d.session, now) : null,
      runs: d.runs.slice(0, runsLimit).map(copyRun),
      sessions: d.sessions.map((s) => ({ ...s, stats: { ...s.stats } })),
      config: { ...d.config, widgetPos: d.config.widgetPos ? { ...d.config.widgetPos } : null }
    }
  }
}
