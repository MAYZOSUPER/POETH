import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_TABS,
  HARD_MAX_TABS,
  defaultTabSelection,
  effectiveAutoIntervalMin,
  minAutoIntervalMin,
  normalizeAccountName,
  reconcileSelection
} from '../../src/shared/wealth/tabs'
import type { StashTabInfo } from '../../src/shared/wealth/stash'

const tab = (index: number, type = 'PremiumStash', unsupported?: boolean): StashTabInfo => ({
  id: `t${index}`,
  index,
  name: `#${index + 1}`,
  type,
  ...(unsupported ? { unsupported } : {})
})

describe('выбор вкладок', () => {
  it('по умолчанию: особые вкладки первыми, без «сайт не отдаёт», не больше 25', () => {
    const tabs = [
      tab(0),
      tab(1, 'MapStash', true),
      tab(2, 'DivinationCardStash'),
      tab(3, 'CurrencyStash'),
      ...Array.from({ length: 40 }, (_, i) => tab(4 + i, 'QuadStash'))
    ]
    const sel = defaultTabSelection(tabs)
    expect(sel).toHaveLength(DEFAULT_MAX_TABS)
    expect(sel.slice(0, 3)).toEqual(['t3', 't2', 't0'])
    expect(sel).not.toContain('t1')
  })

  it('сохранённый выбор: исчезнувшие и неподдерживаемые выпадают, порядок — как на сайте', () => {
    const tabs = [tab(0), tab(1, 'UniqueStash', true), tab(2), tab(3)]
    expect(reconcileSelection(tabs, ['t3', 'gone', 't1', 't0'])).toEqual(['t0', 't3'])
    expect(reconcileSelection(tabs, [])).toEqual([])
    // выбора ещё не было — по умолчанию
    expect(reconcileSelection(tabs, null)).toEqual(['t0', 't2', 't3'])
    const many = Array.from({ length: 60 }, (_, i) => tab(i))
    expect(reconcileSelection(many, many.map((t) => t.id))).toHaveLength(HARD_MAX_TABS)
  })
})

describe('имя аккаунта', () => {
  it('Name#1234, из ссылки профиля Name-1234, старые имена; мусор — null', () => {
    expect(normalizeAccountName('  Exile_Example#1234 ')).toBe('Exile_Example#1234')
    expect(normalizeAccountName('Exile_Example-0042')).toBe('Exile_Example#0042')
    expect(normalizeAccountName('OldName')).toBe('OldName')
    expect(normalizeAccountName('Name#12')).toBeNull()
    expect(normalizeAccountName('a<b>#1234')).toBeNull()
    expect(normalizeAccountName('')).toBeNull()
    expect(normalizeAccountName(42)).toBeNull()
  })
})

describe('бюджет запросов стэша', () => {
  it('минимальный интервал авто-снимка из длинных окон лимита с резервом 25 %', () => {
    // окна 90/30 мин → 67, 180/2 ч → 135
    expect(minAutoIntervalMin(10)).toBe(15)
    expect(minAutoIntervalMin(25)).toBe(23) // 25·120/135 = 22.2 → 23
    expect(minAutoIntervalMin(40)).toBe(36)
    expect(minAutoIntervalMin(0)).toBe(15)
  })

  it('фактический интервал: желаемый в пределах 15–60, но не меньше лимита', () => {
    expect(effectiveAutoIntervalMin(20, 10)).toBe(20)
    expect(effectiveAutoIntervalMin(15, 25)).toBe(23)
    expect(effectiveAutoIntervalMin(5, 1)).toBe(15)
    expect(effectiveAutoIntervalMin(500, 1)).toBe(60)
    // другие окна (после входа сайт может прислать свои)
    expect(minAutoIntervalMin(20, [{ hits: 20, periodSec: 3600 }])).toBe(80)
  })
})
