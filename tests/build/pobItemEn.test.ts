import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import { modLineToEn, pobItemText, pobModLines, POB_ITEM_TEXT_MAX } from '@shared/build/pobItemEn'
import { fixtureNames, readFixture, store } from '../poe1/helpers'

// S44: RU-предмет → английский текст для движка PoB (golden на парах RU/EN фикстур S2: один и тот же предмет с
// ru.pathofexile.com и www.pathofexile.com, плюс ручные расширенные Ctrl+C).

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function parse(lang: Poe1Lang, name: string): ParsedItem {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  return res.value
}

/** Пары экипировки (что сравнивает движок). */
const GEAR = fixtureNames('en').filter((n) => /^(armour|weapon|jewellery|unique|rare|adv-(ring|weapon|unique-corrupted))-?/.test(n) && n !== 'rare-jewel')

/** Строки модов EN-фикстуры как в тексте (без роллов «(36-60)» и пометок вида). */
function enFixtureMods(name: string): string[] {
  const text = readFixture('en', name)
  const sections = text.replace(/\r\n?/g, '\n').split('\n--------\n').slice(1)
  const out: string[] = []
  for (const s of sections) {
    for (const raw of s.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (/^\{.*\}$/.test(raw)) continue
      out.push(raw.replace(/(\d)\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/g, '$1').replace(/ \((implicit|crafted|fractured|enchant|scourge)\)$/, ''))
    }
  }
  return out
}

const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/ \((implicit|crafted|fractured|enchant|scourge)\)$/, ''))

describe('RU → EN: пары фикстур (golden)', () => {
  it('пар экипировки достаточно', () => {
    expect(GEAR.length).toBeGreaterThanOrEqual(40)
  })

  it.each(GEAR)('%s: RU даёт те же EN-строки модов, что и EN-текст', (name) => {
    const ru = pobModLines(parse('ru', name), data.ru, data.en)
    const en = pobModLines(parse('en', name), data.en, data.en)
    expect(ru.enchant).toEqual(en.enchant)
    expect(ru.implicit).toEqual(en.implicit)
    expect(ru.explicit).toEqual(en.explicit)
    // что не перевелось в RU — не перевелось бы и из EN (нет в данных APT), а не потерялось при переводе
    expect(ru.untranslated.length).toBe(en.untranslated.length)
  })

  it.each(GEAR)('%s: каждая переведённая строка — дословно строка EN-предмета', (name) => {
    const en = enFixtureMods(name)
    const ru = pobModLines(parse('ru', name), data.ru, data.en)
    for (const line of plain([...ru.enchant, ...ru.implicit, ...ru.explicit])) expect(en).toContain(line)
  })

  it('почти всё переводится: непереведённых строк — единицы на все пары', () => {
    const total = GEAR.reduce((n, name) => n + pobModLines(parse('ru', name), data.ru, data.en).untranslated.length, 0)
    const lines = GEAR.reduce((n, name) => n + enFixtureMods(name).length, 0)
    expect(total / lines).toBeLessThan(0.05)
  })
})

describe('RU → EN: текст для PoB', () => {
  it('редкое кольцо (расширенный Ctrl+C): шапка, требования, уровень, собственное и явные моды', () => {
    const r = pobItemText(parse('ru', 'rare-ring'), data.ru, data.en)
    expect(r).not.toBeNull()
    expect(r!.untranslated).toEqual([])
    expect(r!.text).toBe(
      [
        'Rarity: Rare',
        'POETH Item',
        'Unset Ring',
        '--------',
        'Requirements:',
        'Level: 48',
        '--------',
        'Item Level: 66',
        '--------',
        'Has 1 Socket (implicit)',
        '--------',
        'Adds 3 to 34 Lightning Damage to Attacks',
        '+40 to Evasion Rating',
        '+44 to maximum Mana',
        '11% increased Cast Speed',
        '+36% to Fire Resistance',
        '+35% to Lightning Resistance'
      ].join('\n')
    )
  })

  it('оружие: гнёзда, требования силы, расколотый мод и флаг «Fractured Item»', () => {
    const r = pobItemText(parse('ru', 'adv-weapon'), data.ru, data.en)!
    expect(r.text).toContain('Bladed Mace')
    expect(r.text).toContain('Sockets: R-R-B')
    expect(r.text).toContain('Str: 83')
    expect(r.text).toContain('Adds 5 to 11 Physical Damage (fractured)')
    expect(r.text).toContain('110% increased Physical Damage')
    expect(r.text).toContain('10% reduced Enemy Stun Threshold (implicit)')
    expect(r.text.endsWith('Fractured Item')).toBe(true)
  })

  it('уник: EN-имя и база, описание (flavour) не идёт в моды', () => {
    const r = pobItemText(parse('ru', 'unique-01'), data.ru, data.en)!
    expect(r.text.startsWith('Rarity: Unique\nSidhebreath\nPaua Amulet\n')).toBe(true)
    expect(r.text).toContain('+25% to Cold Resistance')
    expect(r.text).toContain('Minions deal 11% increased Damage')
    expect(r.text).not.toMatch(/[а-яё]/i)
  })

  it('EN-предмет — текст как есть (PoB сам читает Ctrl+C игры)', () => {
    const item = parse('en', 'adv-weapon')
    expect(pobItemText(item, null, null)?.text).toBe(readFixture('en', 'adv-weapon').replace(/\r\n?/g, '\n').trim())
  })

  it('в тексте для PoB нет кириллицы ни у одной пары', () => {
    for (const name of GEAR) {
      const item = parse('ru', name)
      if (item.isUnidentified) continue
      const r = pobItemText(item, data.ru, data.en)
      expect(r, name).not.toBeNull()
      expect(r!.text, name).not.toMatch(/[а-яё]/i)
    }
  })

  it('непереведённая строка не попадает в текст и возвращается списком', () => {
    const item = parse('ru', 'rare-ring')
    const broken = { ...item, rawText: item.rawText.replace('+44(40-44) к максимуму маны', 'Совсем неизвестное свойство 12') }
    const r = pobItemText(broken, data.ru, data.en)!
    expect(r.untranslated).toEqual(['Совсем неизвестное свойство 12'])
    expect(r.text).not.toContain('Mana')
  })

  it('неопознанный предмет и данные чужого языка — null', () => {
    const item = parse('ru', 'rare-ring')
    expect(pobItemText({ ...item, isUnidentified: true }, data.ru, data.en)).toBeNull()
    expect(pobItemText(item, data.en, data.en)).toBeNull()
    expect(pobItemText(item, null, data.en)).toBeNull()
  })

  it('слишком длинный текст — null', () => {
    const item = parse('en', 'rare-ring')
    expect(pobItemText({ ...item, rawText: 'x'.repeat(POB_ITEM_TEXT_MAX + 1) }, null, null)).toBeNull()
  })

  it('строка мода: «снижение» остаётся «reduced», числа по порядку', () => {
    expect(modLineToEn('10% снижение порога оглушения врагов', data.ru, data.en)).toBe('10% reduced Enemy Stun Threshold')
    expect(modLineToEn('Добавляет от 3(2-3) до 34(32-34) урона от молнии к атакам', data.ru, data.en)).toBe('Adds 3 to 34 Lightning Damage to Attacks')
    expect(modLineToEn('нечто непонятное', data.ru, data.en)).toBeNull()
  })
})
