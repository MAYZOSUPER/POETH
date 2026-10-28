import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem } from '@shared/poe1/parser'
import { createPriceCheck, type FilterPreset, type StatFilter } from '@shared/poe1/pricecheck'
import { convertPrice, rateFractions, roundChaos, roundDivine } from '@shared/poe1/pricecheck/currency'
import { fixtureNames, readFixture, store } from '../poe1/helpers'

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function active(lang: Poe1Lang, name: string): FilterPreset {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  const pc = createPriceCheck(res.value, data[lang], { league: 'Standard' })
  return pc.presets.find((p) => p.id === pc.active)!
}

const enabledRefs = (p: FilterPreset): string[] =>
  p.stats
    .flatMap((s) => (s.group ? s.stats : [s]))
    .filter((f: StatFilter) => !f.disabled)
    .map((f) => f.statRef)

describe('что отмечено после Ctrl+D (умолчания по типу предмета)', () => {
  it.each(['en', 'ru'] as const)('редкое кольцо (%s): T1–T2 моды и суммы резистов/жизни, T5 — нет', (lang) => {
    const p = active(lang, 'adv-ring')
    expect(p.defaultsHint).toBe('rare')
    const on = enabledRefs(p)
    expect(on).toContain('+#% total Elemental Resistance')
    expect(on).toContain('+# total maximum Life')
    // «Crusader's» (Tier: 1) — увеличение урона от молнии
    expect(on).toContain('#% increased Lightning Damage')
    expect(on).not.toContain('+# to Accuracy Rating')
    const res = p.stats.find((s): s is StatFilter => !s.group && s.statRef === '+#% total Elemental Resistance')!
    expect(typeof res.roll?.min).toBe('number')
  })

  it('оружие ближнего боя — DPS; жезл (заклинатель) — без DPS по умолчанию', () => {
    expect(enabledRefs(active('en', 'adv-weapon'))).toContain('Physical DPS: #')
    const wand = active('ru', 'weapon-04')
    expect(enabledRefs(wand).some((r) => /DPS/.test(r))).toBe(false)
  })

  it('уник: по имени, порча учитывается в обе стороны', () => {
    const u = active('ru', 'unique-01')
    expect(u.defaultsHint).toBe('unique')
    expect(u.filters.corrupted).toMatchObject({ value: false })
    expect(active('en', 'adv-unique-corrupted').filters.corrupted).toMatchObject({ value: true, exact: true })
  })

  it('камень: уровень и качество', () => {
    const g = active('ru', 'gem-02')
    expect(g.defaultsHint).toBe('gem')
    expect(g.filters.gemLevel?.disabled).toBe(false)
    expect(g.filters.quality).toMatchObject({ value: 10, disabled: false })
    expect(active('en', 'gem-01').filters.gemLevel?.disabled).toBe(false)
  })

  it('карта — тир; волшебный флакон — все свойства; timeless — сид; неопознанный и валюта — подсказки', () => {
    const map = active('en', 'map-01')
    expect(map.defaultsHint).toBe('map')
    expect(map.filters.mapTier?.disabled).toBe(false)
    const flask = active('ru', 'flask-05')
    expect(flask.defaultsHint).toBe('magic')
    expect(enabledRefs(flask).length).toBeGreaterThanOrEqual(2)
    expect(active('ru', 'timeless-01').defaultsHint).toBe('timeless')
    expect(active('en', 'armour-01').defaultsHint).toBe('unid')
    expect(active('ru', 'manual-currency-01').defaultsHint).toBe('bulk')
  })

  it('EN и RU одного предмета: одинаково отмечено и одна подсказка', () => {
    for (const name of fixtureNames('en')) {
      const en = active('en', name)
      const ru = active('ru', name)
      expect(ru.defaultsHint, name).toBe(en.defaultsHint)
      expect(enabledRefs(ru), name).toEqual(enabledRefs(en))
    }
  })
})

describe('курс chaos ↔ divine', () => {
  it('дроби для подсказки: 0.1 … 1 div', () => {
    const rows = rateFractions(337.5)
    expect(rows.map((r) => r.div)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    expect(rows[0]).toEqual({ div: 0.1, chaos: 34 })
    expect(rows[4]).toEqual({ div: 0.5, chaos: 169 })
    expect(rows[9]).toEqual({ div: 1, chaos: 338 })
    expect(rateFractions(0)).toEqual([])
    expect(rateFractions(60)[0]).toEqual({ div: 0.1, chaos: 6 })
  })

  it('эквивалент цены в другой валюте', () => {
    expect(convertPrice({ amount: 34, currency: 'chaos' }, 337.5)).toEqual({ amount: 0.1, currency: 'divine' })
    expect(convertPrice({ amount: 1.5, currency: 'divine' }, 338)).toEqual({ amount: 507, currency: 'chaos' })
    expect(convertPrice({ amount: 1, currency: 'alch' }, 338)).toBeNull()
    expect(convertPrice({ amount: 10, currency: 'chaos' }, undefined)).toBeNull()
    expect(convertPrice({ amount: 0, currency: 'chaos' }, 300)).toBeNull()
  })

  it('округление: chaos — целые от 10, divine — сотые', () => {
    expect(roundChaos(506.25)).toBe(506)
    expect(roundChaos(3.33)).toBe(3.3)
    expect(roundChaos(0.01)).toBe(0.1)
    expect(roundDivine(0.1007)).toBe(0.1)
    expect(roundDivine(12.34)).toBe(12.3)
    expect(roundDivine(0.001)).toBe(0.01)
  })
})
