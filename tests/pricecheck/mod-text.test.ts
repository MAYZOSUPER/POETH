import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem } from '@shared/poe1/parser'
import type { StatSource } from '@shared/poe1/parser/modifiers'
import { createPriceCheck, type StatFilter } from '@shared/poe1/pricecheck'
import { modText, modTextParts, modTextString } from '@shared/poe1/pricecheck/filters/mod-text'
import { readFixture, store } from '../poe1/helpers'

// S23: строки модов в окне цены — как в игре: «Adds 3 to 34 Lightning Damage to Attacks» (среднее 18,5 —
// отдельно), «+40 to Evasion Rating», «+36% to Fire Resistance».

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

const fmt = (lang: Poe1Lang) => (n: number) => {
  const s = String(Math.round(n * 100) / 100)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** Все строки фильтров предмета так, как их видит игрок: [строка, среднее]. */
function rows(lang: Poe1Lang, name: string): Array<[string, number | undefined]> {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(res.error)
  const pc = createPriceCheck(res.value, data[lang], { league: 'Standard' })
  const preset = pc.presets.find((p) => p.id === pc.active)!
  return preset.stats
    .filter((s): s is StatFilter => !s.group && s.tag !== 'property')
    .map((f) => {
      const m = modText(f.text, f.statRef, f.roll?.value, f.sources, res.value.rawText)
      return [modTextString(m, fmt(lang)), m.avg]
    })
}

describe('S23: моды с числами', () => {
  it('кольцо пользователя (EN): числа «от # до #», «+» у «+#», псевдо без двойного «+»', () => {
    expect(rows('en', 'rare-ring')).toEqual([
      ['+71% total Elemental Resistance', undefined],
      ['+36% total to Fire Resistance', undefined],
      ['+44 total maximum Mana', undefined],
      ['+11% total Cast Speed', undefined],
      ['Has 1 Socket', undefined],
      ['Adds 3 to 34 Lightning Damage to Attacks', 18.5],
      ['+40 to Evasion Rating', undefined]
    ])
  })

  it('кольцо пользователя (RU): те же числа и «+»', () => {
    expect(rows('ru', 'rare-ring')).toEqual([
      ['Всего +71% сопротивления стихиям', undefined],
      ['Всего +36% к сопротивлению огню', undefined],
      ['Всего +44 к максимуму маны', undefined],
      ['Всего +11% к скорости сотворения чар', undefined],
      ['Имеет 1 гнездо', undefined],
      ['Добавляет от 3 до 34 урона от молнии к атакам', 18.5],
      ['+40 к уклонению', undefined]
    ])
  })

  it('отдельное сопротивление и минус: «+36% to Fire Resistance», «-5% to …»', () => {
    expect(modTextString(modText('#% to Fire Resistance', '+#% to Fire Resistance', 36, []), String)).toBe('+36% to Fire Resistance')
    expect(modTextString(modText('#% to Fire Resistance', '+#% to Fire Resistance', -5, []), String)).toBe('-5% to Fire Resistance')
    expect(modTextString(modText('#% increased Cast Speed', '#% increased Cast Speed', 11, []), String)).toBe('11% increased Cast Speed')
  })

  it('числа — отдельными кусками (их выделяют), без значения — «…»', () => {
    expect(modTextParts(modText('# to Evasion Rating', '+# to Evasion Rating', 40, []), String)).toEqual([
      { text: '+40', num: true },
      { text: ' to Evasion Rating' }
    ])
    expect(modTextString(modText('Adds # to # Fire Damage', 'Adds # to # Fire Damage', undefined, []), String)).toBe('Adds … to … Fire Damage')
  })

  it('два мода одного стата — суммы по местам; строки нет — «…» и среднее', () => {
    const src = (value: number, string = 'Adds # to # Fire Damage to Attacks') =>
      ({ stat: { translation: { string }, roll: { value } } }) as unknown as StatSource
    const raw = 'Adds 2(1-3) to 4(3-5) Fire Damage to Attacks\nAdds 10 to 20 Fire Damage to Attacks (crafted)'
    const two = modText('Adds # to # Fire Damage to Attacks', 'Adds # to # Fire Damage to Attacks', 18, [src(3), src(15)], raw)
    expect(two).toMatchObject({ nums: [12, 24], avg: 18 })
    // «Adds … to Spells» — другой стат, хвост строки не съедается
    const none = modText('Adds # to # Fire Damage', 'Adds # to # Fire Damage', 7, [src(7, 'Adds # to # Fire Damage')], 'Adds 5 to 9 Fire Damage to Spells')
    expect(none).toMatchObject({ avg: 7 })
    expect(none.nums).toBeUndefined()
  })
})
