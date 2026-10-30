import { describe, expect, it } from 'vitest'
import { cleanPobRequest, delta, dpsOf, pobOption, pobSign } from '@shared/build/pobCompare'
import type { EquipEntry } from '@shared/types/equip'

// S44: проверка запроса окна (недоверенный текст и слоты) и вердикт по статам движка PoB.

const entry = (slot: EquipEntry['slot']): EquipEntry =>
  ({
    slot,
    kind: 'ring',
    rarity: 'rare',
    name: null,
    base: 'Two-Stone Ring',
    n: {} as EquipEntry['n'],
    req: { level: 0, str: 0, dex: 0, int: 0 },
    flask: null,
    at: 1
  }) as EquipEntry

describe('запрос окна', () => {
  const remembered = [entry('Ring 1'), entry('Helmet')]

  it('нормальный запрос проходит; лишнее отбрасывается', () => {
    const r = cleanPobRequest(
      { item: 'Rarity: Rare\r\nX\r\nUnset Ring', options: [['Ring 1'], ['Ring 2']], worn: [{ slot: 'Ring 1', item: 'Rarity: Rare\nA\nB' }], extra: 1 },
      remembered
    )
    expect(r).toEqual({ item: 'Rarity: Rare\nX\nUnset Ring', options: [['Ring 1'], ['Ring 2']], worn: { 'Ring 1': 'Rarity: Rare\nA\nB' } })
  })

  it('надетое — только в слотах, где вещь запомнена; флаконы и самоцветы — нет', () => {
    const r = cleanPobRequest(
      {
        item: 'a',
        options: [['Boots']],
        worn: [
          { slot: 'Boots', item: 'x' },
          { slot: 'Flask 1', item: 'x' },
          { slot: 'Jewel 1', item: 'x' },
          { slot: 'Helmet', item: 'h' }
        ]
      },
      remembered
    )
    expect(r?.worn).toEqual({ Helmet: 'h' })
  })

  it.each([
    ['не объект', 'x'],
    ['нет предмета', { options: [['Ring 1']] }],
    ['пустой предмет', { item: '   ', options: [['Ring 1']] }],
    ['предмет > 16 КБ', { item: 'x'.repeat(16 * 1024 + 1), options: [['Ring 1']] }],
    ['нет вариантов', { item: 'a', options: [] }],
    ['слишком много вариантов', { item: 'a', options: [['Ring 1'], ['Ring 2'], ['Ring 1'], ['Ring 2'], ['Ring 1']] }],
    ['чужой слот', { item: 'a', options: [['Flask 1']] }],
    ['три слота', { item: 'a', options: [['Weapon 1', 'Weapon 2', 'Helmet']] }],
    ['слот не строка', { item: 'a', options: [[1]] }]
  ])('%s — отказ', (_n, v) => {
    expect(cleanPobRequest(v, remembered)).toBeNull()
  })

  it('управляющие символы из текста убираются', () => {
    expect(cleanPobRequest({ item: 'a\u0000b\u001bc\td', options: [['Belt']] }, [])?.item).toBe('abc\td')
  })
})

describe('вердикт PoB', () => {
  it('дельта: проценты к «до», ноль «до» — без процента', () => {
    expect(delta(1000, 1124)).toEqual({ before: 1000, after: 1124, pct: 12.4 })
    expect(delta(0, 50)?.pct).toBeNull()
    expect(delta(undefined, 1)).toBeUndefined()
  })

  it('урон: Full DPS → главный навык → приспешники', () => {
    expect(dpsOf({ FullDPS: 10, CombinedDPS: 5 }, { FullDPS: 11, CombinedDPS: 4 })?.kind).toBe('full')
    expect(dpsOf({ CombinedDPS: 5 }, { CombinedDPS: 6 })?.kind).toBe('combined')
    expect(dpsOf({ CombinedDPS: 0, MinionCombinedDPS: 100 }, { MinionCombinedDPS: 90 })).toEqual({ kind: 'minion', d: { before: 100, after: 90, pct: -10 } })
    expect(dpsOf({}, {})).toBeNull()
  })

  it('кап: был на капе и стал ниже — потеря; дошёл до капа; хаос без изменений не показывается', () => {
    const o = pobOption(
      { FireResist: 75, ColdResist: 60, ChaosResist: -20, FireResistMax: 75, ColdResistMax: 75 },
      { FireResist: 61, ColdResist: 75, ChaosResist: -20, FireResistMax: 75, ColdResistMax: 75 },
      'worn'
    )
    expect(o.res).toEqual([
      { el: 'fire', before: 75, after: 61, cap: 75, lost: true, reach: false, below: true },
      { el: 'cold', before: 60, after: 75, cap: 75, lost: false, reach: true, below: false }
    ])
    expect(pobSign(o)).toBe('mixed')
  })

  it('запас над капом тоже изменение (на капе, но запас меньше)', () => {
    const o = pobOption({ FireResist: 75, FireResistOverCap: 20 }, { FireResist: 75, FireResistOverCap: 5 }, 'build')
    expect(o.res).toHaveLength(1)
    expect(o.res[0].lost).toBe(false)
  })

  it('нехватка атрибутов — только новая или выросшая', () => {
    const base = { Str: 100, ReqStr: 90, Dex: 50, ReqDex: 70 }
    const o = pobOption(base, { Str: 80, ReqStr: 90, Dex: 50, ReqDex: 70 }, 'build')
    expect(o.short).toEqual([{ a: 'str', have: 80, need: 90 }])
    const worse = pobOption(base, { Str: 100, ReqStr: 90, Dex: 40, ReqDex: 70 }, 'build')
    expect(worse.short).toEqual([{ a: 'dex', have: 40, need: 70 }])
  })

  it('не подходит в слот — вариант с ошибкой', () => {
    expect(pobOption({}, null, 'empty')).toEqual({ ok: false, error: 'slot', res: [], short: [], against: 'empty' })
  })

  it('знак: шум < 1 % — «так же»; выгода в уроне и потеря EHP — «по-разному»', () => {
    expect(pobSign(pobOption({ CombinedDPS: 1000, TotalEHP: 5000 }, { CombinedDPS: 1005, TotalEHP: 5000 }, 'worn'))).toBe('same')
    expect(pobSign(pobOption({ CombinedDPS: 1000, TotalEHP: 5000 }, { CombinedDPS: 1100, TotalEHP: 4500 }, 'worn'))).toBe('mixed')
    expect(pobSign(pobOption({ CombinedDPS: 1000, TotalEHP: 5000 }, { CombinedDPS: 1100, TotalEHP: 5100 }, 'worn'))).toBe('better')
  })
})
