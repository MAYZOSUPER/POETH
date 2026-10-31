import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { FullHour } from '@shared/flip/feed'
import {
  angeConfidence,
  angePrice,
  angePriceByName,
  CHAOS_ID,
  DIVINE_ID,
  EXALTED_ID,
  feedFresh,
  feedIdsByName,
  LOW_VOLUME,
  poe2Rate
} from '@shared/poe2/pricecheck/ange'

// S61: курс ex ↔ div и «цена у Ange» — на настоящих часах фида GGG realm poe2 (31.10.2026, только нужные рынки;
// tests/fixtures/poe2/exchange/hours.json) и настоящем сопоставлении id → имя (resources/data/poe2/exchange).

const { hours } = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/poe2/exchange/hours.json'), 'utf8')) as { hours: FullHour[] }
const ids = JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe2/exchange/exchange-ids.json'), 'utf8')) as {
  version: number
  names: Record<string, string>
  ru: Record<string, string>
}
const byName = feedIdsByName(ids.names)
const LG = 'Forbidden Rites'
const last = Math.max(...hours.map((h) => h.hour))

function ndjsonRefNames(lang: 'en' | 'ru'): Map<string, string> {
  const out = new Map<string, string>()
  const text = readFileSync(resolve(__dirname, `../../resources/data/poe2/${lang}/items.ndjson`), 'utf8')
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const it = JSON.parse(line) as { name?: string; refName?: string }
    if (it.refName && it.name && !out.has(it.refName)) out.set(it.refName, it.name)
  }
  return out
}

describe('курс PoE 2 по фиду', () => {
  it('exalted за divine и за chaos — VWAP прямых рынков, час — последний час фида', () => {
    const r = poe2Rate(hours, LG)!
    expect(r.hour).toBe(last * 1000)
    // 31.10: ~689 ex за div, ~71 ex за chaos (div ≈ 9.6 chaos)
    expect(r.exaltedPerDivine).toBeGreaterThan(600)
    expect(r.exaltedPerDivine).toBeLessThan(800)
    expect(r.exaltedPerChaos).toBeGreaterThan(60)
    expect(r.exaltedPerChaos).toBeLessThan(90)
  })

  it('нет прямого рынка ex ↔ div — через chaos', () => {
    const noDirect = hours.map((h) => ({
      hour: h.hour,
      markets: h.markets.filter((m) => !(new Set([m[1], m[2]]).has(EXALTED_ID) && new Set([m[1], m[2]]).has(DIVINE_ID)))
    }))
    const direct = poe2Rate(hours, LG)!
    const tri = poe2Rate(noDirect, LG)!
    expect(Math.abs(tri.exaltedPerDivine - direct.exaltedPerDivine) / direct.exaltedPerDivine).toBeLessThan(0.15)
  })

  it('нет лиги или пустой фид — курса нет', () => {
    expect(poe2Rate(hours, 'Нет такой лиги')).toBeNull()
    expect(poe2Rate([], LG)).toBeNull()
  })
})

describe('цена у Ange', () => {
  const rate = poe2Rate(hours, LG)!

  it('Exalted Orb — 1 ex, Divine Orb и Chaos Orb — ровно курс', () => {
    expect(angePriceByName(hours, LG, byName, 'Exalted Orb', rate)!.exalted).toBe(1)
    const div = angePriceByName(hours, LG, byName, 'Divine Orb', rate)!
    expect(div.exalted).toBe(rate.exaltedPerDivine)
    expect(div.id).toBe(DIVINE_ID)
    // главный рынок divine — за chaos: «chaos за div» по курсу
    expect(div.main.base).toBe('chaos')
    expect(div.main.each).toBeCloseTo(rate.exaltedPerDivine / rate.exaltedPerChaos!, 6)
    expect(angePriceByName(hours, LG, byName, 'Chaos Orb', rate)!.exalted).toBe(rate.exaltedPerChaos)
  })

  it('обычная валюта: главный рынок — где поменяли больше штук, цена — в exalted по курсу', () => {
    const regal = angePriceByName(hours, LG, byName, 'Regal Orb', rate)!
    expect(regal.id).toBe('Currency/CurrencyUpgradeMagicToRare')
    expect(regal.age).toBe(0)
    expect(regal.low).toBe(false)
    const vols = [regal.main, ...regal.others].map((m) => m.volume)
    expect(regal.main.volume).toBe(Math.max(...vols))
    const toEx = { exalted: 1, divine: rate.exaltedPerDivine, chaos: rate.exaltedPerChaos! }
    expect(regal.exalted).toBeCloseTo(regal.main.each * toEx[regal.main.base], 6)
    // ~2 ex за штуку (31.10)
    expect(regal.exalted).toBeGreaterThan(1)
    expect(regal.exalted).toBeLessThan(5)
    for (const m of [regal.main, ...regal.others]) expect(m.lo).toBeLessThanOrEqual(m.hi)
    expect(angeConfidence(regal)).toBe(4)
  })

  it('мало сделок за час — «примерно», точность низкая', () => {
    const ess = angePriceByName(hours, LG, byName, 'Greater Essence of the Body', rate)!
    expect(ess.main.volume).toBeLessThan(LOW_VOLUME)
    expect(ess.low).toBe(true)
    expect(angeConfidence(ess)).toBeLessThanOrEqual(1)
  })

  it('регистр имени не важен; неизвестное имя и не менявшийся предмет — нет цены', () => {
    expect(angePriceByName(hours, LG, byName, 'regal orb', rate)?.id).toBe('Currency/CurrencyUpgradeMagicToRare')
    expect(angePriceByName(hours, LG, byName, 'Нет такой сферы', rate)).toBeUndefined()
    // есть в именах, но в часах фикстуры его не меняли
    expect(angePriceByName(hours, LG, byName, 'Orb of Chance', rate)).toBeUndefined()
  })

  it('свежий час — самый поздний со сделками; старше STALE_HOURS — «примерно»', () => {
    const older = hours.map((h) => (h.hour === last ? { hour: h.hour, markets: h.markets.filter((m) => m[1] !== 'Currency/CurrencyCorrupt' && m[2] !== 'Currency/CurrencyCorrupt') } : h))
    const vaal = angePrice(older, LG, 'Currency/CurrencyCorrupt', rate)!
    expect(vaal.age).toBe(1)
    expect(vaal.hour).toBe((last - 3600) * 1000)
    expect(angeConfidence(vaal)).toBeLessThanOrEqual(3)
  })

  it('без курса divine — нет цены', () => {
    expect(angePrice(hours, LG, 'Currency/CurrencyUpgradeMagicToRare', { exaltedPerDivine: 0, hour: 0 })).toBeUndefined()
  })
})

describe('имена id фида PoE 2 (RePoE PoE 2 + EE2)', () => {
  const en = ndjsonRefNames('en')
  const ru = ndjsonRefNames('ru')

  it('файл версии 1; три базы — с английскими именами, как refName в данных EE2', () => {
    expect(ids.version).toBe(1)
    expect(ids.names[EXALTED_ID]).toBe('Exalted Orb')
    expect(ids.names[DIVINE_ID]).toBe('Divine Orb')
    expect(ids.names[CHAOS_ID]).toBe('Chaos Orb')
    for (const id of [EXALTED_ID, DIVINE_ID, CHAOS_ID]) expect(en.has(ids.names[id])).toBe(true)
  })

  it('RU-имена — из данных EE2 по английскому имени (RU и EN клиент находят одну цену)', () => {
    expect(ids.ru[EXALTED_ID]).toBe('Сфера возвышения')
    expect(ids.ru[DIVINE_ID]).toBe('Божественная сфера')
    for (const [id, name] of Object.entries(ids.ru)) expect(ru.get(ids.names[id]), id).toBe(name)
  })

  it('все id из часов фикстуры — с именем', () => {
    for (const h of hours) for (const m of h.markets) for (const id of [m[1], m[2]]) expect(ids.names[id], id).toBeTruthy()
  })
})

describe('свежесть фида (без сети кэш не выдаётся за свежую цену)', () => {
  it('последний час не старше 3 ч от текущего — свежо; старше или пусто — нет', () => {
    const at = (h: number) => (h + 3600) * 1000 + 60_000 // через минуту после конца часа h
    expect(feedFresh(hours, at(last))).toBe(true)
    // текущий час — last + 3 ч: последний час фида на 3 ч раньше — ещё свежо; на 4 ч — уже нет
    expect(feedFresh(hours, at(last + 2 * 3600))).toBe(true)
    expect(feedFresh(hours, at(last + 3 * 3600))).toBe(false)
    expect(feedFresh(hours, at(last + 48 * 3600))).toBe(false)
    expect(feedFresh([], Date.now())).toBe(false)
  })
})
