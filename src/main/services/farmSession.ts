import { EventEmitter } from 'events'
import { mkdirSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { GameId } from '@shared/games'
import type {
  FarmConfigPatch,
  FarmEvent,
  FarmFindResult,
  FarmProfit,
  FarmSessionProfit,
  FarmState
} from '@shared/types/farm'
import { FarmTracker, normalizeFarmData } from '@shared/farm/tracker'
import { POE1_FARM_RULES, parseFarmLine, type FarmRules, type ZoneEnter } from '@shared/farm/zones'
import { poe2FarmRules } from '@shared/farm/zonesPoe2'
import { readJson, writeJsonAtomic } from './atomicJson'

// Трекер карт и сессия фарма в main (этап S11b; PoE 2 — S69): забеги по строкам Client.txt (общий
// тейлер gameLog подписывает домен ipc/farm.ts), кнопки «Начать / Пауза / Стоп». Свой сервис и своя
// история на игру: userData/farm.json (PoE 1) и userData/farm.poe2.json (PoE 2). API для учёта
// богатства — ниже: S11a (PoE 1) — onFarmEvent / getFarmState / setRunProfit (по умолчанию PoE 1);
// S70 и окно цены (PoE 2) — те же с game 'poe2', плюс addRunFind / removeRunFind / setSessionProfit.
//
// Перезапуск приложения: при выходе сессия встаёт на паузу (неизвестно, что игрок делает, пока
// приложения нет); при запуске строки хвоста лога, записанные после выхода, проходят как обычные
// (вошёл в карту без приложения — забег засчитан с настоящего времени входа), а если входа не
// было и игрок всё ещё в зоне открытого забега — он снова «внутри».

/** Строки хвоста лога старше — не догоняем (часами раньше приложение могло и не работать). */
const PRIME_MAX_AGE_MS = 2 * 3_600_000
const SAVE_DELAY_MS = 800
/** Сколько завершённых забегов отдавать в renderer (вся история — в farm.json). */
export const FARM_STATE_RUNS = 300

export class FarmSessionService extends EventEmitter {
  private rules: FarmRules
  private tracker: FarmTracker
  private loadRules: (() => Promise<FarmRules>) | null = null
  private loaded: Promise<void> | null = null
  private savedAt: number | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> = Promise.resolve()
  /** строки, пришедшие до конца догонки по хвосту лога */
  private queue: string[] | null = null

  constructor(
    private file: string | null,
    private readonly now: () => number = () => Date.now(),
    readonly game: GameId = 'poe1'
  ) {
    super()
    // PoE 2 до загрузки данных областей — по шаблонам id
    this.rules = game === 'poe2' ? poe2FarmRules(null) : POE1_FARM_RULES
    this.tracker = new FarmTracker(undefined, this.rules)
  }

  /** Файл истории (до первой загрузки); без файла — только в памяти. */
  setFile(file: string): void {
    if (!this.loaded) this.file = file
  }

  /** Откуда взять правила игры при загрузке (PoE 2 — данные областей с диска); до первой загрузки. */
  setRulesLoader(load: () => Promise<FarmRules>): void {
    if (!this.loaded) this.loadRules = load
  }

  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        if (this.loadRules) {
          const rules = await this.loadRules().catch((e: unknown) => {
            console.error('[farm] правила игры:', e)
            return null
          })
          if (rules && rules.game === this.game) this.rules = rules
        }
        const raw = this.file ? await readJson<unknown>(this.file, null) : null
        const data = normalizeFarmData(raw)
        this.savedAt = data.savedAt ?? null
        this.tracker = new FarmTracker(data, this.rules)
        // выход без сохранения (сбой): закрываем то, что было, на момент последнего сохранения
        const ev = this.tracker.suspend(this.savedAt ?? this.now())
        this.dispatch(ev, false)
      })()
    }
    return this.loaded
  }

  // ---------------------------------------------------------------------------
  // Строки лога
  // ---------------------------------------------------------------------------

  /** Новые строки Client.txt от тейлера. */
  ingestLines(lines: string[]): void {
    if (this.queue) {
      this.queue.push(...lines)
      return
    }
    this.dispatch(this.tracker.ingestLines(lines, this.now()))
  }

  /**
   * Догнать хвост лога после запуска: строки после последнего сохранения (не старше 2 ч) —
   * как обычные; иначе, если игрок всё ещё в зоне открытого забега, — снова «внутри».
   * Пока идёт догонка, новые строки копятся и проходят после неё (порядок не ломается).
   */
  async prime(readTail: () => Promise<string[]>): Promise<void> {
    this.queue = this.queue ?? []
    try {
      await this.load()
      const lines = await readTail().catch(() => [] as string[])
      const now = this.now()
      const since = Math.max(this.savedAt ?? 0, now - PRIME_MAX_AGE_MS)
      let lastZone: { zone: ZoneEnter; ts: number } | null = null
      const fresh: string[] = []
      for (const line of lines) {
        const p = parseFarmLine(line, this.rules)
        if (!p || p.ts === null) continue
        if (p.ts > since) fresh.push(line)
        if (p.event.type === 'zone') lastZone = { zone: p.event.zone, ts: p.ts }
      }
      if (fresh.length) this.dispatch(this.tracker.ingestLines(fresh, now), false)
      else if (lastZone && lastZone.ts > now - PRIME_MAX_AGE_MS) this.tracker.markInside(lastZone.zone, now)
    } finally {
      const queued = this.queue ?? []
      this.queue = null
      if (queued.length) this.dispatch(this.tracker.ingestLines(queued, this.now()), false)
      this.changed()
    }
  }

  // ---------------------------------------------------------------------------
  // Кнопки сессии и история
  // ---------------------------------------------------------------------------

  /** `strategy` — метка стратегии советника «что фармить» (S16). */
  async start(strategy?: string): Promise<FarmState> {
    await this.load()
    this.dispatch(this.tracker.startSession(this.now(), strategy))
    return this.state()
  }

  /** Метка стратегии советника (S16) у идущей сессии; null — снять. false — сессии нет. */
  async setStrategy(strategy: string | null): Promise<boolean> {
    await this.load()
    const ok = this.tracker.setSessionStrategy(strategy)
    if (ok) this.changed()
    return ok
  }

  async pause(): Promise<FarmState> {
    await this.load()
    this.dispatch(this.tracker.pauseSession(this.now()))
    return this.state()
  }

  async resume(): Promise<FarmState> {
    await this.load()
    this.dispatch(this.tracker.resumeSession(this.now()))
    return this.state()
  }

  async stop(): Promise<FarmState> {
    await this.load()
    this.dispatch(this.tracker.stopSession(this.now()))
    return this.state()
  }

  async setConfig(patch: FarmConfigPatch): Promise<FarmState> {
    await this.load()
    this.tracker.setConfig(patch)
    this.changed()
    return this.state()
  }

  /** Прибыль забега (S11a). false — забега нет в истории. */
  async setRunProfit(runId: string, profit: FarmProfit | null): Promise<boolean> {
    await this.load()
    const ok = this.tracker.setRunProfit(runId, profit)
    if (ok) this.changed()
    return ok
  }

  async removeRun(runId: string): Promise<FarmState> {
    await this.load()
    if (this.tracker.removeRun(runId)) this.changed()
    return this.state()
  }

  /** «+ находка» к забегу (PoE 2: окно цены, ручной ввод); вход проверяет трекер. */
  async addFind(input: unknown): Promise<FarmFindResult> {
    await this.load()
    const r = this.tracker.addFind(input, this.now())
    if (r.ok) this.changed()
    return r
  }

  async removeFind(runId: string, findId: string): Promise<boolean> {
    await this.load()
    const ok = this.tracker.removeFind(runId, findId)
    if (ok) this.changed()
    return ok
  }

  /** Прибыль сессии от «Богатства» (S70); null — убрать. false — сессии нет. */
  async setSessionProfit(sessionId: string, profit: FarmSessionProfit | null): Promise<boolean> {
    await this.load()
    const ok = this.tracker.setSessionProfit(sessionId, profit, this.now())
    if (ok) this.changed()
    return ok
  }

  async clearHistory(): Promise<FarmState> {
    await this.load()
    this.tracker.clearHistory()
    this.changed()
    return this.state()
  }

  /** Смена игры: закрыть открытый забег. */
  async endRun(): Promise<void> {
    await this.load()
    this.dispatch(this.tracker.endCurrentRun(this.now()))
  }

  /** Выход из приложения: пауза сессии, время внутри — до сейчас, сохранить сразу. */
  async suspend(): Promise<void> {
    if (!this.loaded) return
    await this.loaded
    this.dispatch(this.tracker.suspend(this.now()), false)
    await this.flush()
  }

  /**
   * То же для `before-quit`: синхронно (асинхронная запись может не успеть до выхода).
   * Запись атомарная: временный файл → rename.
   */
  suspendSync(): void {
    if (!this.loaded || !this.file) return
    this.tracker.suspend(this.now())
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.tracker.toData(this.now()), null, 2), 'utf8')
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('[farm] сохранение при выходе:', e)
    }
  }

  /** Раз в минуту, пока время идёт: сохранить (после сбоя потеряется не больше минуты). */
  heartbeat(): void {
    const st = this.tracker.snapshot(this.now(), 0)
    if (st.ticking || (st.session && st.session.pausedAt === null)) this.scheduleSave()
  }

  state(runsLimit = FARM_STATE_RUNS): FarmState {
    return this.tracker.snapshot(this.now(), runsLimit)
  }

  // ---------------------------------------------------------------------------

  private dispatch(events: FarmEvent[], notify = true): void {
    for (const e of events) this.emit('farm', e)
    if (events.length || notify) this.changed()
  }

  private changed(): void {
    this.scheduleSave()
    this.emit('changed', this.state())
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, SAVE_DELAY_MS)
  }

  /** Записать farm.json сейчас (по очереди с предыдущей записью). */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const file = this.file
    if (!file) return this.saving
    this.saving = this.saving
      .then(() => writeJsonAtomic(file, this.tracker.toData(this.now())))
      .catch((e) => console.error('[farm] сохранение:', e))
    return this.saving
  }
}

// ---------------------------------------------------------------------------
// Сервис на игру + API для учёта богатства (main, в процессе): S11a — PoE 1, S70 — PoE 2
// ---------------------------------------------------------------------------

/** Сервисы процесса; файл и правила задаёт домен ipc/farm.ts (farm.json, farm.poe2.json) до первой загрузки. */
const services = new Map<GameId, FarmSessionService>()

export function getFarmService(game: GameId = 'poe1'): FarmSessionService {
  let s = services.get(game)
  if (!s) {
    s = new FarmSessionService(null, undefined, game)
    services.set(game, s)
  }
  return s
}

/**
 * События забегов и сессии игры (S11a: прибыль за карту по снапшотам стэша; S70: снимок в начале и
 * в конце сессии PoE 2). На переходе карта A → карта B — синхронно runEnd(A), затем runStart(B).
 * Подписываться можно в любой момент (и до подъёма домена). Возвращает отписку.
 */
export function onFarmEvent(cb: (e: FarmEvent) => void, game: GameId = 'poe1'): () => void {
  const farm = getFarmService(game)
  const listener = (e: FarmEvent): void => {
    try {
      cb(e)
    } catch (err) {
      console.error('[farm] подписчик события:', err)
    }
  }
  farm.on('farm', listener)
  return () => {
    farm.off('farm', listener)
  }
}

/** Состояние трекера игры: текущий забег, сессия, статистика, история (последние `runsLimit`). */
export function getFarmState(runsLimit?: number, game: GameId = 'poe1'): FarmState {
  return getFarmService(game).state(runsLimit)
}

/** Прибыль забега от S11a (в хаосах-эквиваленте); null — убрать. false — забега нет. */
export function setRunProfit(runId: string, profit: FarmProfit | null, game: GameId = 'poe1'): Promise<boolean> {
  return getFarmService(game).setRunProfit(runId, profit)
}

/**
 * «+ находка» к забегу PoE 2 (окно цены по Ctrl+D, ручной ввод; из renderer — IPC farm:addFind):
 * `{ ref, name?, qty?, valueEx, source?, runId? }`, valueEx — цена всей находки в exalted или null.
 * Без runId — открытый забег, а если его нет — последний забег идущей сессии.
 */
export function addRunFind(input: unknown, game: GameId = 'poe2'): Promise<FarmFindResult> {
  return getFarmService(game).addFind(input)
}

export function removeRunFind(runId: string, findId: string, game: GameId = 'poe2'): Promise<boolean> {
  return getFarmService(game).removeFind(runId, findId)
}

/**
 * Прибыль сессии PoE 2 от «Богатства» (S70): снимок или ввод в начале и в конце, разница — в exalted.
 * Можно у идущей сессии (промежуточная) и у завершённой (итог после «Стоп»). null — убрать.
 */
export function setSessionProfit(sessionId: string, profit: FarmSessionProfit | null, game: GameId = 'poe2'): Promise<boolean> {
  return getFarmService(game).setSessionProfit(sessionId, profit)
}
