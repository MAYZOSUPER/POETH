import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe2Data, Poe2Lang } from '@shared/poe2/data'
import {
  ItemCategory,
  ItemRarity,
  ModifierType,
  matchStatLine,
  parseClipboard,
  parseItem,
  parseItemText,
  registeredStatRefs,
  summarizeItem,
  type ItemSummary,
  type ParsedItem
} from '@shared/poe2/parser'
import { fixtureNames, readFixture, store } from './helpers'

// Парсер PoE2 (порт Exiled Exchange 2): снапшоты фикстур EN/RU, пары EN/RU одного предмета, особенности PoE2.
// Фикстуры и их источники — tests/fixtures/poe2/README.md.

let data: Record<Poe2Lang, Poe2Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function parse(lang: Poe2Lang, name: string): ParsedItem {
  const res = parseClipboard(readFixture(lang, name), data[lang])
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error} ${res.detail ?? ''}`)
  return res.value
}

const statRefs = (item: ParsedItem, type?: ModifierType) =>
  item.statsByType.filter((s) => type === undefined || s.type === type).map((s) => s.stat.ref)

/**
 * Статы, которых нет в RU stats.ndjson EE2 (локальное похищение): у RU-близнеца строка осталась английской
 * и честно уходит в «не распознан». Тест ниже следит, чтобы исключение убрали, когда данные починят.
 */
const RU_DATA_GAPS = ['Leeches #% of Physical Damage as Life', 'Leeches #% of Physical Damage as Mana']

/**
 * У ~18 статов trade id в EN- и RU-данных EE2 различаются уже в самих данных (в RU нет вариантов «… in Map»,
 * локальные статы слиты с глобальными) — для них сравниваем всё, кроме trade id.
 */
function dataTradeIdsDiffer(ref: string, type: string): boolean {
  const t = type === ModifierType.AddedAugment ? ModifierType.Augment : type
  const ids = (d: Poe2Data) => [...new Set(d.statByRef(ref)?.trade.ids[t] ?? [])].sort().join()
  return ids(data.en) !== ids(data.ru)
}

/** Всё, что не зависит от языка текста: EN-имена, ref, trade id (без дублей — в RU-данных бывают), числа. */
function langIndependent(s: ItemSummary, lang: Poe2Lang) {
  const { lang: _lang, unknown, stats, ...rest } = s
  return {
    ...rest,
    stats: stats
      .filter((st) => !RU_DATA_GAPS.includes(st.ref))
      .map((st) => ({
        ...st,
        tradeIds: dataTradeIdsDiffer(st.ref, st.type) ? ['<различаются в данных EE2>'] : [...new Set(st.tradeIds)]
      })),
    unknown: unknown
      .filter((u) => lang === 'en' || !RU_DATA_GAPS.includes(matchStatLine(u.text, data.en)?.stat.ref ?? ''))
      .map((u) => u.type)
  }
}

const EN = fixtureNames('en')
const RU = fixtureNames('ru')

describe('фикстуры PoE2', () => {
  it('≥20 на язык, у каждой EN есть RU-пара', () => {
    expect(EN.length).toBeGreaterThanOrEqual(20)
    expect(RU.length).toBeGreaterThanOrEqual(20)
    expect(RU).toEqual(EN)
  })

  it('покрыты разные категории и оба формата', () => {
    const items = EN.map((n) => parse('en', n))
    const categories = new Set(items.map((i) => i.category))
    for (const c of [
      ItemCategory.Helmet,
      ItemCategory.BodyArmour,
      ItemCategory.Boots,
      ItemCategory.Shield,
      ItemCategory.Buckler,
      ItemCategory.Focus,
      ItemCategory.Ring,
      ItemCategory.Amulet,
      ItemCategory.Belt,
      ItemCategory.Jewel,
      ItemCategory.Charm,
      ItemCategory.Flask,
      ItemCategory.Bow,
      ItemCategory.Crossbow,
      ItemCategory.Spear,
      ItemCategory.Wand,
      ItemCategory.Sceptre,
      ItemCategory.TwoHandedMace,
      ItemCategory.Quiver,
      ItemCategory.Map,
      ItemCategory.Tablet,
      ItemCategory.Relic,
      ItemCategory.Gem,
      ItemCategory.Currency
    ]) {
      expect(categories.has(c), c).toBe(true)
    }
    const formats = items.map((i) => i.textFormat)
    expect(formats.filter((f) => f === 'advanced').length).toBeGreaterThanOrEqual(5)
    expect(formats.filter((f) => f === 'plain').length).toBeGreaterThanOrEqual(5)
  })

  it('все ref, на которые код ссылается текстом (stat()), есть в данных en и ru', () => {
    const refs = registeredStatRefs()
    expect(refs.length).toBeGreaterThan(10)
    for (const ref of refs) {
      expect(data.en.statByRef(ref)?.ref, `en: ${ref}`).toBe(ref)
      expect(data.ru.statByRef(ref)?.ref, `ru: ${ref}`).toBe(ref)
    }
  })

  it('пробелы RU-данных EE2 (исключения пар EN/RU) всё ещё на месте', () => {
    for (const ref of RU_DATA_GAPS) {
      expect(data.en.statByRef(ref)?.ref).toBe(ref)
      expect(data.ru.statByRef(ref)).toBeUndefined()
    }
  })
})

describe.each(['en', 'ru'] as const)('снапшоты разбора PoE2 (%s)', (lang) => {
  it.each(fixtureNames(lang))('%s', (name) => {
    expect(summarizeItem(parse(lang, name))).toMatchSnapshot()
  })
})

describe('EN/RU-пары одного предмета PoE2', () => {
  it.each(EN)('%s: одинаковые refName, stat ref и trade id', (name) => {
    const en = summarizeItem(parse('en', name))
    const ru = summarizeItem(parse('ru', name))
    expect(en.lang).toBe('en')
    expect(ru.lang).toBe('ru')
    expect(langIndependent(ru, 'ru')).toEqual(langIndependent(en, 'en'))
  })
})

describe.each(['en', 'ru'] as const)('особенности PoE2 (%s)', (lang) => {
  it('руны в гнёздах: три гнезда при норме 2, руны определены по сумме статов', () => {
    const bow = parse(lang, 'ee2-bow-three-runes')
    expect(bow.augmentSockets).toMatchObject({ empty: 0, current: 3, normal: 2 })
    expect(bow.augmentSockets!.augments.map((a) => a?.refName)).toEqual([
      'Perfect Iron Rune',
      'Greater Iron Rune',
      "Countess Seske's Rune of Archery"
    ])
    expect(statRefs(bow, ModifierType.Augment)).toEqual([
      '#% increased Physical Damage',
      'Bow Attacks fire # additional Arrows'
    ])
    expect(bow.newMods.find((m) => m.info.type === ModifierType.Crafted)?.info).toMatchObject({
      generation: 'suffix',
      tier: 3,
      name: 'of Calamity'
    })
  })

  it('пустое гнездо у изменяемого предмета; встроенное умение щита не считается модом', () => {
    const shield = parse(lang, 'ee2-shield-normal')
    expect(shield.augmentSockets).toEqual({ empty: 1, current: 0, normal: 1, augments: [null] })
    expect(shield.statsByType).toEqual([])
    expect(shield.unknownModifiers).toEqual([])
    expect(shield.armourBLOCK).toBe(25)
    expect(shield.note).toBe('~b/o 1 aug')
  })

  it('Spirit скипетра и дарованное умение', () => {
    const sceptre = parse(lang, 'ee2-sceptre-spirit')
    expect(sceptre.weaponSPIRIT).toBe(152)
    const skill = sceptre.statsByType.find((s) => s.type === ModifierType.Skill)
    expect(skill?.stat.ref).toBe('Grants Skill: Level # Purity of Lightning')
    expect(skill?.sources[0].contributes?.value).toBe(17)
    expect(parse(lang, 'sk-sceptre-plain').weaponSPIRIT).toBe(100)
  })

  it('качество и «Superior»: имя базы без префикса', () => {
    const helmet = parse(lang, 'ee2-helmet-normal')
    expect(helmet.info.refName).toBe('Divine Crown')
    expect(helmet.quality).toBe(9)
    expect(helmet.armourAR).toBe(174)
    expect(helmet.armourES).toBe(60)
    expect(parse(lang, 'ee2-charm-quality').quality).toBe(14)
  })

  it('требования: «Requires:» (полный и с одной характеристикой) и старый «Requirements:»', () => {
    expect(parse(lang, 'ee2-helmet-normal').requires).toEqual({ level: 75, str: 67, dex: 0, int: 67 })
    expect(parse(lang, 'ee2-boots-unidentified').requires).toEqual({ level: 0, str: 0, dex: 0, int: 78 })
    expect(parse(lang, 'sk-boots-unique-plain').requires).toEqual({ level: 28, str: 0, dex: 49, int: 0 })
    expect(parse(lang, 'ee2-wand-skill').requires).toEqual({ level: 90, str: 0, dex: 0, int: 125 })
  })

  it('путевой камень: тир из базы, свойства; старый формат «Waystone Tier:»', () => {
    const w = parse(lang, 'ee2-waystone')
    expect(w.category).toBe(ItemCategory.Map)
    expect(w.info.refName).toBe('Waystone (Tier 14)')
    expect(w).toMatchObject({ mapTier: 14, mapRevives: 2, mapPackSize: 34, mapRareMonsters: 28, mapDropChance: 75 })
    const all = parse(lang, 'ee2-waystone-all-props')
    expect(all).toMatchObject({ mapTier: 16, mapMagicMonsters: 30, mapMonsterRarity: 32, mapEffectiveness: 45 })
    expect(all.isCorrupted).toBe(true)
    expect(parse(lang, 'sk-waystone-plain')).toMatchObject({ mapTier: 13, mapItemRarity: 38 })
  })

  it('камни: неогранённые (уровень в имени базы), камень умения, мета-камень без строки класса', () => {
    const uncut = parse(lang, 'ee2-gem-uncut-skill')
    expect(uncut.category).toBe(ItemCategory.Currency)
    expect(uncut.info.refName).toBe('Uncut Skill Gem (Level 19)')
    expect(uncut.info.craftable?.category).toBe(ItemCategory.UncutGem)
    expect(parse(lang, 'sk-gem-uncut-spirit').info.refName).toBe('Uncut Spirit Gem (Level 16)')
    const gem = parse(lang, 'sk-gem-skill')
    expect(gem).toMatchObject({ category: ItemCategory.Gem, gemLevel: 18, quality: 20 })
    expect(gem.info.refName).toBe('Herald of Ice')
    expect(gem.gemSockets?.number).toBe(4)
    const meta = parse(lang, 'ee2-gem-meta')
    expect(meta).toMatchObject({ category: ItemCategory.Gem, gemLevel: 14 })
    expect(meta.info.refName).toBe('Mirage Archer')
  })

  it('пояс: ячейки оберегов — собственный мод', () => {
    const belt = parse(lang, 'ee2-belt-charm-slots')
    const slots = belt.statsByType.find((s) => s.stat.ref === 'Has # Charm Slot')
    expect(slots?.type).toBe(ModifierType.Implicit)
    expect(slots?.sources[0].contributes).toMatchObject({ value: 2, min: 1, max: 3 })
  })

  it('расколотые и очернённые моды (расширенный формат)', () => {
    const amulet = parse(lang, 'ee2-amulet-desecrated')
    expect(amulet.isFractured).toBe(true)
    expect(statRefs(amulet, ModifierType.Fractured)).toEqual(['#% to Cold Resistance'])
    expect(statRefs(amulet, ModifierType.Desecrated)).toEqual(['#% to Fire and Chaos Resistances'])
    expect(statRefs(amulet, ModifierType.Enchant)).toEqual(['Allocates #'])
    const crossbow = parse(lang, 'ee2-crossbow-runes')
    // суффикс строки внутри `{ … }`: «(desecrated)» / «(fractured)»
    expect(statRefs(crossbow, ModifierType.Desecrated)).toEqual(['Adds # to # Physical Damage'])
    expect(statRefs(crossbow, ModifierType.Fractured)).toEqual(['#% increased Attack Speed'])
  })

  it('обычный Ctrl+C: суффиксы (implicit)/(rune)/(enchant)/(desecrated), явные моды без суффикса', () => {
    const boots = parse(lang, 'sk-boots-desecrated-plain')
    expect(boots.textFormat).toBe('plain')
    expect(statRefs(boots, ModifierType.Desecrated)).toEqual(['# to Armour', '# to Evasion Rating'])
    expect(statRefs(boots, ModifierType.Augment)).toEqual(['#% to Fire Resistance'])
    expect(statRefs(boots, ModifierType.Explicit)).toHaveLength(5)
    const unique = parse(lang, 'sk-boots-unique-plain')
    expect(unique.info.refName).toBe('Thunderstep')
    expect(unique.isCorrupted).toBe(true)
    expect(statRefs(unique, ModifierType.Enchant)).toEqual(['#% increased Evasion Rating'])
    const charm = parse(lang, 'sk-charm-plain')
    expect(statRefs(charm, ModifierType.Implicit)).toEqual(['Used when you become Stunned'])
    expect(statRefs(charm, ModifierType.Explicit)).toHaveLength(2)
    // реликвия: явные моды — тип sanctum (как в EE2)
    expect(statRefs(parse(lang, 'sk-relic-plain'), ModifierType.Sanctum)).toHaveLength(2)
  })

  it('расширенный формат: имя, тир, префикс/суффикс, диапазон ролла', () => {
    const mace = parse(lang, 'ee2-mace-magic')
    expect(mace.textFormat).toBe('advanced')
    expect(mace.rarity).toBe(ItemRarity.Magic)
    expect(mace.info.refName).toBe('Temple Maul')
    const prefix = mace.newMods.find((m) => m.info.generation === 'prefix')
    expect(prefix?.info).toMatchObject({ name: 'Crackling', tier: 7 })
    expect(prefix?.info.tags).toHaveLength(4)
    expect(prefix?.stats[0].roll).toMatchObject({ value: 25.5, min: 23.5, max: 35 })
    expect(mace.weaponLIGHTNING).toBe(25.5)
  })

  it('неопознанный предмет: тир неопознанности, только собственный мод', () => {
    const ring = parse(lang, 'ee2-ring-unidentified-tier')
    expect(ring).toMatchObject({ isUnidentified: true, unidentifiedTier: 4 })
    expect(statRefs(ring)).toEqual(['#% to Cold Resistance'])
  })

  it('«You cannot use this item» и колчан', () => {
    const q = parse(lang, 'sk-quiver-cannot-use')
    expect(q.info.refName).toBe('Fire Quiver')
    expect(statRefs(q, ModifierType.Implicit)).toEqual(['Adds # to # Fire damage to Attacks'])
  })
})

describe('нераспознанные моды PoE2', () => {
  it.each([
    ['en', 'sk-boots-desecrated-plain', '+83 to maximum Life', '+5 to Nonexistent Stat of Testing'],
    ['ru', 'sk-boots-desecrated-plain', '+83 к максимуму здоровья', '+5 к несуществующему свойству тестирования']
  ] as const)('%s, обычный формат: строка → «не распознан», остальные моды целы', (lang, name, anchor, line) => {
    const base = parse(lang, name)
    const text = readFixture(lang, name)
    expect(text).toContain(anchor)
    const res = parseClipboard(text.replace(anchor, `${anchor}\n${line}`), data[lang])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.unknownModifiers).toEqual([{ text: line, type: ModifierType.Explicit }])
    expect(summarizeItem(res.value).stats).toEqual(summarizeItem(base).stats)
  })

  it('расширенный формат: неизвестная строка внутри мода (RU)', () => {
    const text = readFixture('ru', 'ee2-ring-implicit').replace(
      '+12(9-12) к силе',
      '+12(9-12) к силе\nНовое свойство патча 0.4: 7'
    )
    const res = parseClipboard(text, data.ru)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.unknownModifiers.map((u) => u.text)).toEqual(['Новое свойство патча 0.4: 7'])
    expect(res.value.statsByType).toHaveLength(parse('ru', 'ee2-ring-implicit').statsByType.length)
  })
})

describe('RU: отличия от EE2', () => {
  it('«Осквернено » с пробелом на конце (как в client_strings) и без — оба осквернены', () => {
    expect(data.ru.strings.CORRUPTED).toBe('Осквернено ')
    const text = readFixture('ru', 'sk-boots-unique-plain')
    expect(text.trimEnd().endsWith('\nОсквернено')).toBe(true)
    const withSpace = parseClipboard(text.replace(/\nОсквернено\n?$/, '\nОсквернено \n'), data.ru)
    expect(withSpace.ok && withSpace.value.isCorrupted).toBe(true)
    expect(parse('ru', 'sk-boots-unique-plain').isCorrupted).toBe(true)
  })

  it('нераспознанная строка «Требуется:» не роняет разбор (EE2 бросал исключение)', () => {
    const text = readFixture('ru', 'ee2-helmet-normal').replace(
      /^Требуется: .*$/m,
      'Требуется: Уровень 75, Неизвестное условие'
    )
    const res = parseClipboard(text, data.ru)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.info.refName).toBe('Divine Crown')
  })
})

describe('ошибки разбора PoE2 не роняют приложение', () => {
  it('другой язык / мусор / неизвестный предмет', () => {
    expect(parseItem('Gegenstandsklasse: Ringe\nSeltenheit: Selten\nX\nRing', data)).toMatchObject({
      ok: false,
      error: 'item.unknown_lang'
    })
    expect(parseClipboard('Gegenstandsklasse: Ringe\nSeltenheit: Selten\nX\nRing', data.en)).toMatchObject({
      ok: false,
      error: 'item.unknown_lang',
      detail: 'Deutsch|English'
    })
    expect(parseItem('', data)).toMatchObject({ ok: false, error: 'item.unknown_lang' })
    expect(parseClipboard('', data.en)).toMatchObject({ ok: false, error: 'item.parse_error' })
    expect(parseClipboard('Item Class: Rings', data.en)).toMatchObject({ ok: false, error: 'item.parse_error' })
    expect(
      parseClipboard('Item Class: Rings\nRarity: Rare\nFoo\nBrand New Ring 0.4\n--------\nItem Level: 1', data.en)
    ).toMatchObject({ ok: false, error: 'item.unknown', detail: 'Brand New Ring 0.4' })
  })

  it('данные другого языка не подставляются', () => {
    expect(parseItem(readFixture('ru', 'ee2-ring-implicit'), data.en)).toMatchObject({
      ok: false,
      error: 'item.unknown_lang'
    })
    expect(parseClipboard(readFixture('ru', 'ee2-ring-implicit'), data.en)).toMatchObject({
      ok: false,
      error: 'item.unknown_lang'
    })
  })

  it('CRLF (буфер обмена Windows) = LF', () => {
    const lf = readFixture('ru', 'ee2-crossbow-all-types')
    const a = parseClipboard(lf, data.ru)
    const b = parseClipboard(lf.replace(/\n/g, '\r\n'), data.ru)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(summarizeItem(b.value)).toEqual(summarizeItem(a.value))
  })

  it('parseItemText сам загружает данные языка', async () => {
    const res = await parseItemText(readFixture('ru', 'ee2-focus-unique'), store)
    expect(res.ok && res.value.info.refName).toBe('The Eternal Spark')
  })
})
