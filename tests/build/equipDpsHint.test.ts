import { describe, expect, it } from 'vitest'
import type { CmpRow } from '@shared/build/equipCompare'
import type { EquipItem } from '@shared/types/equip'
import type { UiLang } from '@shared/types'
import { equip } from '../../src/renderer/src/i18n/dict/equip'

// «Против надетого» (S42 по S41): у строки «DPS оружия» подпись «как есть» — фильтр окна цены считает DPS при
// качестве 20 % (calc-q20), поэтому там число больше (меч из фикстуры: 699 здесь, 838 в фильтре). Подпись — в hint,
// который показывается в простом и экспертном режимах (note у эксперта — только у потерь).

// EquipBox — .tsx renderer (JSX и DOM-типы не входят в tsconfig.test.json): импорт по строке, как tests/build/store
const EQUIP_BOX = '../../src/renderer/src/overlay/pricecheck/EquipBox'
type RowView = { values: string; note?: string; hint?: string }
type T = (key: string, params?: Record<string, string | number>) => string
const { rowView } = (await import(/* @vite-ignore */ EQUIP_BOX)) as {
  rowView: (r: CmpRow, item: EquipItem, totals: boolean, t: T) => RowView
}

const tr =
  (lang: UiLang) =>
  (key: string, params?: Record<string, string | number>): string => {
    let s = equip[lang][key] ?? key
    for (const k of Object.keys(params ?? {})) s = s.replace(`{${k}}`, String(params![k]))
    return s
  }

const ITEM = { kind: 'weapon1h' } as unknown as EquipItem
const row = (over: Partial<CmpRow> = {}): CmpRow => ({ id: 'dps', dir: 'up', tier: 2, before: 512, after: 699, delta: 187, ...over }) as CmpRow

describe('строка DPS оружия: подпись «как есть»', () => {
  it.each(['ru', 'en'] as UiLang[])('%s: подпись есть и говорит про качество 20 %%', (lang) => {
    const v = rowView(row(), ITEM, false, tr(lang))
    expect(v.values).toBe('512 → 699')
    expect(v.hint).toBe(equip[lang]['eq.n.dps.asIs'])
    expect(v.hint).toMatch(/20\s?%/)
  })

  it('и у оружия чар, и при разбивке физ./стих. — подпись остаётся отдельно от пояснения', () => {
    const caster = rowView(row({ caster: true }), ITEM, false, tr('ru'))
    expect(caster.note).toBe(equip.ru['eq.n.caster'])
    expect(caster.hint).toBe(equip.ru['eq.n.dps.asIs'])
    const split = rowView(row({ split: { pdps: [300, 400], edps: [212, 299] } }), ITEM, false, tr('en'))
    expect(split.note).toContain('phys 300 → 400')
    expect(split.hint).toBe(equip.en['eq.n.dps.asIs'])
  })

  it('у других строк подписи нет', () => {
    const life = rowView({ id: 'life', dir: 'up', tier: 2, before: 40, after: 70, delta: 30 } as CmpRow, ITEM, false, tr('ru'))
    expect(life.hint).toBeUndefined()
  })
})
