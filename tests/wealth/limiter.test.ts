import { describe, expect, it } from 'vitest'
import { LegacyStashProvider, stashQueryString, toWealthError } from '../../src/main/games/poe1/wealth/stashProvider'
import type { TransportRequest, TransportResponse } from '../../src/main/net/tradeGateway'
import { RateLimitRegistry } from '../../src/main/net/rateLimit'

const ACCOUNT = 'Exile_Example#1234' // вымышленное имя
const STASH_HEADERS = {
  'content-type': 'application/json',
  'x-rate-limit-policy': 'backend-item-request-limit',
  'x-rate-limit-rules': 'Ip',
  'x-rate-limit-ip': '30:60:120,90:1800:600,180:7200:3600'
}

function setup(opts: { loggedIn?: boolean; respond?: (r: TransportRequest, n: number) => TransportResponse } = {}) {
  let now = 1_800_000_000_000
  const calls: TransportRequest[] = []
  const logs: string[] = []
  const provider = new LegacyStashProvider({
    transport: async (r) => {
      calls.push(r)
      return (
        opts.respond?.(r, calls.length) ?? {
          status: 200,
          headers: { ...STASH_HEADERS, 'x-rate-limit-ip-state': `${calls.length}:60:0,${calls.length}:1800:0,${calls.length}:7200:0` },
          body: JSON.stringify({ numTabs: 1, tabs: [{ n: 'A', i: 0, id: 'abc', type: 'PremiumStash' }], items: [] })
        }
      )
    },
    loggedIn: () => opts.loggedIn ?? true,
    statusAccountName: () => undefined,
    now: () => now,
    log: (m) => logs.push(m),
    limits: new RateLimitRegistry({}, now)
  })
  return { provider, calls, logs, tick: (ms: number) => (now += ms), now: () => now }
}

describe('лимитер стэша', () => {
  it('запрос: www, character-window, имя аккаунта в query; в лог имя не попадает', async () => {
    const { provider, calls, logs } = setup({
      respond: () => ({ status: 403, headers: STASH_HEADERS, body: '{"error":{"code":6,"message":"Forbidden"}}' })
    })
    const r = await provider.fetchTabs({ account: ACCOUNT, league: 'Allflame', index: 3 })
    expect(r).toEqual({ ok: false, error: { code: 'forbidden' } })
    const u = new URL(calls[0].url)
    expect(u.host).toBe('www.pathofexile.com')
    expect(u.pathname).toBe('/character-window/get-stash-items')
    expect(Object.fromEntries(u.searchParams)).toEqual({ accountName: ACCOUNT, realm: 'pc', league: 'Allflame', tabs: '1', tabIndex: '3' })
    expect(logs.join('\n')).not.toContain('Exile_Example')
  })

  it('окна лимита берутся из заголовков политики backend-item-request-limit', async () => {
    const { provider } = setup()
    expect(provider.windows()).toEqual([
      { hits: 30, periodSec: 60 },
      { hits: 90, periodSec: 1800 },
      { hits: 180, periodSec: 7200 }
    ])
    await provider.fetchTab({ account: ACCOUNT, league: 'Standard', index: 0 })
    // после входа сайт может прислать другие правила — лимитер перенимает
    const { provider: p2 } = setup({
      respond: () => ({
        status: 200,
        headers: {
          ...STASH_HEADERS,
          'x-rate-limit-rules': 'Account,Ip',
          'x-rate-limit-account': '20:60:60,60:1800:600'
        },
        body: '{"numTabs":1,"items":[]}'
      })
    })
    await p2.fetchTab({ account: ACCOUNT, league: 'Standard', index: 0 })
    expect(p2.windows()).toContainEqual({ hits: 20, periodSec: 60 })
  })

  it('фон с резервом 25 %: за минуту не больше 22 запросов из 30, дальше — ожидание', async () => {
    const { provider } = setup()
    for (let i = 0; i < 22; i++) {
      const r = await provider.fetchTab({ account: ACCOUNT, league: 'Standard', index: i })
      expect(r.ok).toBe(true)
    }
    expect(provider.waitMs()).toBeGreaterThan(0)
    expect(provider.waitMs()).toBeLessThanOrEqual(60_000)
  })

  it('свой лимитер: лимиты трейда (прайс-чек) не расходуются', async () => {
    const limits = new RateLimitRegistry({}, 0)
    const { provider } = setup()
    await provider.fetchTab({ account: ACCOUNT, league: 'Standard', index: 0 })
    expect(provider.gateway.limits).not.toBe(limits)
    const snap = provider.gateway.limits.snapshot(Date.now())
    const stash = snap.find((p) => p.kinds.includes('stash'))
    expect(stash?.serverPolicy).toBe('backend-item-request-limit')
    expect(snap.find((p) => p.kinds.includes('search'))?.serverPolicy).toBeNull()
  })

  it('ответы → ошибки домена: 401/403 без входа — «войдите», Cloudflare — проверка, 429 — пауза', async () => {
    const statuses: Array<[number, Record<string, string>, string, string]> = [
      [401, STASH_HEADERS, '{}', 'auth'],
      [403, STASH_HEADERS, '{}', 'auth'],
      [404, STASH_HEADERS, '{"error":{"code":1}}', 'not-found'],
      [503, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }, '<title>Just a moment...</title>', 'blocked'],
      [500, STASH_HEADERS, '{}', 'server']
    ]
    for (const [status, headers, body, code] of statuses) {
      const { provider } = setup({ loggedIn: false, respond: () => ({ status, headers, body }) })
      const r = await provider.fetchTab({ account: ACCOUNT, league: 'Standard', index: 0 })
      expect(r.ok ? 'ok' : r.error.code).toBe(code)
    }
    const err = toWealthError({ code: 'rate-limited', retryAfterMs: 30_000 }, true, 1000)
    expect(err).toEqual({ code: 'rate-limited', retryAt: 31_000 })
  })

  it('ответ без вкладок при tabs=1 — непонятный ответ', async () => {
    const { provider } = setup({ respond: () => ({ status: 200, headers: STASH_HEADERS, body: '{"numTabs":0,"items":[]}' }) })
    expect(await provider.fetchTabs({ account: ACCOUNT, league: 'Standard', index: 0 })).toEqual({ ok: false, error: { code: 'bad-response' } })
  })

  it('строка запроса кодирует имя и лигу', () => {
    expect(stashQueryString({ account: 'A b#1234', league: 'Hardcore Allflame', index: 2.7 }, false)).toBe(
      '?accountName=A+b%231234&realm=pc&league=Hardcore+Allflame&tabs=0&tabIndex=2'
    )
  })

  it('имя аккаунта: из статуса входа (Name-1234 → Name#1234), без входа — null без запросов', async () => {
    const calls: TransportRequest[] = []
    const p = new LegacyStashProvider({
      transport: async (r) => {
        calls.push(r)
        return { status: 404, headers: {}, body: '{}' }
      },
      loggedIn: () => true,
      statusAccountName: () => 'Exile_Example-1234'
    })
    expect(await p.sessionAccountName()).toBe('Exile_Example#1234')
    expect(calls).toHaveLength(0)
    const anon = new LegacyStashProvider({
      transport: async (r) => {
        calls.push(r)
        return { status: 200, headers: {}, body: '{"accountName":"X#1111"}' }
      },
      loggedIn: () => false,
      statusAccountName: () => undefined
    })
    expect(await anon.sessionAccountName()).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
