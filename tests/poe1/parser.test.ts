import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import {
  ItemCategory,
  ItemInfluence,
  ItemRarity,
  ModifierMechanic,
  ModifierType,
  parseItem,
  parseItemText,
  summarizeItem,
  type ItemSummary,
  type ParsedItem
} from '@shared/poe1/parser'
import { fixtureNames, readFixture, store } from './helpers'

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function parse(lang: Poe1Lang, name: string): ParsedItem {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error} ${res.detail ?? ''}`)
  return res.value
}

/** Всё, что не зависит от языка текста: EN-имена, ref, trade id, числа. */
function langIndependent(s: ItemSummary) {
  const { lang: _lang, unknown, ...rest } = s
  const timeless = rest.props.timeless as { conquerorText?: string } | undefined
  const props = timeless ? { ...rest.props, timeless: { ...timeless, conquerorText: undefined } } : rest.props
  return { ...rest, props, unknown: unknown.map((u) => u.type) }
}

const EN = fixtureNames('en')
const RU = fixtureNames('ru')

describe('фикстуры', () => {
  it('≥30 на язык, у каждой EN есть RU-пара', () => {
    expect(EN.length).toBeGreaterThanOrEqual(30)
    expect(RU.length).toBeGreaterThanOrEqual(30)
    expect(RU).toEqual(EN)
  })

  it('покрыты разные категории', () => {
    const categories = new Set(EN.map((n) => parse('en', n).category))
    for (const c of [
      ItemCategory.BodyArmour, ItemCategory.Helmet, ItemCategory.Boots, ItemCategory.Ring, ItemCategory.Amulet,
      ItemCategory.Belt, ItemCategory.Jewel, ItemCategory.ClusterJewel, ItemCategory.Map, ItemCategory.Flask,
      ItemCategory.Gem, ItemCategory.DivinationCard, ItemCategory.Currency, ItemCategory.Bow, ItemCategory.Wand
    ]) {
      expect(categories.has(c), c).toBe(true)
    }
  })
})

describe.each(['en', 'ru'] as const)('снапшоты разбора (%s)', (lang) => {
  it.each(fixtureNames(lang))('%s', (name) => {
    expect(summarizeItem(parse(lang, name))).toMatchSnapshot()
  })
})

describe('EN/RU-пары одного предмета', () => {
  it.each(EN)('%s: одинаковые refName, stat ref и trade id', (name) => {
    const en = summarizeItem(parse('en', name))
    const ru = summarizeItem(parse('ru', name))
    expect(en.lang).toBe('en')
    expect(ru.lang).toBe('ru')
    expect(langIndependent(ru)).toEqual(langIndependent(en))
  })
})

describe('нераспознанные моды', () => {
  const inject = (lang: Poe1Lang, name: string, line: string) =>
    readFixture(lang, name).replace(/(\n--------\nFractured Item|\n--------\nРасколотый предмет)/, `\n${line}$1`)

  it.each([
    ['en', '+5 to Nonexistent Stat of Testing'],
    ['ru', '+5 к несуществующему свойству тестирования']
  ] as const)('%s: строка помечается «не распознан», остальные моды целы', (lang, line) => {
    const base = parse(lang, 'weapon-01')
    const res = parseItem(inject(lang, 'weapon-01', line), data)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.unknownModifiers).toEqual([{ text: line, type: ModifierType.Explicit }])
    expect(summarizeItem(res.value).stats).toEqual(summarizeItem(base).stats)
  })

  it('расширенный формат: неизвестная строка внутри мода', () => {
    const text = readFixture('ru', 'adv-ring').replace(
      '+120(100-130) к меткости',
      '+120(100-130) к меткости\nНовое свойство патча 3.30: 7'
    )
    const res = parseItem(text, data)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.unknownModifiers.map((u) => u.text)).toEqual(['Новое свойство патча 3.30: 7'])
    expect(res.value.statsByType).toHaveLength(summarizeItem(parse('ru', 'adv-ring')).stats.length)
  })

  it('legacy-моды Standard без данных в APT — в unknownModifiers обоих языков', () => {
    for (const lang of ['en', 'ru'] as const) {
      const flask = parse(lang, 'flask-07')
      expect(flask.unknownModifiers).toHaveLength(1)
      expect(flask.statsByType.length).toBeGreaterThan(0)
    }
  })
})

describe('ошибки разбора не роняют приложение', () => {
  it('неизвестный язык / мусор / неизвестный предмет', () => {
    expect(parseItem('Gegenstandsklasse: Ringe\nSeltenheit: Selten\nX\nRing', data)).toMatchObject({ ok: false, error: 'item.unknown_lang' })
    expect(parseItem('', data)).toMatchObject({ ok: false, error: 'item.unknown_lang' })
    expect(parseItem('Item Class: Rings', data)).toMatchObject({ ok: false, error: 'item.parse_error' })
    expect(parseItem('Item Class: Rings\nRarity: Rare\nFoo\nBrand New Ring 3.30\n--------\nItem Level: 1', data)).toMatchObject({
      ok: false,
      error: 'item.unknown'
    })
  })

  it('данные другого языка не подставляются', () => {
    expect(parseItem(readFixture('ru', 'armour-05'), data.en)).toMatchObject({ ok: false, error: 'item.unknown_lang' })
  })

  it('CRLF (буфер обмена Windows) = LF', () => {
    const lf = readFixture('ru', 'jewellery-01')
    const a = parseItem(lf, data)
    const b = parseItem(lf.replace(/\n/g, '\r\n'), data)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(summarizeItem(b.value)).toEqual(summarizeItem(a.value))
  })

  it('parseItemText сам загружает данные языка', async () => {
    const res = await parseItemText(readFixture('ru', 'unique-01'), store)
    expect(res.ok && res.value.info.refName).toBe('Sidhebreath')
  })
})

describe.each(['en', 'ru'] as const)('категории и свойства (%s)', (lang) => {
  it('волшебный флакон: имя с аффиксами → база', () => {
    const flask = parse(lang, 'flask-01')
    expect(flask.rarity).toBe(ItemRarity.Magic)
    expect(flask.info.refName).toBe('Sanctified Mana Flask')
    expect(flask.quality).toBe(20)
  })

  it('неопознанный редкий + сокеты', () => {
    const item = parse(lang, 'armour-01')
    expect(item.isUnidentified).toBe(true)
    expect(item.info.refName).toBe('Golden Plate')
    expect(item.armourAR).toBe(559)
    expect(item.sockets).toEqual({ white: 0, linked: undefined })
    expect(item.statsByType).toHaveLength(0)
  })

  it('текст с трейда: собственный мод без суффикса → implicit, влияние', () => {
    const ring = parse(lang, 'jewellery-01')
    expect(ring.textFormat).toBe('plain')
    expect(ring.influences).toEqual([ItemInfluence.Crusader])
    const implicit = ring.statsByType.filter((s) => s.type === ModifierType.Implicit)
    expect(implicit.map((s) => s.stat.ref)).toEqual(['+# to maximum Life'])
    expect(ring.statsByType.filter((s) => s.type === ModifierType.Explicit).length).toBeGreaterThan(3)
  })

  it('расколотый предмет (маркер «Fractured Item»)', () => {
    expect(parse(lang, 'weapon-01').isFractured).toBe(true)
  })

  it('уник: refName и база', () => {
    const u = parse(lang, 'unique-02')
    expect(u.info.refName).toBe('Quill Rain')
    expect(u.uniqueBase?.refName).toBe('Short Bow')
    expect(u.weaponAS).toBe(3)
  })

  it('камень: уровень, без модов', () => {
    const g = parse(lang, 'gem-01')
    expect(g.category).toBe(ItemCategory.Gem)
    expect(g.info.refName).toBe('Shockwave Totem')
    expect(g.gemLevel).toBe(1)
  })

  it('карта: тир, область, заражённая', () => {
    const m = parse(lang, 'map-01')
    expect(m.mapTier).toBe(13)
    expect(m.mapArea?.refName).toBe('Geode')
    expect(m.info.refName).toBe('Blighted Map')
  })

  it('кластер: чары (enchant) с суффиксом', () => {
    const c = parse(lang, 'jewel-01')
    expect(c.category).toBe(ItemCategory.ClusterJewel)
    expect(c.statsByType.filter((s) => s.type === ModifierType.Enchant).map((s) => s.stat.ref)).toEqual([
      'Adds # Passive Skills',
      // у этого стата число — часть шаблона (так в данных APT)
      'Added Small Passive Skills grant: 12% increased Chaos Damage over Time'
    ])
  })

  it('гадальная карта и валюта: размер стопки', () => {
    const card = parse(lang, 'card-01')
    expect(card.category).toBe(ItemCategory.DivinationCard)
    expect(card.info.refName).toBe('The Incantation')
    expect(card.stackSize).toEqual({ value: 4, max: 4 })
    const chaos = parse(lang, 'manual-currency-01')
    expect(chaos.category).toBe(ItemCategory.Currency)
    expect(chaos.info.refName).toBe('Chaos Orb')
    expect(chaos.stackSize).toEqual({ value: 7, max: 20 })
  })

  it('порча (расширенный формат): осквернённый собственный мод', () => {
    const u = parse(lang, 'adv-unique-corrupted')
    expect(u.isCorrupted).toBe(true)
    const implicit = u.newMods.find((m) => m.info.type === ModifierType.Implicit)
    expect(implicit?.info.mechanic).toBe(ModifierMechanic.Corruption)
    expect(implicit?.stats[0].stat.ref).toBe('+# to all Attributes')
  })
})

describe.each(['en', 'ru'] as const)('расширенный формат Ctrl+C (%s)', (lang) => {
  it('тиры, имена, префикс/суффикс, диапазоны роллов', () => {
    const ring = parse(lang, 'adv-ring')
    expect(ring.textFormat).toBe('advanced')
    const life = ring.newMods.find((m) => m.info.tier === 4 && m.info.generation === 'prefix')
    expect(life?.stats[0].stat.ref).toBe('+# to maximum Life')
    expect(life?.stats[0].roll).toMatchObject({ value: 64, min: 60, max: 69 })
    expect(life?.info.tags.length).toBe(1)

    const influence = ring.newMods.find((m) => m.info.mechanic === ModifierMechanic.Crusader)
    expect(influence?.stats[0].stat.ref).toBe('#% increased Lightning Damage')

    const crafted = ring.newMods.find((m) => m.info.type === ModifierType.Crafted)
    expect(crafted?.info.rank).toBe(2)
    expect(crafted?.info.generation).toBe('suffix')
    expect(crafted?.stats[0].stat.ref).toBe('+#% to Cold Resistance')

    // (implicit) у строки стата в расширенном формате не мешает
    expect(ring.statsByType.find((s) => s.type === ModifierType.Implicit)?.stat.ref).toBe('+# to maximum Life')
    expect(ring.unknownModifiers).toEqual([])
  })

  it('расколотый префикс и местный урон оружия', () => {
    const w = parse(lang, 'adv-weapon')
    expect(w.isFractured).toBe(true)
    const fractured = w.newMods.find((m) => m.info.type === ModifierType.Fractured)
    expect(fractured?.stats[0].stat.ref).toBe('Adds # to # Physical Damage')
    expect(fractured?.stats[0].roll).toMatchObject({ value: 8, min: 6.5, max: 8.5 })
    expect(w.weaponPHYSICAL).toBe(54.5)
  })

  it('карта: количество/редкость/моды', () => {
    const m = parse(lang, 'adv-map')
    expect(m.rarity).toBe(ItemRarity.Rare)
    expect(m.mapTier).toBe(16)
    expect(m.areaItemQuantity).toBe(62)
    expect(m.mapMoreMaps).toBe(40)
    expect(m.statsByType.map((s) => s.stat.ref)).toContain('Monsters deal #% extra Physical Damage as Fire')
  })
})

describe.each(['en', 'ru'] as const)('timeless-джуэлы (%s)', (lang) => {
  it('сид и завоеватель', () => {
    const j = parse(lang, 'timeless-01')
    expect(j.info.refName).toBe('Elegant Hubris')
    expect(j.timeless).toMatchObject({
      recognized: true,
      seed: 159200,
      conqueror: 'Cadiro',
      tradeId: 'explicit.pseudo_timeless_jewel_cadiro'
    })
    expect(j.timeless?.familyRefs).toHaveLength(3)
  })

  it('legacy-завоеватель (Venarius) — нет в данных APT: recognized=false, сид из текста', () => {
    const j = parse(lang, 'timeless-02')
    expect(j.info.refName).toBe('Militant Faith')
    expect(j.timeless).toMatchObject({ recognized: false, seed: 2085 })
    expect(j.timeless?.conquerorText).toBe(lang === 'en' ? 'Venarius' : 'Венарием')
    expect(j.unknownModifiers.length).toBe(2)
  })
})
