import { describe, expect, it } from 'vitest'
import {
  CHECK_INTERVAL_MS,
  decideWrite,
  installedFileName,
  isOurFileName,
  looksLikeNeverSinkFilter,
  parseFilterHeader,
  shouldCheck
} from '@shared/lootFilter/rules'
import { LEVELS } from '@shared/lootFilter/levels'
import { filterText } from './zipFixture'

// S53: имена своих файлов, «не перезаписывать чужое», шапка фильтра, «раз в сутки».

describe('имена', () => {
  it('свой файл уровня', () => {
    expect(installedFileName(1)).toBe('POETH-NeverSink-1-REGULAR.filter')
    expect(installedFileName(6)).toBe('POETH-NeverSink-6-UBER-PLUS-STRICT.filter')
    for (const d of LEVELS) expect(isOurFileName(installedFileName(d.level))).toBe(true)
  })
  it.each([
    ["NeverSink's filter - 1-REGULAR.filter"],
    ['MyFilter.filter'],
    ['POETH-NeverSink-1-REGULAR.filter.bak'],
    ['POETH-NeverSink-7-REGULAR.filter'],
    ['POETH-NeverSink-1-regular.filter'],
    ['../POETH-NeverSink-1-REGULAR.filter'],
    ['POETH-NeverSink-1-REGULAR'],
    [null]
  ])('чужое имя %j — не наше', (n) => {
    expect(isOurFileName(n)).toBe(false)
  })
})

describe('decideWrite — не перезаписывать чужое', () => {
  const base = { exists: true, regularFile: true, recordedSha: 'a', currentSha: 'a', confirmed: false }
  it('файла нет — создать', () => {
    expect(decideWrite({ ...base, exists: false, recordedSha: null, currentSha: null })).toBe('create')
  })
  it('свой и не менялся — заменить молча', () => {
    expect(decideWrite(base)).toBe('replace')
  })
  it('свой, но игрок менял — спросить', () => {
    expect(decideWrite({ ...base, currentSha: 'b' })).toEqual({ confirm: 'modified' })
  })
  it('файл с нашим именем, но POETH его не ставил — спросить', () => {
    expect(decideWrite({ ...base, recordedSha: null })).toEqual({ confirm: 'unknown' })
  })
  it('не прочитали файл (слишком большой) — спросить', () => {
    expect(decideWrite({ ...base, currentSha: null })).toEqual({ confirm: 'modified' })
  })
  it('после «Перезаписать» — заменить', () => {
    expect(decideWrite({ ...base, currentSha: 'b', confirmed: true })).toBe('replace')
    expect(decideWrite({ ...base, recordedSha: null, confirmed: true })).toBe('replace')
  })
  it('папка или ссылка по пути — отказ даже с подтверждением', () => {
    expect(decideWrite({ ...base, regularFile: false, confirmed: true })).toBe('refuse')
  })
})

describe('шапка и содержимое фильтра', () => {
  it('читает VERSION/TYPE/STYLE', () => {
    expect(parseFilterHeader(filterText('3-STRICT', 'ABYSS'))).toEqual({ version: '8.20.2', type: '3-STRICT', style: 'ABYSS' })
    expect(parseFilterHeader('Show')).toEqual({ version: undefined, type: undefined, style: undefined })
  })
  it('настоящий фильтр NeverSink — да', () => {
    expect(looksLikeNeverSinkFilter(Buffer.from(filterText('1-REGULAR')))).toBe(true)
  })
  it('не фильтр, бинарник, не UTF-8, без правил — нет', () => {
    expect(looksLikeNeverSinkFilter(Buffer.from('MZ\u0090\u0000'.repeat(100)))).toBe(false)
    expect(looksLikeNeverSinkFilter(Buffer.from('# just a text file\n'.repeat(10)))).toBe(false)
    expect(looksLikeNeverSinkFilter(Buffer.from("# NeverSink's Indepth Loot Filter\n# no rules here\n".repeat(3)))).toBe(false)
    const bad = Buffer.concat([Buffer.from(filterText('1-REGULAR')), Buffer.from([0xc3, 0x28])])
    expect(looksLikeNeverSinkFilter(bad)).toBe(false)
    const nul = Buffer.from(filterText('1-REGULAR') + '\u0000')
    expect(looksLikeNeverSinkFilter(nul)).toBe(false)
  })
})

describe('shouldCheck — раз в сутки и только при открытом экране или с галочкой', () => {
  const now = 1_800_000_000_000
  it('экран закрыт и галочки нет — никогда', () => {
    expect(shouldCheck({ now, lastCheckAt: null, screenOpen: false, autoCheck: false })).toBe(false)
  })
  it('экран открыт, ни разу не проверяли — да', () => {
    expect(shouldCheck({ now, lastCheckAt: null, screenOpen: true, autoCheck: false })).toBe(true)
  })
  it('меньше суток — нет, сутки — да', () => {
    expect(shouldCheck({ now, lastCheckAt: now - CHECK_INTERVAL_MS + 1000, screenOpen: true, autoCheck: true })).toBe(false)
    expect(shouldCheck({ now, lastCheckAt: now - CHECK_INTERVAL_MS, screenOpen: false, autoCheck: true })).toBe(true)
  })
  it('часы перевели назад — проверить', () => {
    expect(shouldCheck({ now, lastCheckAt: now + 2 * 3600_000, screenOpen: true, autoCheck: false })).toBe(true)
  })
})
