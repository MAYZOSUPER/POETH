// Состояние подключения одного live-поиска — чистый редьюсер (без electron/ws; тесты —
// tests/live/machine.test.ts). Менеджер (liveSearch.ts) кормит его событиями транспорта,
// таймеров и входа, а сам решает, когда открыть соединение (не чаще раза в 2.5 с).
//
//   idle ──enable──▶ connecting ──open──▶ open ──closed──▶ backoff ──tick──▶ connecting
//                     │  401/403 ──▶ auth ──login──▶ connecting
//                     │  404     ──▶ invalid (enable — попробовать снова)
//                     │  429     ──▶ ratelimited (30 с … 10 мин) ──tick──▶ connecting
//                     └  ошибка  ──▶ backoff (3 с + jitter, после 3 неудач подряд растёт до 60 с)

import type { LiveBackoffReason, LiveConnKind } from '@shared/types'

/** Подключения разных поисков — не чаще раза в 2.5 с. */
export const CONNECT_SPACING_MS = 2500
export const RECONNECT_BASE_MS = 3000
export const RECONNECT_JITTER_MS = 2000
export const RECONNECT_MAX_MS = 60_000
/** Неудач подряд, после которых пауза переподключения начинает расти. */
export const RECONNECT_FREE_ATTEMPTS = 3
export const RATE_LIMIT_MIN_MS = 30_000
export const RATE_LIMIT_MAX_MS = 10 * 60_000
/** Cloudflare не пустил рукопожатие — не долбим, ждём не меньше минуты. */
export const BLOCKED_MIN_MS = 60_000

export type ConnState =
  | { kind: 'idle' }
  /** started=false — ждёт очереди; true — рукопожатие идёт */
  | { kind: 'connecting'; attempt: number; started: boolean }
  | { kind: 'open'; since: number }
  | { kind: 'backoff'; until: number; attempt: number; reason: LiveBackoffReason }
  | { kind: 'auth' }
  | { kind: 'invalid' }
  | { kind: 'ratelimited'; until: number; attempt: number }

export type ConnEvent =
  /** включить; loggedIn=false — сразу «нужен вход», без лишнего рукопожатия */
  | { type: 'enable'; loggedIn: boolean }
  | { type: 'disable' }
  /** менеджер начал рукопожатие */
  | { type: 'start' }
  | { type: 'open'; now: number }
  /** рукопожатие отклонено HTTP-ответом */
  | { type: 'rejected'; status: number; retryAfterMs?: number; blocked?: boolean; now: number }
  /** соединение закрылось (после open) или оборвалось при подключении */
  | { type: 'closed'; now: number }
  | { type: 'error'; now: number }
  /** таймер: пора ли выйти из backoff/ratelimited */
  | { type: 'tick'; now: number }
  | { type: 'login' }
  | { type: 'logout' }

export interface Transition {
  state: ConnState
  /** закрыть текущее соединение */
  disconnect?: boolean
}

export type Rand = () => number

/** Пауза перед переподключением: 3 с + jitter; после 3 неудач подряд — вдвое за каждую, до 60 с. */
export function reconnectDelay(attempt: number, rand: Rand = Math.random): number {
  const grow = Math.max(0, attempt - RECONNECT_FREE_ATTEMPTS)
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** grow)
  return Math.min(RECONNECT_MAX_MS, base + Math.floor(rand() * RECONNECT_JITTER_MS))
}

/** Пауза после 429: 30 с × 2^attempt (не меньше retry-after), не больше 10 мин. */
export function rateLimitDelay(attempt: number, retryAfterMs = 0): number {
  const backoff = RATE_LIMIT_MIN_MS * 2 ** Math.max(0, attempt)
  return Math.min(RATE_LIMIT_MAX_MS, Math.max(backoff, retryAfterMs))
}

const ACTIVE: ReadonlySet<ConnState['kind']> = new Set(['connecting', 'open', 'backoff', 'ratelimited'])

export function reduce(s: ConnState, e: ConnEvent, rand: Rand = Math.random): Transition {
  switch (e.type) {
    case 'enable':
      if (s.kind === 'idle' || s.kind === 'invalid') {
        return { state: e.loggedIn ? { kind: 'connecting', attempt: 0, started: false } : { kind: 'auth' } }
      }
      return { state: s }

    case 'disable':
      return { state: { kind: 'idle' }, disconnect: s.kind !== 'idle' }

    case 'start':
      return s.kind === 'connecting' ? { state: { ...s, started: true } } : { state: s }

    case 'open':
      return s.kind === 'connecting' ? { state: { kind: 'open', since: e.now } } : { state: s }

    case 'rejected': {
      if (s.kind !== 'connecting') return { state: s }
      const attempt = s.attempt
      if (e.status === 401) return { state: { kind: 'auth' } }
      if (e.status === 404) return { state: { kind: 'invalid' } }
      if (e.status === 429) {
        return { state: { kind: 'ratelimited', until: e.now + rateLimitDelay(attempt, e.retryAfterMs), attempt: attempt + 1 } }
      }
      if (e.status === 403 && e.blocked) {
        const wait = Math.max(BLOCKED_MIN_MS, reconnectDelay(attempt, rand))
        return { state: { kind: 'backoff', until: e.now + wait, attempt: attempt + 1, reason: 'blocked' } }
      }
      if (e.status === 403) return { state: { kind: 'auth' } }
      const reason: LiveBackoffReason = e.status >= 500 ? 'server' : 'network'
      return { state: { kind: 'backoff', until: e.now + reconnectDelay(attempt, rand), attempt: attempt + 1, reason } }
    }

    case 'closed':
    case 'error': {
      if (s.kind === 'open') {
        // работало и оборвалось — это не «неудача подряд»
        return { state: { kind: 'backoff', until: e.now + reconnectDelay(0, rand), attempt: 0, reason: 'closed' } }
      }
      if (s.kind === 'connecting' && s.started) {
        const attempt = s.attempt
        return {
          state: { kind: 'backoff', until: e.now + reconnectDelay(attempt, rand), attempt: attempt + 1, reason: 'network' }
        }
      }
      return { state: s }
    }

    case 'tick':
      if ((s.kind === 'backoff' || s.kind === 'ratelimited') && e.now >= s.until) {
        return { state: { kind: 'connecting', attempt: s.attempt, started: false } }
      }
      return { state: s }

    case 'login':
      return s.kind === 'auth' ? { state: { kind: 'connecting', attempt: 0, started: false } } : { state: s }

    case 'logout':
      return ACTIVE.has(s.kind) ? { state: { kind: 'auth' }, disconnect: true } : { state: s }
  }
}

/** Ждёт ли поиск своей очереди на подключение. */
export function wantsConnect(s: ConnState): boolean {
  return s.kind === 'connecting' && !s.started
}

/** Когда разбудить поиск (выход из паузы), или null. */
export function wakeAt(s: ConnState): number | null {
  return s.kind === 'backoff' || s.kind === 'ratelimited' ? s.until : null
}

/** Поиск занимает место в лимите (включён и не «битый»). */
export function isActive(s: ConnState): boolean {
  return s.kind !== 'idle' && s.kind !== 'invalid'
}

export function publicKind(s: ConnState): LiveConnKind {
  return s.kind
}
