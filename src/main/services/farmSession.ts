import { EventEmitter } from 'events'
import { mkdirSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { FarmConfigPatch, FarmEvent, FarmProfit, FarmState } from '@shared/types/farm'
import { FarmTracker, normalizeFarmData } from '@shared/farm/tracker'
import { parseFarmLine, type ZoneEnter } from '@shared/farm/zones'
import { readJson, writeJsonAtomic } from './atomicJson'

// Трекер карт и сессия фарма в main (этап S11b): забеги по строкам Client.txt (общий тейлер
// gameLog подписывает домен ipc/farm.ts), кнопки «Начать / Пауза / Стоп», история в
// userData/farm.json. API для учёта богатства (S11a) — onFarmEvent / getFarmState /
// setRunProfit ниже: события начала и конца забега, прибыль забега по снапшотам стэша.
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
  private tracker = new FarmTracker()
  private loaded: Promise<void> | null = null
  private savedAt: number | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> = Promise.resolve()
  /** строки, пришедшие до конца догонки по хвосту лога */
  private queue: string[] | null = null

  constructor(
    private file: string | null,
    private readonly now: () => number = () => Date.now()
  ) {
    super()
  }

  /** Файл истории (до первой загрузки); без файла — только в памяти. */
  setFile(file: string): void {
    if (!this.loaded) this.file = file
  }

  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        const raw = this.file ? await readJson<unknown>(this.file, null) : null
        const data = normalizeFarmData(raw)
        this.savedAt = data.savedAt ?? null
        this.tracker = new FarmTracker(data)
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
        const p = parseFarmLine(line)
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

  async start(): Promise<FarmState> {
    await this.load()
    this.dispatch(this.tracker.startSession(this.now()))
    return this.state()
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
// Один сервис на процесс + API для S11a (main, в процессе)
// ---------------------------------------------------------------------------

/** Сервис процесса; файл задаёт домен ipc/farm.ts (userData/farm.json) до первой загрузки. */
const farm = new FarmSessionService(null)

export function getFarmService(): FarmSessionService {
  return farm
}

/**
 * События забегов и сессии (S11a: прибыль за карту по снапшотам стэша). На переходе карта A →
 * карта B — синхронно runEnd(A), затем runStart(B). Подписываться можно в любой момент (и до
 * подъёма домена). Возвращает отписку.
 */
export function onFarmEvent(cb: (e: FarmEvent) => void): () => void {
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

/** Состояние трекера: текущий забег, сессия, статистика, история (последние `runsLimit`). */
export function getFarmState(runsLimit?: number): FarmState {
  return farm.state(runsLimit)
}

/** Прибыль забега от S11a (в хаосах-эквиваленте); null — убрать. false — забега нет. */
export function setRunProfit(runId: string, profit: FarmProfit | null): Promise<boolean> {
  return farm.setRunProfit(runId, profit)
}
