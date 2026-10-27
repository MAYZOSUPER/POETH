import { describe, expect, it } from 'vitest'
import {
  BLOCKED_MIN_MS,
  RATE_LIMIT_MAX_MS,
  RATE_LIMIT_MIN_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  isActive,
  rateLimitDelay,
  reconnectDelay,
  reduce,
  wakeAt,
  wantsConnect,
  type ConnEvent,
  type ConnState
} from '../../src/main/games/poe1/live/machine'

const zero = () => 0
const run = (s: ConnState, ...events: ConnEvent[]): ConnState =>
  events.reduce((acc, e) => reduce(acc, e, zero).state, s)

const idle: ConnState = { kind: 'idle' }
const connecting = (attempt = 0): ConnState => ({ kind: 'connecting', attempt, started: true })

describe('редьюсер live-поиска: основные переходы', () => {
  it('enable → ждёт очереди → рукопожатие → open', () => {
    let s = run(idle, { type: 'enable', loggedIn: true })
    expect(s).toEqual({ kind: 'connecting', attempt: 0, started: false })
    expect(wantsConnect(s)).toBe(true)
    s = run(s, { type: 'start' })
    expect(wantsConnect(s)).toBe(false)
    s = run(s, { type: 'open', now: 1000 })
    expect(s).toEqual({ kind: 'open', since: 1000 })
  })

  it('без входа enable сразу даёт «нужен вход», без рукопожатия', () => {
    expect(run(idle, { type: 'enable', loggedIn: false })).toEqual({ kind: 'auth' })
  })

  it('401 → auth; вход → снова в очередь подключения', () => {
    const s = run(connecting(), { type: 'rejected', status: 401, now: 0 })
    expect(s).toEqual({ kind: 'auth' })
    expect(run(s, { type: 'login' })).toEqual({ kind: 'connecting', attempt: 0, started: false })
  })

  it('403 без Cloudflare — тоже «нужен вход»', () => {
    expect(run(connecting(), { type: 'rejected', status: 403, now: 0 })).toEqual({ kind: 'auth' })
  })

  it('404 → invalid; повторное включение пробует снова', () => {
    const s = run(connecting(), { type: 'rejected', status: 404, now: 0 })
    expect(s).toEqual({ kind: 'invalid' })
    expect(isActive(s)).toBe(false)
    expect(run(s, { type: 'enable', loggedIn: true }).kind).toBe('connecting')
  })

  it('disable из любого состояния → idle и закрыть соединение', () => {
    const t = reduce({ kind: 'open', since: 0 }, { type: 'disable' })
    expect(t).toEqual({ state: { kind: 'idle' }, disconnect: true })
    expect(reduce(idle, { type: 'disable' }).disconnect).toBe(false)
  })

  it('выход из аккаунта рвёт активные соединения → auth', () => {
    for (const s of [{ kind: 'open', since: 0 }, connecting(), { kind: 'backoff', until: 9, attempt: 1, reason: 'network' }] as ConnState[]) {
      expect(reduce(s, { type: 'logout' })).toEqual({ state: { kind: 'auth' }, disconnect: true })
    }
    expect(reduce(idle, { type: 'logout' }).state).toEqual(idle)
  })

  it('события не по адресу состояние не трогают', () => {
    const open: ConnState = { kind: 'open', since: 5 }
    expect(run(open, { type: 'rejected', status: 404, now: 9 })).toEqual(open)
    expect(run(open, { type: 'open', now: 9 })).toEqual(open)
    expect(run(idle, { type: 'tick', now: 1e9 })).toEqual(idle)
  })
})

describe('бэкоффы', () => {
  it('обрыв открытого соединения → переподключение через 3 с + jitter', () => {
    const t = reduce({ kind: 'open', since: 0 }, { type: 'closed', now: 10_000 }, () => 0.5)
    expect(t.state).toEqual({ kind: 'backoff', until: 10_000 + RECONNECT_BASE_MS + 1000, attempt: 0, reason: 'closed' })
    expect(wakeAt(t.state)).toBe(14_000)
    // до срока — ждём, после — снова в очередь
    expect(run(t.state, { type: 'tick', now: 13_999 }).kind).toBe('backoff')
    expect(run(t.state, { type: 'tick', now: 14_000 })).toEqual({ kind: 'connecting', attempt: 0, started: false })
  })

  it('неудачи подряд: первые три — 3 с, дальше пауза растёт до 60 с', () => {
    expect(reconnectDelay(0, zero)).toBe(3000)
    expect(reconnectDelay(3, zero)).toBe(3000)
    expect(reconnectDelay(4, zero)).toBe(6000)
    expect(reconnectDelay(6, zero)).toBe(24_000)
    expect(reconnectDelay(20, () => 0.99)).toBe(RECONNECT_MAX_MS)
    let s: ConnState = connecting()
    for (let i = 0; i < 5; i++) {
      s = run(s, { type: 'error', now: 0 })
      expect(s.kind).toBe('backoff')
      s = run(s, { type: 'tick', now: 1e12 }, { type: 'start' })
    }
    expect(s).toMatchObject({ kind: 'connecting', attempt: 5 })
  })

  it('ошибка до старта рукопожатия не считается', () => {
    const queued: ConnState = { kind: 'connecting', attempt: 0, started: false }
    expect(run(queued, { type: 'error', now: 0 })).toEqual(queued)
  })

  it('429 → пауза от 30 с, растёт вдвое, не больше 10 мин, не меньше retry-after', () => {
    expect(rateLimitDelay(0)).toBe(RATE_LIMIT_MIN_MS)
    expect(rateLimitDelay(1)).toBe(60_000)
    expect(rateLimitDelay(0, 90_000)).toBe(90_000)
    expect(rateLimitDelay(10)).toBe(RATE_LIMIT_MAX_MS)
    expect(rateLimitDelay(0, 3_600_000)).toBe(RATE_LIMIT_MAX_MS)

    let s = run(connecting(), { type: 'rejected', status: 429, now: 0 })
    expect(s).toEqual({ kind: 'ratelimited', until: 30_000, attempt: 1 })
    s = run(s, { type: 'tick', now: 30_000 }, { type: 'start' }, { type: 'rejected', status: 429, now: 30_000 })
    expect(s).toEqual({ kind: 'ratelimited', until: 90_000, attempt: 2 })
    // удачное подключение сбрасывает счётчик
    s = run(s, { type: 'tick', now: 90_000 }, { type: 'start' }, { type: 'open', now: 91_000 })
    expect(s.kind).toBe('open')
  })

  it('Cloudflare не пустил (403 + challenge) — ждём не меньше минуты', () => {
    const s = run(connecting(), { type: 'rejected', status: 403, blocked: true, now: 0 })
    expect(s).toMatchObject({ kind: 'backoff', reason: 'blocked', until: BLOCKED_MIN_MS })
  })

  it('5xx — переподключение с причиной server', () => {
    expect(run(connecting(), { type: 'rejected', status: 502, now: 0 })).toMatchObject({ kind: 'backoff', reason: 'server' })
  })
})
