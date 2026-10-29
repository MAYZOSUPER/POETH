import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import { buildRequest, createPriceCheck, type FilterPreset, type StatFilter } from '@shared/poe1/pricecheck'
import { statWorth } from '@shared/poe1/pricecheck/filters/defaults'
import { readFixture, store } from '../poe1/helpers'

// S23 (живая проверка rc.8): редкий по Ctrl+D ищется по той же базе, отмечено то, за что платят покупатели.
// Фикстуры rare-* — типичные редкие (расширенный Ctrl+C с тирами, как копирует игра с 3.29), EN и RU-пара;
// rare-ring — кольцо пользователя из живой проверки (Death Nail, Unset Ring).

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

const RARES = [
  'rare-ring',
  'rare-amulet',
  'rare-boots',
  'rare-gloves',
  'rare-helmet',
  'rare-chest',
  'rare-wand',
  'rare-sword',
  'rare-belt',
  'rare-jewel'
] as const

function check(lang: Poe1Lang, name: string): { item: ParsedItem; preset: FilterPreset } {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  const pc = createPriceCheck(res.value, data[lang], { league: 'Standard' })
  return { item: res.value, preset: pc.presets.find((p) => p.id === pc.active)! }
}

const statFilters = (p: FilterPreset): StatFilter[] =>
  p.stats.flatMap((s) => (s.group ? s.stats : [s])).filter((f: StatFilter) => !f.hidden)

const checked = (p: FilterPreset): string[] => statFilters(p).filter((f) => !f.disabled).map((f) => f.statRef)

/** Что видит игрок после Ctrl+D: база и галочки (с минимумом) — по ref, одинаково для EN и RU. */
function view(lang: Poe1Lang, name: string): string[] {
  const { item, preset } = check(lang, name)
  const relaxed = preset.filters.searchRelaxed
  const base = relaxed && !relaxed.disabled ? `любая база: ${relaxed.category}` : `база: ${item.info.refName}`
  return [
    base,
    ...statFilters(preset).map((f) => {
      const min = !f.disabled && typeof f.roll?.min === 'number' ? ` ≥ ${f.roll.min}` : ''
      return `${f.disabled ? '[ ]' : '[x]'} ${f.statRef}${min}`
    })
  ]
}

describe('S23: галочки и база редкого после Ctrl+D', () => {
  it.each(RARES)('%s: снимок (EN = RU)', (name) => {
    const en = view('en', name)
    expect(view('ru', name)).toEqual(en)
    expect(en).toMatchSnapshot()
  })

  it.each(['en', 'ru'] as const)('кольцо пользователя (%s): база, мана, скорость чар и сопротивления', (lang) => {
    const { item, preset } = check(lang, 'rare-ring')
    expect(preset.filters.searchRelaxed).toMatchObject({ disabled: true })
    expect(checked(preset).sort()).toEqual(['+# total maximum Mana', '+#% total Cast Speed', '+#% total Elemental Resistance'])
    // гнездо — имплицит базы: при поиске той же базы лишнее; T5 урон и уклонение на кольце цену не делают
    for (const ref of ['Has # Sockets', 'Adds # to # Lightning Damage to Attacks', '+# to Evasion Rating']) {
      expect(checked(preset)).not.toContain(ref)
    }
    const req = buildRequest(item, data[lang], preset)
    if (req.api !== 'trade') throw new Error('ожидался обычный поиск')
    expect(req.body.query.type).toBe('Unset Ring')
    expect(JSON.stringify(req.body)).not.toContain('accessory.ring')
  })

  it('мусор не отмечается даже T1: точность, оглушение, радиус света, шипы, броня на поясе', () => {
    expect(statWorth('+# to Accuracy Rating')).toBe('junk')
    const junk = ['+# to Accuracy Rating', '#% increased Stun and Block Recovery', '#% increased Light Radius', 'Reflects # Physical Damage to Melee Attackers', '+# to Armour']
    for (const name of RARES) for (const ref of junk) expect(checked(check('en', name).preset), `${name}: ${ref}`).not.toContain(ref)
  })

  it('урон, крит, уровни камней, подавление — T1–T3; хуже — нет', () => {
    const wand = checked(check('en', 'rare-wand').preset)
    expect(wand).toEqual(expect.arrayContaining(['#% increased Spell Damage', '+# to Level of all Cold Spell Skill Gems', '+#% Global Critical Strike Multiplier']))
    // T4 добавочный урон холодом к чарам и T3 регенерация маны (не из списка ценных) — без галочки
    expect(wand).not.toContain('Adds # to # Cold Damage to Spells')
    expect(wand).not.toContain('#% increased Mana Regeneration Rate')
    expect(checked(check('en', 'rare-gloves').preset)).toContain('+#% chance to Suppress Spell Damage')
    expect(checked(check('en', 'rare-helmet').preset)).toContain('+# to Level of Socketed Minion Gems')
  })

  it('без тира (обычный Ctrl+C): «+1 к камням» отмечен, прочий урон — нет', () => {
    expect(checked(check('en', 'weapon-01').preset)).toContain('+# to Level of Socketed Melee Gems')
    expect(checked(check('en', 'jewellery-04').preset)).not.toContain('#% increased Fire Damage')
  })

  it('самоцвет — любая база (как в APT), кластер — точная (исключение APT); броня, оружие, бижутерия — та же база', () => {
    expect(check('en', 'rare-jewel').preset.filters.searchRelaxed).toMatchObject({ disabled: false })
    expect(check('en', 'adv-cluster').preset.filters.searchRelaxed).toMatchObject({ disabled: true })
    for (const name of ['rare-boots', 'rare-chest', 'rare-wand', 'rare-sword', 'rare-belt', 'jewellery-01', 'adv-weapon']) {
      expect(check('en', name).preset.filters.searchRelaxed, name).toMatchObject({ disabled: true })
    }
  })

  it('волшебный и уникальный — как раньше', () => {
    expect(check('ru', 'flask-05').preset.defaultsHint).toBe('magic')
    expect(check('en', 'unique-01').preset.filters.searchRelaxed).toBeUndefined()
  })
})
