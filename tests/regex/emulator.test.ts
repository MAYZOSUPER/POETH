import { describe, expect, it } from 'vitest'
import { matchesSearch, parseSearch } from '@shared/regex'

// Эмулятор поиска игры: И / ИЛИ / ! / кавычки / регистр / $ / «.» не переходит строку.

const ITEM = ['Item Class: Maps', 'Rarity: Rare', 'Item Quantity: +85% (augmented)', 'Monsters are Hexproof', 'Corrupted'].join(
  '\n'
)

describe('parseSearch', () => {
  it('термы, кавычки и отрицание', () => {
    expect(parseSearch('abc "d e|f" "!x|y" !z')).toEqual([
      { negate: false, source: 'abc' },
      { negate: false, source: 'd e|f' },
      { negate: true, source: 'x|y' },
      { negate: true, source: 'z' }
    ])
  })
  it('незакрытая кавычка — ошибка', () => {
    expect(() => parseSearch('"abc')).toThrow()
  })
})

describe('matchesSearch', () => {
  it('пробел — И, | — ИЛИ, регистр не важен', () => {
    expect(matchesSearch('hexproof tity:', ITEM)).toBe(true)
    expect(matchesSearch('hexproof reflect', ITEM)).toBe(false)
    expect(matchesSearch('"reflect|HEXPROOF"', ITEM)).toBe(true)
  })
  it('"!a|b" — нет ни a, ни b', () => {
    expect(matchesSearch('"!reflect|regen"', ITEM)).toBe(true)
    expect(matchesSearch('"!reflect|xpro"', ITEM)).toBe(false)
  })
  it('$ — конец строки, «.» не переходит через строку', () => {
    expect(matchesSearch('pted$', ITEM)).toBe(true)
    expect(matchesSearch('rare$', ITEM)).toBe(true)
    expect(matchesSearch('"hexproof.*corrupted"', ITEM)).toBe(false)
    expect(matchesSearch('"tity:.*([89].|\\d..)%"', ITEM)).toBe(true)
    expect(matchesSearch('"tity:.*(9.|\\d..)%"', ITEM)).toBe(false)
  })
  it('кириллица: регистр и ё/е по опциям', () => {
    const ru = 'Осквернено\nУникальные монстры оставляют осквернённые предметы'
    expect(matchesSearch('нено', ru)).toBe(true)
    expect(matchesSearch('осквернено', ru)).toBe(true)
    expect(matchesSearch('осквернено', ru, { asciiCaseOnly: true })).toBe(false)
    expect(matchesSearch('ённые', ru)).toBe(true)
    expect(matchesSearch('енные', ru)).toBe(false)
    expect(matchesSearch('енные', ru, { foldYo: true })).toBe(true)
  })
})
