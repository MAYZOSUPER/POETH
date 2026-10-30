import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data } from '@shared/poe1/data'
import { parseItem } from '@shared/poe1/parser'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import { applyPobRange, itemNumbers, maxLinks, pobBaseName, pobItemGameText, propKind, readPobItem } from '@shared/build/pobItem'
import { baseNameIn, modLineIn, statRefIn, uniqueNameIn } from '@shared/build/itemLang'
import { POE1_FIXTURES, fixtureXml } from '../pob/fixtures'
import { store } from '../poe1/helpers'

// S40: текст предмета PoB → предмет (вариант, диапазоны, имплициты) → текст «как в игре» для парсера окна цены.

const builds = new Map<string, PobBuild>()
function build(name: string): PobBuild {
  let b = builds.get(name)
  if (!b) {
    const r = parsePobXml(fixtureXml(name))
    if (!r.ok) throw new Error(name)
    b = r.build
    builds.set(name, b)
  }
  return b
}
const item = (f: string, id: number) => readPobItem(build(f).items.find((i) => i.id === id)!.text)!

let en: Poe1Data
let ru: Poe1Data
beforeAll(async () => {
  en = await store.ensureLanguage('en')
  ru = await store.ensureLanguage('ru')
})

describe('диапазоны PoB', () => {
  it('min + (max − min) · range, по умолчанию 0.5', () => {
    expect(applyPobRange('+(10-20) to maximum Life')).toBe('+15 to maximum Life')
    expect(applyPobRange('+(16-24) to Dexterity and Intelligence', 1)).toBe('+24 to Dexterity and Intelligence')
    expect(applyPobRange('Adds (2-3) to (5-6) Fire Damage to Spells', 0)).toBe('Adds 2 to 5 Fire Damage to Spells')
    expect(applyPobRange('(150-125)% increased Charges per use')).toBe('138% increased Charges per use')
    expect(applyPobRange('(0.5-1.5)% of Damage Leeched as Life')).toBe('1% of Damage Leeched as Life')
    expect(applyPobRange('(-20-10)% increased Mana Cost', 0)).toBe('20% reduced Mana Cost')
  })
  it('связи по строке гнёзд', () => {
    expect(maxLinks('R-R G')).toBe(2)
    expect(maxLinks('G-G-B-G-R-G')).toBe(6)
    expect(maxLinks(null)).toBe(0)
  })
  it('база без пометки варианта PoB', () => {
    expect(pobBaseName('Two-Stone Ring (Cold/Lightning)')).toBe('Two-Stone Ring')
    expect(pobBaseName('Astral Plate')).toBe('Astral Plate')
  })
})

describe('readPobItem на фикстурах', () => {
  it('уник с вариантами: строки выбранного варианта, имплициты по «Implicits: N»', () => {
    const axiom = item('pobbin-leveling-ranges', 15)
    expect(axiom).toMatchObject({ rarity: 'unique', name: 'Axiom Perpetuum', base: 'Bronze Sceptre', variants: 2, variantName: 'Current', links: 3, quality: 20, levelReq: 10 })
    expect(axiom.implicits.map((m) => m.text)).toEqual(['12% increased Elemental Damage'])
    expect(axiom.explicits.map((m) => m.text)).toContain('5% increased Cast Speed')
    expect(axiom.implicits[0].variant).toBeUndefined() // варианты — версии («Pre 2.3.0» → «Current»), не выбор
  })
  it('Thousand Ribbons: третий вариант, диапазоны свёрнуты', () => {
    const tr = item('pobbin-leveling-ranges', 17)
    const lines = tr.explicits.map((m) => m.text)
    expect(lines).toContain('+38 to maximum Life')
    expect(lines).toContain('+23% to Fire Resistance')
    expect(lines.some((l) => l.includes('+6 to maximum Life'))).toBe(false)
    expect(tr.links).toBe(6)
  })
  it('созданный мод — в имплицитах с пометкой; служебные строки PoB пропущены', () => {
    const badge = item('pobbin-leveling-ranges', 31)
    expect(badge.implicits[0]).toEqual({ text: 'Allocates Charisma', crafted: true })
    expect(badge.implicits[1].text).toBe('+24 to Dexterity and Intelligence') // {range:1} — максимум
    const chest = item('pobbin-leveling-ranges', 48)
    expect(chest).toMatchObject({ rarity: 'rare', name: 'Budget Chest', base: 'Vaal Regalia', influences: ['Hunter', 'Redeemer'] })
    expect(chest.explicits.map((m) => m.text)).toEqual([
      '67% increased Energy Shield',
      '+65 to maximum Life',
      '+29% to Cold Resistance',
      '+29% to Lightning Resistance',
      '10% chance to gain a Frenzy Charge on Hit',
      'You can apply an additional Curse'
    ])
  })
  it('магический флакон — одна строка имени, «Corrupted» — флаг', () => {
    const flask = item('pobbin-death-oath-328', 11)
    expect(flask).toMatchObject({ rarity: 'magic', name: "Experimenter's Quicksilver Flask of the Cheetah" })
    expect(item('pobcodes-nightblade', 18).corrupted).toBe(true)
  })
  it('Foulborn: имя без приставки, флаг', () => {
    expect(item('pobcodes-nightblade', 8)).toMatchObject({ name: "Lori's Lantern", foulborn: true })
  })
  it('числа предмета: жизнь, атрибуты, сопротивления, скорость', () => {
    const coil = itemNumbers(item('pobcodes-nightblade', 6))
    expect(coil).toMatchObject({ life: 89, attr: { str: 21, dex: 0, int: 0 } })
    const star = itemNumbers(item('pobcodes-nightblade', 17))
    expect(star).toMatchObject({ life: 96, attr: { dex: 66 } })
    expect(itemNumbers({ implicits: [], explicits: [{ text: '+16% to Fire and Cold Resistances' }, { text: '+10% to all Elemental Resistances' }, { text: '25% increased Movement Speed' }] })).toMatchObject({
      speed: 25,
      res: { fire: 26, cold: 26, lightning: 10, chaos: 0 }
    })
  })
  it('вид свойства: жизнь, сопротивления, скорость, важное для билда', () => {
    expect(propKind('+65 to maximum Life')).toBe('life')
    expect(propKind('+#% total Elemental Resistance')).toBe('res')
    expect(propKind('+29% to Cold Resistance')).toBe('res')
    expect(propKind('+16% to Fire and Cold Resistances')).toBe('res')
    expect(propKind('25% increased Movement Speed')).toBe('speed')
    expect(propKind('+1 to Level of all Spell Skill Gems')).toBe('build')
    expect(propKind('Adds 22 to 40 Physical Damage')).toBe('build')
    expect(propKind('+1% to maximum Fire Resistance')).toBe(null)
    expect(propKind('Regenerate 2% of Life per second')).toBe(null)
    expect(propKind('20% increased Rarity of Items found')).toBe(null)
  })
})

describe('текст «как в игре» понимает парсер окна цены', () => {
  it('все не-уники всех фикстур PoE 1 разбираются', () => {
    const bad: string[] = []
    let n = 0
    for (const f of POE1_FIXTURES)
      for (const it of build(f).items) {
        const info = readPobItem(it.text)
        if (!info || info.rarity === 'unique') continue
        n++
        const res = parseItem(pobItemGameText(info), en)
        if (!res.ok) bad.push(`${f}#${it.id}: ${res.error} ${res.detail ?? ''}`)
      }
    expect(n).toBeGreaterThan(300)
    expect(bad).toEqual([])
  })
  it('редкий доспех: база, моды, имплициты', () => {
    const res = parseItem(pobItemGameText(item('pobbin-death-oath-328', 23)), en)
    if (!res.ok) throw new Error(res.error)
    expect(res.value.info.refName).toBe('Royal Burgonet')
    expect(res.value.statsByType.map((s) => s.stat.ref)).toEqual(expect.arrayContaining(['+# to maximum Life', '+#% to Cold Resistance', '+#% to Fire Resistance']))
  })
})

describe('имена и моды на языке клиента (данные APT)', () => {
  it('уник, база, строка мода, стат поиска — RU', () => {
    expect(uniqueNameIn("Death's Oath", ru)).toBe('Клятва смерти')
    expect(uniqueNameIn("Death's Oath", en)).toBe("Death's Oath")
    expect(baseNameIn('Two-Stone Ring (Cold/Lightning)', ru)).toBe('Кольцо с двумя камнями')
    expect(modLineIn('+143 to maximum Life', en, ru)).toBe('+143 к максимуму здоровья')
    expect(modLineIn('Adds 2 to 5 Physical Damage', en, ru)).toBe('Добавляет от 2 до 5 физического урона')
    expect(modLineIn('+16% to Fire and Cold Resistances', en, ru)).toBe('+16% к сопротивлению огню и холоду')
    expect(statRefIn('+#% to Cold Resistance', 24, ru)).toBe('+24% к сопротивлению холоду')
    expect(statRefIn('+# total maximum Life', 60, ru)).toBe('Всего +60 к максимуму здоровья')
  })
  it('незнакомое — как в PoB, без выдумок', () => {
    expect(modLineIn('Some made-up line of 12 words', en, ru)).toBe('Some made-up line of 12 words')
    expect(uniqueNameIn('Nonexistent Unique', ru)).toBe('Nonexistent Unique')
  })
})
