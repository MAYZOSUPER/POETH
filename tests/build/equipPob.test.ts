import { describe, expect, it } from 'vitest'
import { emptyEquipFile, equipStateOf, parseEquipFile, putEquip, setPob } from '@shared/build/equipCompareStore'

// S44: галочка «Точный расчёт (PoB)» — одно поле в equipped.json, по умолчанию выключена, общая для персонажей.

describe('equipped.json: флаг беты PoB', () => {
  it('по умолчанию выключен; включается и выключается только логическим значением', () => {
    const f = emptyEquipFile()
    expect(equipStateOf(f, null, null).pob).toBe(false)
    const on = setPob(f, true)
    expect(on.pob).toBe(true)
    expect(equipStateOf(on, 'Hero', 10).pob).toBe(true)
    expect(setPob(on, 'yes')).toBe(on)
    expect(setPob(on, 1)).toBe(on)
    const off = setPob(on, false)
    expect('pob' in off).toBe(false)
  })

  it('переживает запись вещи и чтение файла; чужое значение в файле — выключен', () => {
    const on = setPob(emptyEquipFile(), true)
    const item = {
      kind: 'ring',
      rarity: 'rare',
      name: null,
      base: 'Two-Stone Ring',
      n: { life: 10, lifePct: 0, es: 0, mana: 0, res: { fire: 1, cold: 0, lightning: 0, chaos: 0 }, attr: { str: 0, dex: 0, int: 0 }, speed: 0, block: 0, pdps: 0, edps: 0, dmg: 0, caster: false },
      req: { level: 1, str: 0, dex: 0, int: 0 },
      flask: null
    }
    const saved = putEquip(on, 'Hero', 'Ring 1', item, 5)
    expect(saved.pob).toBe(true)
    expect(parseEquipFile(JSON.parse(JSON.stringify(saved))).pob).toBe(true)
    expect(parseEquipFile({ v: 1, sets: [], pob: 'true' }).pob).toBeUndefined()
    expect(parseEquipFile({ v: 1, sets: [], pob: 1 }).pob).toBeUndefined()
  })
})
