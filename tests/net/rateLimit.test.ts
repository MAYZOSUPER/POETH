import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RESERVE,
  DEFAULT_RULES,
  PolicyLimiter,
  RateLimitRegistry,
  capacityFor,
  headerGetter,
  parseRateRules,
  parseRateState,
  parseRetryAfterMs
} from '../../src/main/net/rateLimit'

const S = 1000

function limiter(rules: string, now = 0): PolicyLimiter {
  return new PolicyLimiter('search', parseRateRules(rules), now)
}

describe('разбор заголовков', () => {
  it('x-rate-limit-<rule>: hits:period:restriction', () => {
    expect(parseRateRules('5:10:60,15:60:300')).toEqual([
      { hits: 5, periodSec: 10, restrictSec: 60 },
      { hits: 15, periodSec: 60, restrictSec: 300 }
    ])
    expect(parseRateRules(' 12:4:10 , 1000:21600:1800 ')).toHaveLength(2)
  })

  it('мусор пропускается', () => {
    expect(parseRateRules('a:b:c,5:10,0:10:60,5:10:60')).toEqual([{ hits: 5, periodSec: 10, restrictSec: 60 }])
    expect(parseRateRules(undefined)).toEqual([])
    expect(parseRateRules('')).toEqual([])
  })

  it('x-rate-limit-<rule>-state: hits:period:restricted', () => {
    expect(parseRateState('1:10:0,3:60:0,30:300:1752')).toEqual([
      { hits: 1, periodSec: 10, restrictedSec: 0 },
      { hits: 3, periodSec: 60, restrictedSec: 0 },
      { hits: 30, periodSec: 300, restrictedSec: 1752 }
    ])
  })

  it('retry-after: секунды, мусор → 0, огромное — обрезается до 6 ч', () => {
    expect(parseRetryAfterMs('60')).toBe(60_000)
    expect(parseRetryAfterMs('-5')).toBe(0)
    expect(parseRetryAfterMs('abc')).toBe(0)
    expect(parseRetryAfterMs(undefined)).toBe(0)
    expect(parseRetryAfterMs('99999999')).toBe(6 * 3600 * 1000)
  })

  it('стартовые лимиты — проверенные анонимные значения', () => {
    expect(DEFAULT_RULES.search).toBe('5:10:60,15:60:300,30:300:1800,600:21600:3600')
    expect(DEFAULT_RULES.fetch).toBe('12:4:10,16:12:300,50:300:300,1000:21600:1800')
    expect(DEFAULT_RULES.exchange).toBe('5:15:60,10:90:300,30:300:1800')
  })
})

describe('математика окон', () => {
  it('5 запросов за 10 с проходят, шестой ждёт освобождения самого старого', () => {
    const l = limiter('5:10:60')
    for (let i = 0; i < 5; i++) {
      expect(l.waitMs('interactive', i * S)).toBe(0)
      l.record(i * S)
    }
    // в 4.5 с окно полное; освободится отметка 0 → в 10 с
    expect(l.waitMs('interactive', 4.5 * S)).toBe(5.5 * S)
    expect(l.waitMs('interactive', 10 * S)).toBe(0)
  })

  it('учитываются все окна: ограничивает самое строгое', () => {
    const l = limiter('5:10:60,6:60:300')
    for (let i = 0; i < 6; i++) l.record(i * 3 * S) // 0,3,6,9,12,15 с
    // окно 10 с: живы 9,12,15 (3/5) — свободно; окно 60 с: 6/6 — ждать до 0+60
    expect(l.waitMs('interactive', 16 * S)).toBe(44 * S)
  })

  it('ahead: запросы в очереди перед нами сдвигают ожидание', () => {
    const l = limiter('2:10:60')
    l.record(0)
    expect(l.waitMs('interactive', 1 * S, 0)).toBe(0)
    // перед нами ещё один — он займёт последнее место, нам ждать истечения отметки 0
    expect(l.waitMs('interactive', 1 * S, 1)).toBe(9 * S)
  })

  it('отметка переезжает на время ответа (окно освобождается не раньше сервера)', () => {
    const l = limiter('1:10:60')
    const ticket = l.record(0)
    l.complete(ticket, 2 * S)
    expect(l.waitMs('interactive', 10 * S)).toBe(2 * S)
    expect(l.waitMs('interactive', 12 * S)).toBe(0)
  })
})

describe('резерв для фоновых запросов', () => {
  it('фоновым — только пока в окне остаётся ≥ 25 %', () => {
    expect(BACKGROUND_RESERVE).toBe(0.25)
    expect(capacityFor(12, 'background')).toBe(9)
    expect(capacityFor(5, 'background')).toBe(3)
    expect(capacityFor(12, 'interactive')).toBe(12)

    const l = limiter('12:4:10')
    for (let i = 0; i < 9; i++) {
      expect(l.waitMs('background', 0)).toBe(0)
      l.record(0)
    }
    // 9/12 использовано: фоновый запрос оставил бы < 25 % — ждёт; интерактивный проходит
    expect(l.waitMs('background', 100)).toBe(3900)
    expect(l.waitMs('interactive', 100)).toBe(0)
  })

  it('окно на 1 запрос фоновым недоступно вовсе', () => {
    expect(limiter('1:60:60').waitMs('background', 0)).toBe(Infinity)
  })
})

describe('ресинк по заголовкам', () => {
  const H = (h: Record<string, string>) => headerGetter(h)

  it('state сервера больше нашего счёта — догоняем', () => {
    const l = limiter(DEFAULT_RULES.search)
    l.applyHeaders(
      H({
        'X-Rate-Limit-Policy': 'trade-search-request-limit',
        'X-Rate-Limit-Rules': 'Ip',
        'X-Rate-Limit-Ip': '5:10:60,15:60:300,30:300:1800,600:21600:3600',
        'X-Rate-Limit-Ip-State': '5:10:0,7:60:0,7:300:0,7:21600:0'
      }),
      1 * S
    )
    expect(l.serverPolicy).toBe('trade-search-request-limit')
    expect(l.waitMs('interactive', 1 * S)).toBe(10 * S)
  })

  it('restricted в state и retry-after → blockedUntil', () => {
    const l = limiter('5:10:60')
    l.applyHeaders(H({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '5:10:60', 'x-rate-limit-ip-state': '6:10:60' }), 0)
    expect(l.waitMs('interactive', 0)).toBe(60 * S)
    const l2 = limiter('5:10:60')
    l2.applyHeaders(H({ 'retry-after': '30' }), 0)
    expect(l2.blockedUntil).toBe(30 * S)
    expect(l2.waitMs('interactive', 5 * S)).toBe(25 * S)
  })

  it('после входа появляется правило Account, после выхода — исчезает', () => {
    const l = limiter('5:10:60')
    l.record(0)
    l.applyHeaders(
      H({
        'x-rate-limit-rules': 'Account,Ip',
        'x-rate-limit-account': '3:5:60',
        'x-rate-limit-account-state': '3:5:0',
        'x-rate-limit-ip': '5:10:60',
        'x-rate-limit-ip-state': '1:10:0'
      }),
      100
    )
    expect(l.ruleNames().sort()).toEqual(['account', 'ip'])
    // Account 3/3 за 5 с (хиты с других устройств) — ждём его окна, хотя Ip свободен
    expect(l.waitMs('interactive', 200)).toBe(4800)
    l.applyHeaders(H({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '5:10:60', 'x-rate-limit-ip-state': '1:10:0' }), 300)
    expect(l.ruleNames()).toEqual(['ip'])
    expect(l.waitMs('interactive', 300)).toBe(0)
  })

  it('сервер сменил окна — новые окна заполняются из журнала', () => {
    const l = limiter('5:10:60')
    l.record(0)
    l.record(S)
    l.applyHeaders(
      H({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '5:10:60,2:30:120', 'x-rate-limit-ip-state': '2:10:0,2:30:0' }),
      2 * S
    )
    expect(l.waitMs('interactive', 2 * S)).toBe(28 * S)
  })

  it('две наши политики с одним серверным именем сливаются (live-fetch = fetch)', () => {
    const reg = new RateLimitRegistry({}, 0)
    const h = H({
      'x-rate-limit-policy': 'trade-fetch-request-limit',
      'x-rate-limit-rules': 'Ip',
      'x-rate-limit-ip': '12:4:10',
      'x-rate-limit-ip-state': '1:4:0'
    })
    reg.get('fetch').record(0)
    reg.applyHeaders('fetch', h, 10)
    expect(reg.get('live-fetch')).not.toBe(reg.get('fetch'))
    reg.get('live-fetch').record(20)
    const merged = reg.applyHeaders('live-fetch', h, 30)
    expect(reg.get('live-fetch')).toBe(reg.get('fetch'))
    expect(merged).toBe(reg.get('fetch'))
    const snap = reg.snapshot(40).find((p) => p.kinds.includes('fetch'))
    expect(snap?.kinds.sort()).toEqual(['fetch', 'live-fetch'])
    expect(snap?.windows[0].used).toBe(2)
  })
})
