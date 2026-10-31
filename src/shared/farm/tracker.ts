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
//
// PoE 2 (S69) — те же забеги по своим правилам (FarmRules из zonesPoe2.ts): ярус T1–T16, смерть карту не
// закрывает (воскрешение в том же экземпляре — та же строка входа с тем же seed). Подобласть (Abyssal
// Depths, пещеры Экспедиции) входит в открытый забег и тогда, когда в неё вернулись через убежище с
// новым seed (экземпляр истёк), если с выхода прошло не больше 15 мин. Прибыли по тайнику у PoE 2 нет:
// «+ находка» к забегу (окно цены, ручной ввод) и прибыль сессии от «Богатства» (S70).

import type {
  FarmConfig,
  FarmEvent,
  FarmFind,
  FarmFindRarity,
  FarmFindResult,
  FarmLocation,
  FarmProfit,
  FarmProfitMark,
  FarmProfitMode,
  FarmRun,
  FarmSession,
  FarmSessionProfit,
  FarmSessionSummary,
  FarmState,
  FarmStats
} from '../types/farm'
import { POE1_FARM_RULES, isRunArea, parseFarmLine, type FarmRules, type ZoneEnter } from './zones'

/** Сколько завершённых забегов и сессий хранить. */
export const FARM_RUNS_LIMIT = 1000
export const FARM_SESSIONS_LIMIT = 200
/** Сколько находок у одного забега. */
export const FARM_FINDS_LIMIT = 200
/** Сессия короче — «в час» не считаем (шум). */
const MIN_RATE_MS = 60_000
const HOUR = 3_600_000
/** Подобласть с новым seed через убежище — та же карта, если вернулись не позже. */
const SUB_REJOIN_MS = 15 * 60_000
const REF_MAX = 200
const QTY_MAX = 1_000_000

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
/** Копия забега наружу (события, снимок): прибыль и находки — тоже копии. */
function copyRun(r: FarmRun): FarmRun {
  const c: FarmRun = { ...r }
  if (r.profit) c.profit = { ...r.profit }
  if (r.finds) c.finds = r.finds.map((f) => ({ ...f }))
  return c
}
/** Копия сессии наружу: прибыль и отметка начала — тоже копии. */
function copySession<T extends FarmSession>(s: T): T {
  const c = { ...s }
  if (s.profit) c.profit = { ...s.profit }
  if (s.profitStart) c.profitStart = { ...s.profitStart }
  return c
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
// без управляющих символов: строка уходит в интерфейс и в farm.json
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= REF_MAX && !CONTROL.test(t) ? t : null
}

/**
 * Находка от окна цены или ручного ввода (PoE 2): ref — непустая строка до 200 знаков, qty — целое
 * 1…1 000 000 (по умолчанию 1), valueEx — цена всей находки ≥ 0 или null (неизвестна). Иначе null.
 */
const RARITIES: readonly FarmFindRarity[] = ['normal', 'magic', 'rare', 'unique', 'currency', 'gem']

export function cleanFindInput(
  v: unknown
): { ref: string; name?: string; rarity?: FarmFindRarity; qty: number; valueEx: number | null; source: FarmFind['source']; runId?: string } | null {
  const x = v as Partial<FarmFind & { runId: unknown }> | null
  if (!x || typeof x !== 'object') return null
  const ref = cleanText(x.ref)
  if (!ref) return null
  const qty = x.qty === undefined ? 1 : x.qty
  if (!finite(qty) || !Number.isInteger(qty) || qty < 1 || qty > QTY_MAX) return null
  const valueEx = x.valueEx === null || x.valueEx === undefined ? null : x.valueEx
  if (valueEx !== null && (!finite(valueEx) || valueEx < 0)) return null
  const name = cleanText(x.name)
  return {
    ref,
    ...(name && name !== ref ? { name } : {}),
    ...(RARITIES.includes(x.rarity as FarmFindRarity) ? { rarity: x.rarity } : {}),
    qty,
    valueEx,
    source: x.source === 'ctrlD' || x.source === 'quick' ? x.source : 'manual',
    ...(typeof x.runId === 'string' && x.runId ? { runId: x.runId } : {})
  }
}

function cleanFind(v: unknown): FarmFind | null {
  const x = v as Partial<FarmFind> | null
  const f = cleanFindInput(x)
  if (!f || typeof x?.id !== 'string' || !finite(x.at)) return null
  const { runId: _r, ...rest } = f
  void _r
  return { id: x.id, ...rest, at: x.at }
}

/** Режим прибыли PoE 2 из диалога; иначе undefined. */
export function cleanProfitMode(v: unknown): FarmProfitMode | undefined {
  return v === 'snapshot' || v === 'manual' || v === 'none' ? v : undefined
}

/** Отметка начала или конца от «Богатства» (S70): at по умолчанию — `now`; tabs — целое 1…100. */
export function cleanProfitMark(v: unknown, now = 0): FarmProfitMark | null {
  const p = v as Partial<FarmProfitMark> | null
  if (!p || typeof p !== 'object') return null
  const tabs = p.tabs
  return {
    source: p.source === 'snapshot' ? 'snapshot' : 'manual',
    at: finite(p.at) ? p.at : now,
    ...(finite(tabs) && Number.isInteger(tabs) && tabs >= 1 && tabs <= 100 ? { tabs } : {})
  }
}

/** Прибыль сессии от «Богатства» (S70): ex обязателен; at по умолчанию — `now`. Иначе null. */
export function cleanSessionProfit(v: unknown, now = 0): FarmSessionProfit | null {
  const p = v as Partial<FarmSessionProfit> | null
  if (!p || !finite(p.ex)) return null
  return {
    ex: p.ex,
    ...(finite(p.exPerDiv) && p.exPerDiv > 0 ? { exPerDiv: p.exPerDiv } : {}),
    ...(cleanProfitMark(p, now) as FarmProfitMark)
  }
}

/** Σ цен находок; null — ни одной с ценой. */
function findsValue(finds: FarmFind[]): number | null {
  const priced = finds.filter((f) => f.valueEx !== null)
  return priced.length ? priced.reduce((a, f) => a + (f.valueEx as number), 0) : null
}

/** Поля PoE 2 в статистике: итог = прибыль сессии от «Богатства» + находки, в час — он же. */
function exStats(finds: FarmFind[], profit: FarmSessionProfit | undefined, durationMs: number): Partial<FarmStats> {
  const findsEx = findsValue(finds)
  const profitEx = profit ? profit.ex : null
  const totalEx = profitEx === null && findsEx === null ? null : (profitEx ?? 0) + (findsEx ?? 0)
  return {
    finds: finds.length,
    findsEx,
    profitEx,
    totalEx,
    exPerHour: totalEx !== null && durationMs >= MIN_RATE_MS ? totalEx / (durationMs / HOUR) : null
  }
}

/** Поля PoE 2 сессии из farm.json (битые — отброшены). */
function cleanSessionExtras(s: Partial<FarmSession>): Partial<FarmSession> {
  const out: Partial<FarmSession> = {}
  const mode = cleanProfitMode(s.profitMode)
  if (mode) out.profitMode = mode
  const end = cleanProfitMode(s.profitEnd)
  if (end) out.profitEnd = end
  const start = s.profitStart ? cleanProfitMark(s.profitStart) : null
  if (start) out.profitStart = start
  const profit = cleanSessionProfit(s.profit)
  if (profit) out.profit = profit
  return out
}

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

/** Метка стратегии советника (S16): id из strategies.json, иначе нет метки. */
export function cleanStrategy(v: unknown): string | undefined {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(v) ? v : undefined
}

function cleanRun(r: unknown): FarmRun | null {
  const x = r as FarmRun
  if (!x || typeof x.id !== 'string' || typeof x.areaId !== 'string' || typeof x.startTs !== 'number') return null
  const profit = cleanProfit(x.profit)
  const finds = Array.isArray(x.finds)
    ? x.finds.map(cleanFind).filter((f): f is FarmFind => !!f).slice(0, FARM_FINDS_LIMIT)
    : []
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
    ...(profit ? { profit } : {}),
    ...(finds.length ? { finds } : {})
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
    const strategy = cleanStrategy(s.strategy)
    if (strategy) d.session.strategy = strategy
    Object.assign(d.session, cleanSessionExtras(s))
  }
  if (Array.isArray(x.sessions)) {
    d.sessions = x.sessions
      .filter((v) => v && typeof v.id === 'string' && Number.isFinite(v.endedAt) && v.stats)
      .slice(0, FARM_SESSIONS_LIMIT)
      .map((v): FarmSessionSummary => {
        // у PoE 1 полей PoE 2 нет — запись как была
        if (v.profit === undefined && v.profitMode === undefined && v.profitStart === undefined && v.profitEnd === undefined) return v
        const { profit: _p, profitMode: _m, profitStart: _s, profitEnd: _e, ...rest } = v
        void [_p, _m, _s, _e]
        return { ...rest, ...cleanSessionExtras(v), endedAt: v.endedAt }
      })
  }
  if (x.config) d.config = { overlayWidget: x.config.overlayWidget === true, widgetPos: cleanWidgetPos(x.config.widgetPos) }
  if (Number.isFinite(x.savedAt)) d.savedAt = x.savedAt
  return d
}

export class FarmTracker {
  private d: FarmTrackerData
  private readonly rules: FarmRules

  /** `rules` — правила игры (по умолчанию PoE 1; PoE 2 — poe2FarmRules из zonesPoe2.ts). */
  constructor(data?: FarmTrackerData, rules: FarmRules = POE1_FARM_RULES) {
    this.d = data ?? emptyFarmData()
    this.rules = rules
  }

  get game(): FarmRules['game'] {
    return this.rules.game
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
      const p = parseFarmLine(line, this.rules)
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
    const kind = this.rules.classify(zone.areaId, zone.level)
    const wasInside = d.inside
    const from = d.location?.kind
    this.leave(ts)
    d.location = { kind, areaId: zone.areaId, areaName: null, level: zone.level, since: ts }
    if (!isRunArea(kind)) return out

    // игрок вернулся к игре — пауза снимается сама
    if (d.session?.pausedAt != null) out.push(...this.resumeSession(ts))

    const key = zoneKey(zone)
    // PoE 2: в подобласть вернулись через убежище, а экземпляр новый (истёк) — всё та же карта
    const subAgain =
      kind === 'sub' &&
      !wasInside &&
      (from === 'hideout' || from === 'town') &&
      d.lastExit !== null &&
      ts - d.lastExit <= SUB_REJOIN_MS
    if (d.current && d.currentZones.includes(key)) {
      // портал обратно / перезаход после смерти — тот же экземпляр (возврат из побочной
      // области прямо в карту — не новый вход)
      if (!wasInside) d.current.entries += 1
    } else if (d.current && (wasInside || subAgain)) {
      // прямо из зоны забега — побочная область, комната лабиринта; подобласть PoE 2
      d.currentZones.push(key)
      if (!wasInside) d.current.entries += 1
    } else {
      if (d.current) out.push(this.finishRun(d.lastExit ?? ts, ts))
      const run: FarmRun = {
        id: `r${ts.toString(36)}${zone.seed.slice(-4)}`,
        areaId: zone.areaId,
        areaName: null,
        kind: kind === 'map' ? 'map' : 'other',
        areaLevel: zone.level,
        tier: kind === 'map' ? this.rules.tier(zone.level) : null,
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

  /**
   * `strategy` — метка стратегии советника (S16), необязательна; `profitMode` — PoE 2: чем отметить начало
   * (диалог «Чем отметить начало?»), S70 видит его в событии session:start.
   */
  startSession(ts: number, strategy?: string, profitMode?: FarmProfitMode): FarmEvent[] {
    const d = this.d
    if (d.session) return []
    const out: FarmEvent[] = []
    const session: FarmSession = { id: `s${ts.toString(36)}`, startedAt: ts, endedAt: null, pausedAt: null, pausedMs: 0 }
    const tag = cleanStrategy(strategy)
    if (tag) session.strategy = tag
    const mode = cleanProfitMode(profitMode)
    if (mode) session.profitMode = mode
    if (d.current && !d.current.sessionId) {
      // начали посреди карты — карта идёт в сессию; в убежище с открытым прошлым забегом — он
      // закрывается до начала сессии (его время и прибыль к сессии не относятся)
      if (d.inside) d.current.sessionId = session.id
      else out.push(this.finishRun(d.lastExit ?? ts, ts))
    }
    d.session = session
    out.push({ type: 'session', state: 'start', session: copySession(session), at: ts })
    return out
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
    return [{ type: 'session', state: 'pause', session: copySession(s), at: ts }]
  }

  resumeSession(ts: number): FarmEvent[] {
    const s = this.d.session
    if (!s || s.pausedAt === null) return []
    s.pausedMs += span(s.pausedAt, ts)
    s.pausedAt = null
    if (this.d.inside && this.d.current) this.d.enteredAt = ts
    return [{ type: 'session', state: 'resume', session: copySession(s), at: ts }]
  }

  /** `profitMode` — PoE 2: как посчитать прибыль (диалог «Как посчитать прибыль?»), S70 видит его в session:stop. */
  stopSession(ts: number, profitMode?: FarmProfitMode): FarmEvent[] {
    const d = this.d
    const s = d.session
    if (!s) return []
    const out: FarmEvent[] = []
    const end = cleanProfitMode(profitMode)
    if (end) s.profitEnd = end
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
    out.push({ type: 'session', state: 'stop', session: copySession(s), at: ts })
    return out
  }

  /**
   * Отметка начала от «Богатства» (S70): снимок N вкладок или ввод валюты — у идущей сессии (или у
   * завершённой, если пришла поздно). null — убрать. false — сессии нет.
   */
  setSessionStart(sessionId: string, mark: FarmProfitMark | null, ts: number): boolean {
    const d = this.d
    const target = d.session?.id === sessionId ? d.session : d.sessions.find((s) => s.id === sessionId)
    if (!target) return false
    const clean = mark ? cleanProfitMark(mark, ts) : null
    if (clean) target.profitStart = clean
    else delete target.profitStart
    return true
  }

  /**
   * Прибыль сессии от «Богатства» (S70) — у идущей или завершённой (итог обычно приходит сразу после
   * «Стоп»: снимок или ввод в конце). null или некорректная — убрать. false — сессии нет.
   */
  setSessionProfit(sessionId: string, profit: FarmSessionProfit | null, ts: number): boolean {
    const d = this.d
    const clean = cleanSessionProfit(profit, ts)
    const live = d.session?.id === sessionId ? d.session : null
    const sum = live ? null : d.sessions.find((s) => s.id === sessionId)
    const target = live ?? sum
    if (!target) return false
    if (clean) target.profit = clean
    else delete target.profit
    if (sum) this.refreshSummary(sum)
    return true
  }

  /** Метка стратегии советника (S16) у идущей сессии; null — снять. false — сессии нет. */
  setSessionStrategy(strategy: string | null): boolean {
    const s = this.d.session
    if (!s) return false
    const tag = cleanStrategy(strategy)
    if (tag) s.strategy = tag
    else delete s.strategy
    return true
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

  private runById(runId: string): FarmRun | null {
    return this.d.current?.id === runId ? this.d.current : (this.d.runs.find((r) => r.id === runId) ?? null)
  }

  /**
   * «+ находка» к забегу (PoE 2: окно цены по Ctrl+D или ручной ввод). Без `runId` — открытый забег
   * (в убежище после карты он ещё открыт), а если его нет — последний забег идущей сессии.
   */
  addFind(input: unknown, ts: number): FarmFindResult {
    const d = this.d
    const f = cleanFindInput(input)
    if (!f) return { ok: false, reason: 'invalid' }
    const sid = d.session?.id
    const run = f.runId
      ? this.runById(f.runId)
      : (d.current ?? (sid ? (d.runs.find((r) => r.sessionId === sid) ?? null) : null))
    if (!run) return { ok: false, reason: 'noRun' }
    const finds = run.finds ?? []
    if (finds.length >= FARM_FINDS_LIMIT) return { ok: false, reason: 'full' }
    let id = `f${ts.toString(36)}`
    for (let n = 1; finds.some((x) => x.id === id); n += 1) id = `f${ts.toString(36)}-${n}`
    const find: FarmFind = {
      id,
      ref: f.ref,
      ...(f.name ? { name: f.name } : {}),
      ...(f.rarity ? { rarity: f.rarity } : {}),
      qty: f.qty,
      valueEx: f.valueEx,
      at: ts,
      source: f.source
    }
    run.finds = [...finds, find]
    this.refreshSummaryOf(run)
    return { ok: true, runId: run.id, find: { ...find } }
  }

  /** Убрать находку. false — нет такого забега или находки. */
  removeFind(runId: string, findId: string): boolean {
    const run = this.runById(runId)
    const i = run?.finds?.findIndex((f) => f.id === findId) ?? -1
    if (!run?.finds || i < 0) return false
    run.finds.splice(i, 1)
    if (run.finds.length === 0) delete run.finds
    this.refreshSummaryOf(run)
    return true
  }

  /** Находки забега завершённой сессии поменялись — пересчитать её итог. */
  private refreshSummaryOf(run: FarmRun): void {
    const sum = run.sessionId ? this.d.sessions.find((s) => s.id === run.sessionId) : undefined
    if (sum) this.refreshSummary(sum)
  }

  /** Поля PoE 2 в итоге завершённой сессии (находки её забегов, что остались в истории, и прибыль S70). */
  private refreshSummary(sum: FarmSessionSummary): void {
    const finds = this.d.runs.filter((r) => r.sessionId === sum.id).flatMap((r) => r.finds ?? [])
    sum.stats = { ...sum.stats, ...exStats(finds, sum.profit, sum.stats.durationMs) }
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
      profitPerHour: profitChaos !== null && rated ? profitChaos / hours : null,
      // PoE 2: находки и прибыль сессии (у PoE 1 этих полей нет)
      ...(this.rules.game === 'poe2' ? exStats(all.flatMap((r) => r.finds ?? []), s.profit, durationMs) : {})
    }
  }

  /** Состояние для renderer и S11a; `runsLimit` — сколько забегов отдать в историю. */
  snapshot(now: number, runsLimit = FARM_RUNS_LIMIT): FarmState {
    const d = this.d
    const current = d.current ? { ...copyRun(d.current), activeMs: this.liveActive(d.current, now) } : null
    return {
      game: this.rules.game,
      at: now,
      current,
      inside: d.inside,
      ticking: this.ticking,
      location: d.location ? { ...d.location } : null,
      session: d.session ? copySession(d.session) : null,
      stats: d.session ? this.statsFor(d.session, now) : null,
      runs: d.runs.slice(0, runsLimit).map(copyRun),
      sessions: d.sessions.map((s) => ({ ...copySession(s), stats: { ...s.stats } })),
      config: { ...d.config, widgetPos: d.config.widgetPos ? { ...d.config.widgetPos } : null }
    }
  }
}
