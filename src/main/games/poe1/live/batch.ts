// Находки live: батч 300 мс + дедуп по id предмета, антиспам тостов. Чистый модуль
// (таймеры можно подменить; тесты — tests/live/batch.test.ts).

export const BATCH_DELAY_MS = 300
/** fetch принимает до 10 id за запрос */
export const FETCH_CHUNK = 10
/** сколько id помнить на поиск для дедупа */
export const SEEN_MAX = 1000
/** тостов в минуту на поиск (остальные находки — только в списке и счётчике) */
export const TOASTS_PER_MINUTE = 6

const ITEM_ID = /^[A-Za-z0-9_-]{8,128}$/

type Timer = ReturnType<typeof setTimeout>

export interface BatcherOptions {
  onFlush: (searchId: string, ids: string[]) => void
  delayMs?: number
  chunk?: number
  seenMax?: number
  setTimer?: (fn: () => void, ms: number) => Timer
  clearTimer?: (t: Timer) => void
}

interface SearchBatch {
  seen: Set<string>
  /** порядок для вытеснения старых id */
  order: string[]
  pending: string[]
  timer: Timer | null
}

/** Копит id из {"new":[…]} и отдаёт пачками по 10 через 300 мс после первого. */
export class HitBatcher {
  private batches = new Map<string, SearchBatch>()
  private readonly delay: number
  private readonly chunk: number
  private readonly seenMax: number
  private readonly setTimer: (fn: () => void, ms: number) => Timer
  private readonly clearTimer: (t: Timer) => void

  constructor(private readonly opts: BatcherOptions) {
    this.delay = opts.delayMs ?? BATCH_DELAY_MS
    this.chunk = opts.chunk ?? FETCH_CHUNK
    this.seenMax = opts.seenMax ?? SEEN_MAX
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t))
  }

  private batch(searchId: string): SearchBatch {
    let b = this.batches.get(searchId)
    if (!b) {
      b = { seen: new Set(), order: [], pending: [], timer: null }
      this.batches.set(searchId, b)
    }
    return b
  }

  /** Принять id (мусор и повторы отбрасываются). Возвращает, сколько новых принято. */
  push(searchId: string, ids: unknown): number {
    if (!Array.isArray(ids)) return 0
    const b = this.batch(searchId)
    let added = 0
    for (const id of ids) {
      if (typeof id !== 'string' || !ITEM_ID.test(id) || b.seen.has(id)) continue
      b.seen.add(id)
      b.order.push(id)
      b.pending.push(id)
      added++
    }
    while (b.order.length > this.seenMax) b.seen.delete(b.order.shift() as string)
    if (added && !b.timer) b.timer = this.setTimer(() => this.flush(searchId), this.delay)
    return added
  }

  /** Отдать накопленное сейчас. */
  flush(searchId: string): void {
    const b = this.batches.get(searchId)
    if (!b) return
    if (b.timer) this.clearTimer(b.timer)
    b.timer = null
    const ids = b.pending
    b.pending = []
    for (let i = 0; i < ids.length; i += this.chunk) this.opts.onFlush(searchId, ids.slice(i, i + this.chunk))
  }

  /** Забыть поиск (удалён). Ожидающие id выбрасываются. */
  drop(searchId: string): void {
    const b = this.batches.get(searchId)
    if (b?.timer) this.clearTimer(b.timer)
    this.batches.delete(searchId)
  }
}

/** Не больше `limit` тостов в минуту на поиск (скользящее окно). */
export class ToastThrottle {
  private log = new Map<string, number[]>()
  constructor(private readonly limit = TOASTS_PER_MINUTE, private readonly windowMs = 60_000) {}

  allow(searchId: string, now: number): boolean {
    const list = (this.log.get(searchId) ?? []).filter((t) => t > now - this.windowMs)
    const ok = list.length < this.limit
    if (ok) list.push(now)
    this.log.set(searchId, list)
    return ok
  }

  drop(searchId: string): void {
    this.log.delete(searchId)
  }
}
