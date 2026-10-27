import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES, apiUrl } from '@shared/games'
import {
  CACHE_TTL_MS,
  TradeGateway,
  classifyResponse,
  type Transport,
  type TransportRequest,
  type TransportResponse
} from '../../src/main/net/tradeGateway'

// Шлюз с подменённым транспортом и фейковыми часами: fail-fast, приоритеты,
// резерв для фона, один повтор после 429, кэш, детект Cloudflare.

function ok(body: unknown, headers: Record<string, string> = {}): TransportResponse {
  return { status: 200, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }
}

function setup(respond?: (r: TransportRequest, n: number) => TransportResponse | Promise<TransportResponse>) {
  const calls: TransportRequest[] = []
  const transport: Transport = async (r) => {
    calls.push(r)
    return respond ? respond(r, calls.length) : ok({ result: [], n: calls.length })
  }
  const gw = new TradeGateway({
    transport,
    resolveUrl: (req) => apiUrl(GAMES[req.game ?? 'poe1'], req.host ?? 'www.pathofexile.com', req.endpoint, req.rest),
    now: () => Date.now()
  })
  return { gw, calls }
}

const search = (i: number, priority: 'interactive' | 'background' = 'interactive') => ({
  kind: 'search' as const,
  priority,
  req: { method: 'POST' as const, endpoint: 'search', rest: 'Standard', body: { i } }
})
const fetchReq = (i: number, priority: 'interactive' | 'background') => ({
  kind: 'fetch' as const,
  priority,
  req: { method: 'GET' as const, endpoint: 'fetch', rest: `id${i}?query=q` }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('шлюз: запрос и URL', () => {
  it('URL строится через games.ts, тело — JSON', async () => {
    const { gw, calls } = setup()
    const res = await gw.request(search(1))
    expect(res.ok).toBe(true)
    expect(calls[0]).toEqual({
      url: 'https://www.pathofexile.com/api/trade/search/Standard',
      method: 'POST',
      body: '{"i":1}'
    })
  })

  it('URL не собрался — bad-request без сети', async () => {
    const calls: TransportRequest[] = []
    const gw = new TradeGateway({
      transport: async (r) => (calls.push(r), ok({})),
      resolveUrl: () => {
        throw new Error('nope')
      }
    })
    const res = await gw.request(search(1))
    expect(res).toEqual({ ok: false, error: { code: 'bad-request' } })
    expect(calls).toHaveLength(0)
  })
})

describe('fail-fast для интерактивных', () => {
  it('ждать > 1.5 с — сразу rate-limited с временем повтора, без запроса в сеть', async () => {
    const { gw, calls } = setup()
    for (let i = 0; i < 5; i++) expect((await gw.request(search(i))).ok).toBe(true)
    const t0 = performance.now()
    const res = await gw.request(search(99))
    expect(performance.now() - t0).toBeLessThan(50)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('rate-limited')
      expect(res.error.retryAfterMs).toBe(10_000)
    }
    expect(calls).toHaveLength(5)
  })

  it('ждать ≤ 1.5 с — запрос встаёт в очередь и уходит, когда окно освободится', async () => {
    const { gw, calls } = setup()
    for (let i = 0; i < 5; i++) await gw.request(search(i))
    vi.advanceTimersByTime(8_700) // до освобождения окна 10 с осталось 1.3 с
    const p = gw.request(search(5))
    await vi.advanceTimersByTimeAsync(1_200)
    expect(calls).toHaveLength(5)
    await vi.advanceTimersByTimeAsync(200)
    expect((await p).ok).toBe(true)
    expect(calls).toHaveLength(6)
  })
})

describe('приоритеты и резерв для фона', () => {
  it('фоновые занимают не больше 75 % окна; интерактивный проходит вперёд', async () => {
    const { gw, calls } = setup()
    const bg: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) bg.push(gw.request(fetchReq(i, 'background')))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(9) // 12 × 0.75
    const inter = await gw.request(fetchReq(100, 'interactive'))
    expect(inter.ok).toBe(true)
    expect(calls).toHaveLength(10)
    expect(calls[9].url).toContain('id100')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(calls).toHaveLength(11)
    expect(calls[10].url).toContain('id9')
    await Promise.all(bg)
  })

  it('оценка ожидания для планировщика', async () => {
    const { gw } = setup()
    for (let i = 0; i < 9; i++) await gw.request(fetchReq(i, 'background'))
    expect(gw.estimateWaitMs('fetch', 'interactive')).toBe(0)
    expect(gw.estimateWaitMs('fetch', 'background')).toBe(4_000)
  })
})

describe('429', () => {
  const tooMany = (ra: string): TransportResponse => ({
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': ra },
    body: '{"error":{"code":3,"message":"Rate limit exceeded"}}'
  })

  it('фоновый: не больше одного повтора', async () => {
    const { gw, calls } = setup(() => tooMany('2'))
    const p = gw.request(fetchReq(1, 'background'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(calls).toHaveLength(2)
    const res = await p
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('rate-limited')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toHaveLength(2)
  })

  it('повтор успешен', async () => {
    const { gw, calls } = setup((_r, n) => (n === 1 ? tooMany('1') : ok({ result: ['a'] })))
    const p = gw.request(fetchReq(1, 'background'))
    await vi.advanceTimersByTimeAsync(1_000)
    const res = await p
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('интерактивный: retry-after 60 с — сразу ошибка, следующий — fail-fast без сети', async () => {
    const { gw, calls } = setup(() => tooMany('60'))
    const res = await gw.request(search(1))
    expect(res).toEqual({ ok: false, error: { code: 'rate-limited', retryAfterMs: 60_000 } })
    const next = await gw.request(search(2))
    expect(next.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe('кэш 5 минут', () => {
  it('повторный одинаковый запрос — из кэша; другое тело — в сеть; через 5 мин — снова в сеть', async () => {
    const { gw, calls } = setup()
    const a = await gw.request(search(1))
    const b = await gw.request(search(1))
    expect(b).toMatchObject({ ok: true, cached: true })
    if (a.ok && b.ok) expect(b.data).toEqual(a.data)
    expect(calls).toHaveLength(1)
    await gw.request(search(2))
    expect(calls).toHaveLength(2)
    vi.advanceTimersByTime(CACHE_TTL_MS + 1)
    await gw.request(search(1))
    expect(calls).toHaveLength(3)
  })

  it('одновременные одинаковые запросы склеиваются', async () => {
    const { gw, calls } = setup()
    const [a, b] = await Promise.all([gw.request(search(7)), gw.request(search(7))])
    expect(a.ok && b.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('ошибки не кэшируются, cache:false — всегда в сеть', async () => {
    const { gw, calls } = setup((_r, n) => (n === 1 ? { status: 500, headers: {}, body: '' } : ok({})))
    expect((await gw.request(search(1))).ok).toBe(false)
    expect((await gw.request(search(1))).ok).toBe(true)
    await gw.request({ ...search(1), cache: false })
    expect(calls).toHaveLength(3)
  })
})

describe('ошибки', () => {
  it('Cloudflare вместо JSON — blocked', async () => {
    const { gw } = setup(() => ({
      status: 403,
      headers: { 'content-type': 'text/html; charset=UTF-8' },
      body: '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>'
    }))
    expect(await gw.request(search(1))).toEqual({ ok: false, error: { code: 'blocked', status: 403 } })
  })

  it('сеть упала — network', async () => {
    const calls: TransportRequest[] = []
    const gw = new TradeGateway({
      transport: async (r) => {
        calls.push(r)
        throw new Error('ECONNRESET')
      },
      resolveUrl: (req) => apiUrl(GAMES.poe1, 'www.pathofexile.com', req.endpoint, req.rest),
      now: () => Date.now()
    })
    expect(await gw.request(search(1))).toEqual({ ok: false, error: { code: 'network' } })
  })

  it('коды HTTP → коды шлюза, сообщение API сохраняется', () => {
    const r = (status: number, body = '{"error":{"code":2,"message":"Invalid query"}}') =>
      classifyResponse({ status, headers: { 'content-type': 'application/json' }, body })
    expect(r(400)).toEqual({ ok: false, error: { code: 'bad-request', status: 400, message: 'Invalid query' } })
    expect(r(401, '{}')).toEqual({ ok: false, error: { code: 'unauthorized', status: 401 } })
    expect(r(403, '{}')).toMatchObject({ error: { code: 'forbidden' } })
    expect(r(404, '{}')).toMatchObject({ error: { code: 'not-found' } })
    expect(r(503, '{}')).toMatchObject({ error: { code: 'server' } })
    expect(r(200, 'not json')).toMatchObject({ error: { code: 'bad-response' } })
  })
})
