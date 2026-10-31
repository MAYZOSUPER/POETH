import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { FullHour } from '@shared/flip/feed'
import { angePriceByName, feedIdsByName, poe2Rate, type AngePrice } from '@shared/poe2/pricecheck/ange'
import { angeView, rateFractions2 } from '@shared/poe2/pricecheck/priceBlock'
import { trade as dict } from '../../src/renderer/src/i18n/dict/trade'

// S61: блок «у Ange» окна цены PoE 2 — числа в единице показа; строки RU и EN.

const { hours } = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/poe2/exchange/hours.json'), 'utf8')) as { hours: FullHour[] }
const ids = JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe2/exchange/exchange-ids.json'), 'utf8')) as {
  names: Record<string, string>
}
const byName = feedIdsByName(ids.names)
const LG = 'Forbidden Rites'
const rate = poe2Rate(hours, LG)!
const price = (name: string): AngePrice => angePriceByName(hours, LG, byName, name, rate)!

/** Строка словаря trade с подстановкой {параметров} (как translate, без i18n/index). */
function tr(lang: 'ru' | 'en', key: string, params: Record<string, string | number> = {}): string {
  const s = dict[lang][key]
  if (s === undefined) return key
  let out = ''
  let rest = s
  for (;;) {
    const i = rest.indexOf('{')
    const j = i < 0 ? -1 : rest.indexOf('}', i)
    if (i < 0 || j < 0) return out + rest
    const name = rest.slice(i + 1, j)
    out += rest.slice(0, i) + (name in params ? String(params[name]) : rest.slice(i, j + 1))
    rest = rest.slice(j + 1)
  }
}

describe('блок «у Ange»', () => {
  it('обычная валюта — «≈ N ex за штуку», рынки в своих валютах, мелкое — «1 div за N шт.»', () => {
    const v = angeView(price('Regal Orb'))
    expect(v.kind).toBe('price')
    expect(v.each.currency).toBe('exalted')
    expect(v.each.amount).toBeGreaterThan(1)
    expect(v.stack).toBeUndefined()
    // regal за divine — меньше 0.01 div за штуку
    const div = v.rows.find((r) => r.base === 'divine')!
    expect(div.each).toBeUndefined()
    expect(div.perBase).toBeGreaterThan(100)
    const ex = v.rows.find((r) => r.base === 'exalted')!
    expect(ex.each?.currency).toBe('exalted')
    expect(v.volume).toBe(v.rows.reduce((s, r) => s + r.volume, 0))
  })

  it('стопка — сумма; от 1 div — в divine', () => {
    const v = angeView(price('Orb of Annulment'), 5)
    expect(v.each.currency).toBe('exalted')
    expect(v.stack?.currency).toBe('divine')
    expect(v.stack!.amount).toBeGreaterThan(1)
  })

  it('дешевле 1 ex — «1 ex ≈ N шт.»', () => {
    const v = angeView(price('Greater Essence of the Body'))
    expect(v.each.amount).toBeLessThan(1)
    expect(v.perExalted).toBe(3)
  })

  it('Exalted Orb — сама база; Divine и Chaos — курс; стопка divine — в exalted', () => {
    expect(angeView(price('Exalted Orb')).kind).toBe('exalted')
    const div = angeView(price('Divine Orb'), 3)
    expect(div.kind).toBe('rate')
    expect(div.each).toEqual({ amount: 1, currency: 'divine' })
    expect(div.stack?.currency).toBe('exalted')
    expect(angeView(price('Chaos Orb')).kind).toBe('rate')
  })

  it('дроби курса: 0.1 … 1 div', () => {
    expect(rateFractions2(690).map((r) => r.exalted)).toEqual([69, 173, 345, 518, 690])
    expect(rateFractions2(0)).toEqual([])
  })

  it('строки блока есть в RU и EN, в EN нет кириллицы', () => {
    for (const key of ['pc2.s61.rate', 'pc2.s61.ange.title', 'pc2.s61.ange.each', 'pc2.s61.v.sell', 'pc2.s61.why.fair', 'pc2.s61.tab.rate']) {
      const ru = tr('ru', key, { n: 690, price: '2 ex', hours: '22:00–23:00' })
      const en = tr('en', key, { n: 690, price: '2 ex', hours: '22:00–23:00' })
      expect(ru, key).not.toBe(key)
      expect(en, key).not.toBe(key)
      expect(en, key).not.toMatch(/[а-яё]/i)
    }
    expect(tr('ru', 'pc2.s61.ange.each')).toBe('за штуку · у Ange')
    expect(tr('en', 'pc2.s61.rate', { n: 690 })).toBe('1 div ≈ 690 ex')
  })
})
