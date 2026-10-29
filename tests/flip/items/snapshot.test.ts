import { describe, expect, it } from 'vitest'
import { isFoulborn, isPlainUnique, leagueFile, parseIndex, parseLine, parseSnapshot, uniqueName, unlinkedForms } from '@shared/flip/items/snapshot'
import { divineRateOf, leagueFile as ciLeagueFile, reduceLine } from '../../../tools/data/ninja-snapshot.mjs'
import { DIVINE, fixture, line, sampleSnapshot } from './helpers'

describe('снимок poe.ninja: разбор в CI (tools/data/ninja-snapshot.mjs)', () => {
  it('строка item overview → короткая строка снимка: без иконок и текстов, 0/0 tradeInfo — «свойство есть»', () => {
    const raw = fixture<{ types: Record<string, { lines: Array<Record<string, unknown>> }> }>('ninja-allflame-sample.json')
    const rath = raw.types.UniqueArmour.lines.find((l) => l.detailsId === 'foulborn-rathpith-globe-dot-per-life-titanium-spirit-shield')
    const r = reduceLine('UniqueArmour', rath)
    expect(r).toEqual({
      id: 'foulborn-rathpith-globe-dot-per-life-titanium-spirit-shield',
      name: 'Foulborn Rathpith Globe',
      base: 'Titanium Spirit Shield',
      type: 'UniqueArmour',
      cls: 3,
      chaos: 99343,
      count: 9,
      listings: 10,
      variant: 'DOT per Life',
      itemType: 'Shield',
      trade: [{ id: 'explicit.stat_1855381243' }],
      change: 15.8,
      spark: [0, null, null, 49.1, null, 35.5, 15.8]
    })
    expect(reduceLine('UniqueArmour', { name: 'x' })).toBeNull()
    expect(reduceLine('UniqueArmour', { detailsId: 'a', name: 'A', baseType: 'B', chaosValue: 0 })).toBeNull()
  })

  it('курс divine — медиана chaosValue / divineValue', () => {
    const lines = [
      { chaosValue: 674.2, divineValue: 2 },
      { chaosValue: 337.1, divineValue: 1 },
      { chaosValue: 3380, divineValue: 10.03 },
      { chaosValue: 10, divineValue: 0.03 } // дешёвые — с грубым округлением, не берём
    ]
    expect(divineRateOf(lines)).toBeCloseTo(DIVINE, 0)
  })

  it('имя файла лиги одинаковое в CI и в приложении', () => {
    for (const lg of ['Allflame', 'Hardcore Allflame', 'Standard', 'Лига (PL123)']) expect(leagueFile(lg)).toBe(ciLeagueFile(lg))
    expect(leagueFile('Hardcore Allflame')).toBe('Hardcore_20Allflame.json')
  })
})

describe('снимок в приложении: недоверенные данные', () => {
  it('выборка разбирается целиком, Foulborn и связи узнаются', () => {
    const snap = sampleSnapshot()
    expect(snap.league).toBe('Allflame')
    expect(snap.divine).toBe(DIVINE)
    expect(snap.lines.length).toBe(33)
    const cov = line(snap, 'foulborn-the-covenant-blood-magic-spidersilk-robe-6l')
    expect(isFoulborn(cov)).toBe(true)
    expect(uniqueName(cov)).toBe('The Covenant')
    expect(cov.links).toBe(6)
  })

  it('мусор и чужие поля отбрасываются', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot({ v: 2, league: 'X', at: 1, lines: [] })).toBeNull()
    const snap = parseSnapshot({
      v: 1,
      league: 'X',
      at: 5,
      lines: [
        { id: 'a', name: 'A', base: 'B', type: 'UniqueArmour', chaos: 10, links: 4, trade: [{ id: 'bad id' }, { id: 'explicit.stat_1', min: 2 }], spark: [1, 'x'] },
        { id: 'a', name: 'dup', base: 'B', type: 'UniqueArmour', chaos: 5 },
        { id: 'b', name: 'B', base: 'B', type: 'UniqueArmour', chaos: -1 },
        'строка'
      ]
    })
    expect(snap?.lines).toEqual([{ id: 'a', name: 'A', base: 'B', type: 'UniqueArmour', cls: 3, chaos: 10, count: 0, listings: 0, trade: [{ id: 'explicit.stat_1', min: 2 }], spark: [1, null] }])
    expect(parseLine({ id: 'x', name: 'X', base: 'Y', type: 'T', chaos: 1e12 })).toBeNull()
  })

  it('index.json: файлы только poe1/<имя>.json — без выхода из папки', () => {
    const idx = parseIndex({
      v: 1,
      at: 100,
      leagues: [
        { league: 'Allflame', file: 'poe1/Allflame.json', at: 90 },
        { league: 'Evil', file: '../secrets.json' },
        { league: 'Evil2', file: 'poe1/../../x.json' },
        { league: 'Std', file: 'poe1/Standard.json' }
      ]
    })
    expect(idx).toEqual({
      at: 100,
      leagues: [
        { league: 'Allflame', file: 'poe1/Allflame.json', at: 90 },
        { league: 'Std', file: 'poe1/Standard.json', at: 100 }
      ]
    })
  })

  it('фольга (рамка 9) не флипается, рамки 3 и 10 — обычные уники', () => {
    expect(isPlainUnique({ cls: 3 })).toBe(true)
    expect(isPlainUnique({ cls: 10 })).toBe(true)
    expect(isPlainUnique({ cls: 9 })).toBe(false)
  })

  it('без связей при наличии 5L/6L — отдельная форма (поиск «не больше 4 связей»)', () => {
    const forms = unlinkedForms(sampleSnapshot().lines)
    expect(forms.has("Shavronne's Wrappings\u0000Occultist's Vestment\u0000")).toBe(true)
    expect(forms.has("Kaom's Heart\u0000Glorious Plate\u0000")).toBe(false)
  })
})
