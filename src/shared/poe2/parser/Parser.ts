// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/Parser.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH:
//  - данные языка (`d: Poe2Data`) передаются параметром вместо глобальных CLIENT_STRINGS / CLIENT_STRINGS_REF /
//    ITEM_BY_* / STAT_BY_* / AUGMENT_DATA_BY_TRADE_ID / CATALYST_* (держим en и ru одновременно, язык текста
//    выбирает вызывающий — см. index.ts); результат без `neverthrow` (свой Result), без performance.mark;
//    `lang`/`textFormat` в ParsedItem; предмет не замораживается (Object.freeze) — как у порта PoE1;
//  - нет данных сайта трейда (TRADE_ITEM_BY_REF / TRADE_STAT_BY_*): незнакомый предмет → `item.unknown`,
//    незнакомая строка мода → `unknownModifiers` (фолбэк по data/stats — на стороне main);
//  - настройки EE2 → `opts` (Poe2ParseOptions): AppConfig().language → `opts.language` (по умолчанию `d.lang`,
//    нужен только для текста ошибки «предмет на другом языке»); AppConfig('price-check').savedAugments + useAugment
//    (автозаполнение пустых гнёзд сохранёнными рунами в applyAugmentSockets) — не перенесено: это item-editor/UI;
//  - обычный Ctrl+C (без строк `{ … }`): явные и собственные (`(implicit)`) моды, а также `(desecrated)` /
//    `(fractured)` / `(crafted)` без строки `{ … }` разбирает parsePlainModifiers (как у PoE1); чары `(enchant)`,
//    руны `(rune)` и «Grants Skill:» EE2 разбирает и в обычном формате;
//  - RU: «Осквернено » в client_strings EE2 с пробелом на конце, а EE2 сравнивает с обрезанной строкой —
//    RU-предмет не помечался осквернённым; сравниваем обе стороны после trim (parseCorrupted);
//  - нераспознанная строка «Requires:» (EE2 бросает исключение «TODO: remove once validated in other langs» —
//    весь разбор падал) — секция поглощается, `requires` не заполняется; старый формат требований («Requirements:»
//    + «Level: N», «Dex: N» по строкам) разбирается (parseLegacyRequirements);
//  - маркер «Fractured Item» / «Расколотый предмет» поглощается и ставит isFractured (EE2 оставлял секцию);
//  - путевые камни: секция свойств узнаётся и по «Waystone Tier:» в любой строке (в EE2 — только «Revives
//    Available:» первой строкой), «Waystone Tier: N» → mapTier;
//  - parseRuneforged (в EE2 пустая заглушка) не перенесена; parseVaalGemName (в EE2 отключена) не перенесена;
//  - регулярки EN (`_$REF.ITEM_SUPERIOR`, `ITEM_EXCEPTIONAL`, `ITEM_SYNTHESISED`, `MAP_BLIGHTED`…) EE2 применяет
//    к тексту первыми, затем строки языка предмета — для RU это безвредно (EN-шаблон не совпадает с RU-именем),
//    поэтому порядок EE2 сохранён;
//  - текст на другом языке → `item.unknown_lang` с detail «язык текста|язык приложения» (у EE2 —
//    `item.wrong_language|…|…`); BOM и все пустые строки в конце текста отбрасываются;
//  - защита от падений там, где EE2 разыменовывает `![0]` / `![1]` (ITEM_BY_REF базы уника, Blighted Map,
//    ITEM_SYNTHESISED); уник с таким именем, но на другой базе → `item.unknown`.

import type { BaseType } from '../data/interfaces'
import type { Poe2Data } from '../data/Poe2Data'
import { ModifierType, type StatCalculated, sumStatsByModType } from './modifiers'
import { linesToStatStrings, tryParseTranslation, getRollOrMinmaxAvg } from './stat-translations'
import { GEM, ItemCategory } from './meta'
import {
  IncursionRoom,
  type ParsedItem,
  ItemInfluence,
  ItemRarity,
  itemIsModifiable,
  type EditorItem
} from './ParsedItem'
import { magicBasetype } from './magic-name'
import {
  parseModType,
  type ModifierInfo,
  type ParsedModifier,
  ENCHANT_LINE,
  SCOURGE_LINE,
  IMPLICIT_LINE,
  AUGMENT_LINE,
  ADDED_AUGMENT_LINE,
  CRAFTED_LINE,
  FRACTURED_LINE,
  DESECRATED_LINE,
  isModInfoLine,
  groupLinesByMod,
  parseModInfoLine
} from './advanced-mod-desc'
import { calcPropPercentile, QUALITY_STATS } from './calc-q20'
import { buildEditorItems } from './augment-builder'
import { avg, combinations } from './utils'
import { ok, err } from '../../poe1/parser/result'

export { removeLinesEnding, parseAffixStrings, replaceHashWithValues } from './utils'

export type ParseErrorCode = 'item.parse_error' | 'item.unknown' | 'item.unknown_lang'
export type ParseResult = { ok: true; value: ParsedItem } | { ok: false; error: ParseErrorCode; detail?: string }
type ParseFailure = { ok: false; error: ParseErrorCode; detail?: string }

/** Настройки EE2, влияющие на разбор (все необязательны, по умолчанию — как в EE2). */
export interface Poe2ParseOptions {
  /**
   * EE2: AppConfig().language — язык, выбранный в приложении. Только для текста ошибки, если текст предмета на
   * другом языке (`detail: '<язык текста>|<язык приложения>'`, у EE2 — `item.wrong_language|…|…`).
   * По умолчанию — язык данных `d.lang`.
   */
  language?: string
}

type SectionParseResult = 'SECTION_PARSED' | 'SECTION_SKIPPED' | 'PARSER_SKIPPED'

type ParserFn = (section: string[], item: ParserState, d: Poe2Data) => SectionParseResult
type VirtualParserFn = (item: ParserState, d: Poe2Data) => ParseFailure | void
/** POETH: парсер, которому нужны все оставшиеся секции сразу; возвращает поглощённые секции. */
type MultiParserFn = (sections: string[][], item: ParserState, d: Poe2Data) => string[][]

const LANGUAGE_DETECTOR = [
  { lang: 'en', displayLang: 'English', itemClassLine: 'Item Class: ', rarityLine: 'Rarity: ' },
  { lang: 'ru', displayLang: 'Русский', itemClassLine: 'Класс предмета: ', rarityLine: 'Редкость: ' },
  { lang: 'fr', displayLang: 'Français', itemClassLine: "Classe d'objet: ", rarityLine: 'Rareté: ' },
  { lang: 'de', displayLang: 'Deutsch', itemClassLine: 'Gegenstandsklasse: ', rarityLine: 'Seltenheit: ' },
  { lang: 'pt', displayLang: 'Português (Brasil)', itemClassLine: 'Classe do Item: ', rarityLine: 'Raridade: ' },
  { lang: 'es', displayLang: 'Español', itemClassLine: 'Clase de objeto: ', rarityLine: 'Rareza: ' },
  { lang: 'th', displayLang: 'ไทย', itemClassLine: 'ชนิดไอเทม: ', rarityLine: 'Rarity: ' },
  { lang: 'ko', displayLang: '한국어', itemClassLine: '아이템 종류: ', rarityLine: '아이템 희귀도: ' },
  { lang: 'cmn-Hant', displayLang: '正體中文', itemClassLine: '物品種類: ', rarityLine: '稀有度: ' },
  { lang: 'cmn-Hans', displayLang: '普通话', itemClassLine: '物品类别: ', rarityLine: 'Rarity: ' },
  { lang: 'ja', displayLang: '日本語', itemClassLine: 'アイテムクラス: ', rarityLine: 'レアリティ: ' }
]

export interface ParserState extends ParsedItem {
  name: string
  baseType: string | undefined
  infoVariants: BaseType[]
}

const parsers: Array<ParserFn | { virtual: VirtualParserFn } | { multi: MultiParserFn }> = [
  parseUnidentified,
  { virtual: parseSuperior },
  { virtual: parseExceptional },
  parseSynthesised,
  parseCategoryByHelpText,
  { virtual: normalizeName },
  { virtual: findInDatabase },
  // -----------
  parseItemLevel,
  parseRequirements,
  parseLegacyRequirements, // POETH
  parseTalismanTier,
  parseGem,
  parseArmour,
  parseWeapon,
  parseCaster,
  parseFlask,
  parseJewelery,
  parseCharmSlots,
  parseSpirit,
  parsePriceNote,
  parseTimelostRadius,
  parseStackSize,
  parseCorrupted,
  parseFoil,
  parseInfluence,
  parseMap,
  parseWaystone,
  parseSockets,
  parseAugmentSockets,
  parseHeistBlueprint,
  parseTrials,
  parseAreaLevel,
  parseAtzoatlRooms,
  parseMirroredTablet,
  parseFilledCoffin,
  parseMirrored,
  parseSanctified,
  parseFracturedMarker, // POETH
  parseSentinelCharge,
  parseLogbookArea,
  parseLogbookArea,
  parseLogbookArea,
  parseModifiers, // enchant
  parseModifiers, // augment
  parseModifiers, // implicit
  parseModifiers, // grant skill
  parseModifiers, // explicit
  { multi: parsePlainModifiers }, // POETH: обычный Ctrl+C
  { virtual: transformToLegacyModifiers },
  { virtual: parseFractured },
  { virtual: parseBlightedMap },
  { virtual: applyAugmentSockets },
  { virtual: applyElementalAdded },
  { virtual: pickCorrectVariant },
  { virtual: calcBasePercentile }
]

/** Разбор текста предмета PoE2 на известном языке данных `d` (язык текста должен совпадать с `d.lang`). */
export function parseClipboard(clipboard: string, d: Poe2Data, opts: Poe2ParseOptions = {}): ParseResult {
  const _$ = d.strings
  try {
    let sections = itemTextToSections(clipboard)
    if (!sections.length) return err('item.parse_error')

    if (sections[0][2] === _$.CANNOT_USE_ITEM) {
      sections[0].pop() // remove CANNOT_USE_ITEM line
      sections[1].unshift(...sections[0]) // prepend item class & rarity into second section
      sections.shift() // remove first section where CANNOT_USE_ITEM line was
    }
    const parsed = parseNamePlate(sections[0], d, opts)
    if (!parsed.ok) return parsed

    sections.shift()
    const item = parsed.value
    item.rawText = clipboard
    item.textFormat = sections.some((section) => section.some(isModInfoLine)) ? 'advanced' : 'plain'

    // each section can be parsed at most by one parser
    // and each parser can only be used to parse one section
    for (const parser of parsers) {
      if ('virtual' in parser) {
        const error = parser.virtual(item, d)
        if (error) return error
        continue
      }
      if ('multi' in parser) {
        const consumed = parser.multi(sections, item, d)
        if (consumed.length) sections = sections.filter((s) => !consumed.includes(s))
        continue
      }
      for (const section of sections) {
        const result = parser(section, item, d)
        if (result === 'SECTION_PARSED') {
          sections = sections.filter((s) => s !== section)
          break
        } else if (result === 'PARSER_SKIPPED') {
          break
        }
      }
    }
    return ok(item as ParsedItem)
  } catch (e) {
    return { ok: false, error: 'item.parse_error', detail: e instanceof Error ? e.message : String(e) }
  }
}

function itemTextToSections(text: string) {
  // POETH: BOM и все пустые строки в конце (EE2 убирает одну)
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop()
  }

  const sections: string[][] = [[]]
  lines.reduce((section, line) => {
    if (line !== '--------') {
      section.push(line)
      return section
    } else {
      const section: string[] = []
      sections.push(section)
      return section
    }
  }, sections[0])
  return sections.filter((section) => section.length)
}

function normalizeName(item: ParserState, d: Poe2Data) {
  const _$ = d.strings
  const _$REF = d.refStrings
  if (item.rarity === ItemRarity.Magic) {
    const baseType = magicBasetype(item.name, d)
    if (baseType) {
      item.name = baseType
    }
  }

  if (item.rarity === ItemRarity.Normal || item.rarity === ItemRarity.Rare) {
    if (item.baseType) {
      if (_$REF.MAP_BLIGHTED.test(item.baseType)) {
        item.baseType = _$REF.MAP_BLIGHTED.exec(item.baseType)![1]
      } else if (_$REF.MAP_BLIGHT_RAVAGED.test(item.baseType)) {
        item.baseType = _$REF.MAP_BLIGHT_RAVAGED.exec(item.baseType)![1]
      } else if (_$.MAP_BLIGHTED.test(item.baseType)) {
        item.baseType = _$.MAP_BLIGHTED.exec(item.baseType)![1]
      } else if (_$.MAP_BLIGHT_RAVAGED.test(item.baseType)) {
        item.baseType = _$.MAP_BLIGHT_RAVAGED.exec(item.baseType)![1]
      }
    } else {
      if (_$REF.MAP_BLIGHTED.test(item.name)) {
        item.name = _$REF.MAP_BLIGHTED.exec(item.name)![1]
      } else if (_$REF.MAP_BLIGHT_RAVAGED.test(item.name)) {
        item.name = _$REF.MAP_BLIGHT_RAVAGED.exec(item.name)![1]
      } else if (_$.MAP_BLIGHTED.test(item.name)) {
        item.name = _$.MAP_BLIGHTED.exec(item.name)![1]
      } else if (_$.MAP_BLIGHT_RAVAGED.test(item.name)) {
        item.name = _$.MAP_BLIGHT_RAVAGED.exec(item.name)![1]
      }
    }
  }

  if (item.category === ItemCategory.MetamorphSample) {
    if (_$.METAMORPH_BRAIN.test(item.name)) {
      item.name = 'Metamorph Brain'
    } else if (_$.METAMORPH_EYE.test(item.name)) {
      item.name = 'Metamorph Eye'
    } else if (_$.METAMORPH_LUNG.test(item.name)) {
      item.name = 'Metamorph Lung'
    } else if (_$.METAMORPH_HEART.test(item.name)) {
      item.name = 'Metamorph Heart'
    } else if (_$.METAMORPH_LIVER.test(item.name)) {
      item.name = 'Metamorph Liver'
    }
  }
}

function lookupItem(item: ParserState, d: Poe2Data, find: Poe2Data['itemByRef']): BaseType[] | undefined {
  if (item.category === ItemCategory.DivinationCard) {
    return find.call(d, 'DIVINATION_CARD', item.name)
  } else if (item.category === ItemCategory.CapturedBeast) {
    return find.call(d, 'CAPTURED_BEAST', item.baseType ?? item.name)
  } else if (item.category && GEM.has(item.category)) {
    return find.call(d, 'GEM', item.name)
  } else if (item.category === ItemCategory.MetamorphSample) {
    return find.call(d, 'ITEM', item.name)
  } else if (item.category === ItemCategory.Voidstone) {
    return find.call(d, 'ITEM', 'Charged Compass')
  } else if (item.rarity === ItemRarity.Unique && !item.isUnidentified) {
    return find.call(d, 'UNIQUE', item.name)
  } else {
    return find.call(d, 'ITEM', item.baseType ?? item.name)
  }
}

function findInDatabase(item: ParserState, d: Poe2Data): ParseFailure | void {
  let info = lookupItem(item, d, d.itemByRef)
  if (!info?.length) {
    // BUG[UPSTREAM]: https://www.pathofexile.com/forum/view-thread/3913283
    info = lookupItem(item, d, d.itemByTranslated)
  }
  if (!info?.length) {
    // EE2: здесь поиск по данным сайта трейда (TRADE_ITEM_BY_REF) — у нас их нет
    return { ok: false, error: 'item.unknown', detail: item.baseType ?? item.name }
  }

  if (info[0].unique) {
    const uniqueInfo = info.filter((info) => info.unique!.base === item.baseType)
    if (uniqueInfo?.length) {
      info = uniqueInfo
    } else if (item.baseType) {
      const baseInfo = d.itemByTranslated('ITEM', item.baseType)
      if (baseInfo?.length) {
        info = info.filter((info) => info.unique!.base === baseInfo[0].refName)
      }
    }
    // POETH: уник с этим именем есть, но не на этой базе — EE2 падал дальше на info[0]
    if (!info.length) return { ok: false, error: 'item.unknown', detail: `${item.name} / ${item.baseType}` }
  }
  item.infoVariants = info
  // choose 1st variant, correct one will be picked at the end of parsing
  item.info = info[0]
  // same for every variant
  if (!item.category || item.info.craftable?.category === ItemCategory.Wombgift) {
    if (item.info.craftable) {
      item.category = item.info.craftable.category
    } else if (item.info.unique) {
      item.category = d.itemByRef('ITEM', item.info.unique.base)?.[0].craftable?.category
    }
  }
}

function parseMap(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (section[0].startsWith(_$.MAP_TIER)) {
    item.mapTier = Number(section[0].slice(_$.MAP_TIER.length))
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseWaystone(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings

  // POETH: в старом формате первая строка — «Waystone Tier: N», а не «Revives Available:»
  const isWaystoneSection =
    section[0].startsWith(_$.WAYSTONE_REVIVES) ||
    section.some((line) => line.startsWith(_$.WAYSTONE_TIER) || line.startsWith(_$.WAYSTONE_REVIVES))
  if (isWaystoneSection && item.info.map?.tier) {
    // we are a map now
    item.mapTier = item.info.map.tier

    for (const line of section) {
      if (line.startsWith(_$.WAYSTONE_TIER)) {
        item.mapTier = parseInt(line.slice(_$.WAYSTONE_TIER.length), 10) || item.mapTier
        continue
      }

      if (line.startsWith(_$.WAYSTONE_REVIVES)) {
        item.mapRevives = parseInt(line.slice(_$.WAYSTONE_REVIVES.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_PACK_SIZE)) {
        item.mapPackSize = parseInt(line.slice(_$.WAYSTONE_PACK_SIZE.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_MAGIC_MONSTERS)) {
        item.mapMagicMonsters = parseInt(line.slice(_$.WAYSTONE_MAGIC_MONSTERS.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_RARE_MONSTERS)) {
        item.mapRareMonsters = parseInt(line.slice(_$.WAYSTONE_RARE_MONSTERS.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_DROP_CHANCE)) {
        item.mapDropChance = parseInt(line.slice(_$.WAYSTONE_DROP_CHANCE.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_RARITY)) {
        item.mapItemRarity = parseInt(line.slice(_$.WAYSTONE_RARITY.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_MONSTER_RARITY)) {
        item.mapMonsterRarity = parseInt(line.slice(_$.WAYSTONE_MONSTER_RARITY.length), 10)
        continue
      }

      if (line.startsWith(_$.WAYSTONE_EFFECTIVENESS)) {
        item.mapEffectiveness = parseInt(line.slice(_$.WAYSTONE_EFFECTIVENESS.length), 10)
        continue
      }
    }

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseBlightedMap(item: ParsedItem, d: Poe2Data) {
  if (item.category !== ItemCategory.Map) return

  const calc = item.statsByType.find(
    (calc) => calc.type === ModifierType.Implicit && calc.stat.ref.startsWith('Area is infested with Fungal Growths')
  )
  if (calc !== undefined) {
    if (calc.sources[0].contributes!.value === 9) {
      item.mapBlighted = 'Blight-ravaged'
      const icon = d.itemByRef('ITEM', 'Blight-ravaged Map')?.[0].icon
      if (icon) item.info.icon = icon
    } else {
      item.mapBlighted = 'Blighted'
      const icon = d.itemByRef('ITEM', 'Blighted Map')?.[0].icon
      if (icon) item.info.icon = icon
    }
  }
}

function parseFractured(item: ParserState) {
  if (item.newMods.some((mod) => mod.info.type === ModifierType.Fractured)) {
    item.isFractured = true
  }
}

function pickCorrectVariant(item: ParserState) {
  if (!item.info.disc) return

  for (const variant of item.infoVariants) {
    const cond = variant.disc!

    if (cond.propAR && !item.armourAR) continue
    if (cond.propEV && !item.armourEV) continue
    if (cond.propES && !item.armourES) continue

    if (cond.mapTier === 'W' && !(item.mapTier! <= 5)) continue
    if (cond.mapTier === 'Y' && !(item.mapTier! >= 6 && item.mapTier! <= 10)) continue
    if (cond.mapTier === 'R' && !(item.mapTier! >= 11)) continue

    if (
      cond.hasImplicit &&
      !item.statsByType.some((calc) => calc.type === ModifierType.Implicit && calc.stat.ref === cond.hasImplicit!.ref)
    )
      continue

    if (
      cond.hasExplicit &&
      !item.statsByType.some((calc) => calc.type === ModifierType.Explicit && calc.stat.ref === cond.hasExplicit!.ref)
    )
      continue

    if (cond.sectionText && !item.rawText.includes(cond.sectionText)) continue

    item.info = variant
  }

  // it may happen that we don't find correct variant
  // i.e. corrupted implicit on Two-Stone Ring
}

function parseNamePlate(
  section: string[],
  d: Poe2Data,
  opts: Poe2ParseOptions
): { ok: true; value: ParserState } | ParseFailure {
  const _$ = d.strings
  let line = section.shift()

  let missingItemClass = false

  if (!line?.startsWith(_$.ITEM_CLASS)) {
    // HACK: Meta skill gems
    if (line && section.unshift(line) && isItemMissingItemClass(section, d)) {
      missingItemClass = true
    } else {
      // figure out if this was an issue with wrong language, or a bug
      const langFound = LANGUAGE_DETECTOR.find(({ rarityLine }) => section[1]?.startsWith(rarityLine))
      if (langFound) {
        const appLang = opts.language ?? d.lang
        const appDisplay = LANGUAGE_DETECTOR.find(({ lang }) => lang === appLang)?.displayLang ?? appLang
        return { ok: false, error: 'item.unknown_lang', detail: `${langFound.displayLang}|${appDisplay}` }
      }

      return err('item.parse_error')
    }
  }

  line = section.shift()
  let rarityText: string | undefined
  if (line?.startsWith(_$.RARITY)) {
    rarityText = line.slice(_$.RARITY.length)
    line = section.shift()
  }

  let name: string
  if (line != null) {
    name = markupConditionParser(line)
  } else {
    return err('item.parse_error')
  }

  line = section.shift()
  const baseType = line && markupConditionParser(line)

  const item: ParserState = {
    lang: d.lang,
    textFormat: 'plain',
    rarity: undefined,
    category: undefined,
    name,
    baseType,
    isUnidentified: false,
    isCorrupted: false,
    newMods: [],
    statsByType: [],
    unknownModifiers: [],
    influences: [],
    info: undefined!,
    infoVariants: undefined!,
    rawText: undefined!
  }

  switch (rarityText) {
    case _$.RARITY_CURRENCY:
      item.category = ItemCategory.Currency
      break
    case _$.RARITY_DIVCARD:
      item.category = ItemCategory.DivinationCard
      break
    case _$.RARITY_GEM:
      item.category = ItemCategory.Gem
      break
    case _$.RARITY_NORMAL:
    case _$.RARITY_QUEST:
      item.rarity = ItemRarity.Normal
      break
    case _$.RARITY_MAGIC:
      item.rarity = ItemRarity.Magic
      break
    case _$.RARITY_RARE:
      item.rarity = ItemRarity.Rare
      break
    case _$.RARITY_UNIQUE:
      item.rarity = ItemRarity.Unique
      break
  }

  if (missingItemClass) {
    item.category = ItemCategory.Gem
  }

  return ok(item)
}

function parseInfluence(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (section.length <= 2) {
    const countBefore = item.influences.length

    for (const line of section) {
      switch (line) {
        case _$.INFLUENCE_CRUSADER:
          item.influences.push(ItemInfluence.Crusader)
          break
        case _$.INFLUENCE_ELDER:
          item.influences.push(ItemInfluence.Elder)
          break
        case _$.INFLUENCE_SHAPER:
          item.influences.push(ItemInfluence.Shaper)
          break
        case _$.INFLUENCE_HUNTER:
          item.influences.push(ItemInfluence.Hunter)
          break
        case _$.INFLUENCE_REDEEMER:
          item.influences.push(ItemInfluence.Redeemer)
          break
        case _$.INFLUENCE_WARLORD:
          item.influences.push(ItemInfluence.Warlord)
          break
      }
    }

    if (countBefore < item.influences.length) {
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

// #region Small Sections
function parseCorrupted(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  // POETH: в RU client_strings «Осквернено » с пробелом на конце — сравниваем обе стороны после trim
  const first = section[0].trim()
  if (first === _$.CORRUPTED.trim() || first === _$.DOUBLE_CORRUPTED.trim()) {
    item.isCorrupted = true
    return 'SECTION_PARSED'
  } else if (section[0] === _$.UNMODIFIABLE) {
    item.isCorrupted = true
    item.isUnmodifiable = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseFoil(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (item.rarity !== ItemRarity.Unique) {
    return 'PARSER_SKIPPED'
  }
  if (section[0] === d.strings.FOIL_UNIQUE) {
    item.isFoil = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseUnidentified(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const match = section[0].match(d.strings.UNIDENTIFIED)
  if (match) {
    item.isUnidentified = true
    if (match.groups?.tier) {
      item.unidentifiedTier = Number(match.groups.tier)
    }
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseItemLevel(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  let prefix = _$.ITEM_LEVEL
  if (item.info.refName === 'Filled Coffin') {
    prefix = _$.CORPSE_LEVEL
  }

  for (const line of section) {
    if (line.startsWith(prefix)) {
      item.itemLevel = Number(line.slice(prefix.length))
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseRequirements(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (!section[0].startsWith(_$.REQUIRES)) {
    return 'SECTION_SKIPPED'
  }

  if (item.category && GEM.has(item.category)) {
    return 'SECTION_SKIPPED'
  }

  const match = section[0].match(_$.REQUIRES_LINE)
  // EE2: `throw new Error("Failed to parse requirements")` («TODO: remove once validated in other langs»).
  // POETH: не роняем весь разбор — секцию поглощаем, requires не заполняем.
  if (!match) {
    return 'SECTION_PARSED'
  }

  item.requires = {
    level: parseInt(match.groups!.level ?? '0'),
    str: parseInt(match.groups!.str ?? '0'),
    dex: parseInt(match.groups!.dex ?? '0'),
    int: parseInt(match.groups!.int ?? '0')
  }

  return 'SECTION_PARSED'
}

// POETH: имена характеристик старого формата «Requirements:» (те же, что в REQUIRES_LINE client_strings EE2)
const LEGACY_REQ_ATTRS: Record<string, { str: RegExp; dex: RegExp; int: RegExp }> = {
  en: { str: /^(?:Strength|Str)$/, dex: /^(?:Dexterity|Dex)$/, int: /^(?:Intelligence|Int)$/ },
  ru: { str: /^(?:Сила)$/, dex: /^(?:Ловкость|Ловк)$/, int: /^(?:Интеллект|Инт)$/ }
}

/** POETH: старый формат требований: «Requirements:», затем «Level: 60», «Dex: 125 (augmented)» по строкам. */
function parseLegacyRequirements(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (section[0].trim() !== `${_$.REQUIREMENTS}:`) return 'SECTION_SKIPPED'
  if (item.category && GEM.has(item.category)) return 'SECTION_SKIPPED'

  const attrs = LEGACY_REQ_ATTRS[d.lang]
  const requires = { level: 0, str: 0, dex: 0, int: 0 }
  for (const line of section.slice(1)) {
    const m = /^([^:]+):\s*(\d+)/.exec(line)
    if (!m) continue
    const key = m[1].trim()
    const value = parseInt(m[2], 10)
    if (`${key}: ` === _$.GEM_LEVEL) requires.level = value
    else if (attrs?.str.test(key)) requires.str = value
    else if (attrs?.dex.test(key)) requires.dex = value
    else if (attrs?.int.test(key)) requires.int = value
  }
  item.requires = requires
  return 'SECTION_PARSED'
}

function parseTalismanTier(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (section[0].startsWith(_$.TALISMAN_TIER)) {
    item.talismanTier = Number(section[0].slice(_$.TALISMAN_TIER.length))
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseGem(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (
    item.category !== ItemCategory.Gem &&
    item.category !== ItemCategory.MetaGem &&
    item.category !== ItemCategory.UncutGem
  ) {
    return 'PARSER_SKIPPED'
  }

  const gemLevelLineNumber = item.category === ItemCategory.Gem || item.category === ItemCategory.MetaGem ? 1 : 0

  if (section[gemLevelLineNumber]?.startsWith(_$.GEM_LEVEL)) {
    // "Level: 20 (Max)"
    item.gemLevel = parseInt(section[gemLevelLineNumber].slice(_$.GEM_LEVEL.length), 10)

    parseQualityNested(section, item, d)

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}
// #endregion

function parseStackSize(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (
    item.rarity !== ItemRarity.Normal &&
    item.category !== ItemCategory.Currency &&
    item.category !== ItemCategory.DivinationCard &&
    item.category !== ItemCategory.MapFragment
  ) {
    return 'PARSER_SKIPPED'
  }
  if (section[0].startsWith(_$.STACK_SIZE)) {
    // Portal Scroll "Stack Size: 2[localized separator]448/40"
    const [value, max] = section[0]
      .slice(_$.STACK_SIZE.length)
      .replace(/[^\d/]/g, '')
      .split('/')
      .map(Number)
    if (item.info.refName !== 'Idol of Estazunti') {
      item.stackSize = { value, max }
    }

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseAugmentSockets(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  const categoryMax = getMaxSockets(item)

  if (!categoryMax) return 'PARSER_SKIPPED'

  if (section[0].startsWith(_$.SOCKETS)) {
    const sockets = section[0].slice(_$.SOCKETS.length).trimEnd()
    const current = sockets.split('S').length - 1
    if (!itemIsModifiable(item)) {
      item.augmentSockets = {
        empty: 0,
        current,
        normal: categoryMax,
        augments: Array(current).fill(null)
      }
    } else {
      item.augmentSockets = {
        empty: 0,
        current,
        normal: categoryMax,
        augments: Array(categoryMax > current ? categoryMax : current).fill(null)
      }
    }

    return 'SECTION_PARSED'
  }
  // don't have any....possibly "yet"....
  if (categoryMax && itemIsModifiable(item)) {
    item.augmentSockets = {
      empty: categoryMax,
      current: 0,
      normal: categoryMax,
      augments: Array(categoryMax).fill(null)
    }
  }
  return 'SECTION_SKIPPED'
}

function parseSockets(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (item.category && GEM.has(item.category) && section[0].startsWith(_$.SOCKETS)) {
    let sockets = section[0].slice(_$.SOCKETS.length).trimEnd()
    sockets = sockets.replace(/[^ -]/g, '#')

    item.gemSockets = {
      number: sockets.split('#').length - 1,
      white: sockets.split('W').length - 1,
      linked: undefined
    }

    if (sockets === '#-#-#-#-#-#') {
      item.gemSockets.linked = 6
    } else if (sockets === '# #-#-#-#-#' || sockets === '#-#-#-#-# #' || sockets === '#-#-#-#-#') {
      item.gemSockets.linked = 5
    }
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

// EE2: CATALYST_TYPES (базы с тегами catalyst / jewel_catalyst) + CATALYST_TO_TAG (тег качества → строки клиента)
const catalystCache = new WeakMap<Poe2Data, { Normal: BaseType[]; Refined: BaseType[] }>()
function catalystTypes(d: Poe2Data): { Normal: BaseType[]; Refined: BaseType[] } {
  let types = catalystCache.get(d)
  if (!types) {
    types = {
      Normal: Array.from(d.itemsIterator('"tags": ["catalyst"')),
      Refined: Array.from(d.itemsIterator('"tags": ["jewel_catalyst"'))
    }
    catalystCache.set(d, types)
  }
  return types
}

function catalystTags(d: Poe2Data): Record<string, string[]> {
  const _$ = d.strings
  return {
    life_catalyst: [_$.LIFE_TAG],
    mana_catalyst: [_$.MANA_TAG],
    defences_catalyst: [_$.ARMOUR_TAG, _$.EVASION_TAG, _$.ENERGY_SHIELD_TAG],
    physical_catalyst: [_$.PHYSICAL_TAG],
    fire_catalyst: [_$.FIRE_TAG],
    cold_catalyst: [_$.COLD_TAG],
    lightning_catalyst: [_$.LIGHTNING_TAG],
    chaos_catalyst: [_$.CHAOS_TAG],
    attack_catalyst: [_$.ATTACK_TAG],
    caster_catalyst: [_$.CASTER_TAG],
    speed_catalyst: [_$.SPEED_TAG],
    attribute_catalyst: [_$.ATTRIBUTE_TAG],
    minion_catalyst: [_$.MINION_TAG]
  }
}

function parseQualityNested(section: string[], item: ParsedItem, d: Poe2Data) {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.QUALITY)) {
      // "Quality: +20% (augmented)"
      item.quality = parseInt(line.slice(_$.QUALITY.length), 10)

      if (
        item.category === ItemCategory.Ring ||
        item.category === ItemCategory.Amulet ||
        item.category === ItemCategory.Jewel
      ) {
        const catalysts = catalystTypes(d)[item.category === ItemCategory.Jewel ? 'Refined' : 'Normal']
        const toTag = catalystTags(d)
        for (const catalyst of catalysts) {
          for (const tag of toTag[catalyst.tags[1]] ?? []) {
            if (line.includes(tag)) {
              item.qualityType = catalyst.tags[1]
              return
            }
          }
        }
      }
      return
    }
  }
}

function parseArmour(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.startsWith(_$.ARMOUR)) {
      item.armourAR = parseInt(line.slice(_$.ARMOUR.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.EVASION)) {
      item.armourEV = parseInt(line.slice(_$.EVASION.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.ENERGY_SHIELD)) {
      item.armourES = parseInt(line.slice(_$.ENERGY_SHIELD.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.BLOCK_CHANCE)) {
      item.armourBLOCK = parseInt(line.slice(_$.BLOCK_CHANCE.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }

    if (line.startsWith(_$.RUNIC_WARD)) {
      item.armourRW = parseInt(line.slice(_$.RUNIC_WARD.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
  }

  if (isParsed === 'SECTION_PARSED') {
    parseQualityNested(section, item, d)
  }
  if (item.rarity === ItemRarity.Unique) {
    // undo everything
    item.armourAR = undefined
    item.armourEV = undefined
    item.armourES = undefined
    item.armourRW = undefined // ? maybe not ?
    item.armourBLOCK = undefined
  }

  return isParsed
}

function sumDamageRanges(text: string, hyphen: string): number {
  return text
    .split(', ')
    .map((element) => getRollOrMinmaxAvg(element.split(hyphen).map((str) => parseInt(str.replace(/[^\d]/g, ''), 10))))
    .reduce((sum, x) => sum + x, 0)
}

function parseWeapon(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.startsWith(_$.CRIT_CHANCE)) {
      // No regex since it can have decimals
      item.weaponCRIT = parseFloat(line.slice(_$.CRIT_CHANCE.length))
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.ATTACK_SPEED)) {
      // No regex since it can have decimals
      item.weaponAS = parseFloat(line.slice(_$.ATTACK_SPEED.length))
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.PHYSICAL_DAMAGE)) {
      item.weaponPHYSICAL = getRollOrMinmaxAvg(
        line
          .slice(_$.PHYSICAL_DAMAGE.length)
          .split(_$.HYPHEN)
          .map((str) => parseInt(str.replace(/[^\d]/g, ''), 10))
      )
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.ELEMENTAL_DAMAGE)) {
      item.weaponELEMENTAL = sumDamageRanges(line.slice(_$.ELEMENTAL_DAMAGE.length), _$.HYPHEN)
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.FIRE_DAMAGE)) {
      const fireDamage = sumDamageRanges(line.slice(_$.FIRE_DAMAGE.length), _$.HYPHEN)
      item.weaponELEMENTAL = item.weaponELEMENTAL ? fireDamage + item.weaponELEMENTAL : fireDamage
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.COLD_DAMAGE)) {
      const coldDamage = sumDamageRanges(line.slice(_$.COLD_DAMAGE.length), _$.HYPHEN)
      item.weaponELEMENTAL = item.weaponELEMENTAL ? coldDamage + item.weaponELEMENTAL : coldDamage
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.LIGHTNING_DAMAGE)) {
      const lightningDamage = sumDamageRanges(line.slice(_$.LIGHTNING_DAMAGE.length), _$.HYPHEN)
      item.weaponELEMENTAL = item.weaponELEMENTAL ? lightningDamage + item.weaponELEMENTAL : lightningDamage
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.RELOAD_SPEED)) {
      // No regex since it can have decimals
      item.weaponRELOAD = parseFloat(line.slice(_$.RELOAD_SPEED.length))
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.BASE_SPIRIT)) {
      item.weaponSPIRIT = parseInt(line.slice(_$.BASE_SPIRIT.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
  }

  if (isParsed === 'SECTION_PARSED') {
    parseQualityNested(section, item, d)
  }

  if (item.rarity === ItemRarity.Unique) {
    // undo everything
    item.weaponELEMENTAL = undefined
    item.weaponAS = undefined
    item.weaponPHYSICAL = undefined
    item.weaponCOLD = undefined
    item.weaponLIGHTNING = undefined
    item.weaponFIRE = undefined
    item.weaponCRIT = undefined
    item.weaponRELOAD = undefined
    item.weaponSPIRIT = undefined
  }

  return isParsed
}

function parseCaster(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (
    item.category !== ItemCategory.Wand &&
    item.category !== ItemCategory.Sceptre &&
    item.category !== ItemCategory.Staff
  )
    return 'PARSER_SKIPPED'

  if (section.length === 1 && section[0].startsWith(d.strings.QUALITY)) {
    parseQualityNested(section, item, d)
    return 'SECTION_PARSED'
  }

  return 'SECTION_SKIPPED'
}

function parseLogbookArea(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (item.info.refName !== 'Expedition Logbook') return 'PARSER_SKIPPED'
  if (section.length < 3) return 'SECTION_SKIPPED'

  // skip Area, parse Faction
  const faction = d.statByMatchStr(section[1])
  if (!faction) return 'SECTION_SKIPPED'

  const areaMods: ParsedModifier[] = [
    {
      info: { tags: [], type: ModifierType.Pseudo },
      stats: [
        {
          stat: faction.stat,
          translation: faction.matcher
        }
      ]
    }
  ]

  const { modType, lines } = parseModType(section.slice(2), d.strings)
  for (const line of lines) {
    const found = tryParseTranslation({ string: line, unscalable: false }, modType, undefined, d)
    if (found) {
      areaMods.push({
        info: { tags: [], type: modType },
        stats: [found]
      })
    }
  }

  areaMods.shift()
  if (areaMods.length) {
    if (!item.logbookAreaMods) {
      item.logbookAreaMods = [areaMods]
    } else {
      item.logbookAreaMods.push(areaMods)
    }
  }

  return 'SECTION_PARSED'
}

const MOD_RARITIES = new Set<ItemRarity | undefined>([
  ItemRarity.Normal,
  ItemRarity.Magic,
  ItemRarity.Rare,
  ItemRarity.Unique
])

/** EE2: разбор одной строки стата как мода (используется item-editor для рун, не в общем цикле парсеров). */
export function parseModifiersPoe2(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (!MOD_RARITIES.has(item.rarity)) {
    return 'PARSER_SKIPPED'
  }

  let foundAnyMods = false

  const hasEndingTag = section.find(
    (line) =>
      line.endsWith(ENCHANT_LINE) ||
      line.endsWith(SCOURGE_LINE) ||
      line.endsWith(AUGMENT_LINE) ||
      line.endsWith(ADDED_AUGMENT_LINE) ||
      line.startsWith(_$.GRANTS_SKILL)
  )

  if (hasEndingTag) {
    const { lines } = parseModType(section, _$)
    let modType: ModifierType

    if (hasEndingTag.endsWith(ENCHANT_LINE)) {
      modType = ModifierType.Enchant
    } else if (hasEndingTag.endsWith(SCOURGE_LINE)) {
      modType = ModifierType.Scourge
    } else if (hasEndingTag.endsWith(ADDED_AUGMENT_LINE)) {
      modType = ModifierType.AddedAugment
    } else if (hasEndingTag.endsWith(AUGMENT_LINE)) {
      modType = ModifierType.Augment
    } else if (hasEndingTag.startsWith(_$.GRANTS_SKILL)) {
      modType = ModifierType.Skill
    } else {
      throw new Error('Invalid ending tag')
    }
    const modInfo: ModifierInfo = {
      type: modType,
      tags: []
    }
    foundAnyMods = parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)
  } else {
    for (const statLines of section) {
      const parsed = parseModType([statLines], _$)
      const lines = parsed.lines
      let modType = parsed.modType
      if (modType === ModifierType.Explicit && item.category === ItemCategory.Relic) {
        modType = ModifierType.Sanctum
      }
      const found = parseStatsFromMod(
        lines,
        item,
        {
          info: { type: modType, tags: [] },
          stats: []
        },
        d
      )
      foundAnyMods = found || foundAnyMods

      if (modType === ModifierType.Veiled) {
        item.isVeiled = true
      }
    }
  }

  return foundAnyMods ? 'SECTION_PARSED' : 'SECTION_SKIPPED'
}

function parseModifiers(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (!MOD_RARITIES.has(item.rarity)) {
    return 'PARSER_SKIPPED'
  }

  const recognizedLine = section.find(
    (line) =>
      line.endsWith(ENCHANT_LINE) ||
      line.endsWith(AUGMENT_LINE) ||
      line.startsWith(_$.GRANTS_SKILL) ||
      isModInfoLine(line)
  )

  if (!recognizedLine) {
    return 'SECTION_SKIPPED'
  }

  if (isModInfoLine(recognizedLine)) {
    for (const { modLine, statLines } of groupLinesByMod(section)) {
      const { modType, lines } = parseModType(statLines, _$)

      const modInfo = parseModInfoLine(modLine, modType, _$)
      if (item.category === ItemCategory.Relic && modInfo.type === ModifierType.Explicit) {
        modInfo.type = ModifierType.Sanctum
      }
      parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)

      if (modType === ModifierType.Veiled) {
        item.isVeiled = true
      }
    }
  } else {
    const { lines } = parseModType(section, _$)
    const modInfo: ModifierInfo = {
      type: recognizedLine.endsWith(ENCHANT_LINE)
        ? ModifierType.Enchant
        : recognizedLine.startsWith(_$.GRANTS_SKILL)
          ? ModifierType.Skill
          : ModifierType.Augment,
      tags: []
    }
    parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)
  }

  return 'SECTION_PARSED'
}

// ---------------------------------------------------------------- POETH: обычный Ctrl+C

const PLAIN_SUFFIXES: ReadonlyArray<[string, ModifierType]> = [
  [IMPLICIT_LINE, ModifierType.Implicit],
  [ENCHANT_LINE, ModifierType.Enchant],
  [AUGMENT_LINE, ModifierType.Augment],
  [ADDED_AUGMENT_LINE, ModifierType.AddedAugment],
  [FRACTURED_LINE, ModifierType.Fractured],
  [CRAFTED_LINE, ModifierType.Crafted],
  [DESECRATED_LINE, ModifierType.Desecrated],
  [SCOURGE_LINE, ModifierType.Scourge]
]

function splitLineSuffix(line: string): [text: string, type: ModifierType | undefined] {
  for (const [suffix, type] of PLAIN_SUFFIXES) {
    if (line.endsWith(suffix)) return [line.slice(0, -suffix.length), type]
  }
  return [line, undefined]
}

/** Сколько статов из строк распознаётся под типом мода (с учётом многострочных статов). */
function countResolved(lines: string[], type: ModifierType, item: ParsedItem, d: Poe2Data): number {
  const it = linesToStatStrings(lines, d.strings)
  let n = 0
  let step = it.next()
  while (!step.done) {
    const found = tryParseTranslation(step.value, type, item.category, d) !== undefined
    if (found) n++
    step = it.next(found)
  }
  return n
}

/**
 * Обычный Ctrl+C (без Alt): у явных модов нет строк `{ … }`, собственные помечены `(implicit)`, расколотые /
 * очернённые / ремесленные — `(fractured)` / `(desecrated)` / `(crafted)`. Секции с `(enchant)`, `(rune)` и
 * «Grants Skill:» уже разобрал parseModifiers EE2. Секция модов — оставшаяся секция, где распознан хотя бы один
 * стат; последняя такая секция — явные моды, предыдущие — собственные (или чары, если распознаются лучше).
 * У неопознанных и обычных (Normal) предметов явных модов нет. Строки с суффиксом получают тип по суффиксу,
 * подряд идущие строки одного типа — один мод. Нераспознанные строки → unknownModifiers.
 */
function parsePlainModifiers(sections: string[][], item: ParserState, d: Poe2Data): string[][] {
  if (item.textFormat !== 'plain' || !MOD_RARITIES.has(item.rarity)) return []
  const _$ = d.strings

  const explicitType = item.category === ItemCategory.Relic ? ModifierType.Sanctum : ModifierType.Explicit
  const probe = [explicitType, ModifierType.Implicit, ModifierType.Enchant]
  const candidates = sections.filter((section) => {
    if (section[0].startsWith(_$.REQUIREMENTS) || section[0].startsWith(_$.PRICE_NOTE)) return false
    const lines = section.map((l) => splitLineSuffix(l)[0])
    return probe.some((type) => countResolved(lines, type, item, d) > 0)
  })
  if (!candidates.length) return []

  const noExplicit = item.isUnidentified || item.rarity === ItemRarity.Normal
  candidates.forEach((section, i) => {
    const lines = section.map((l) => splitLineSuffix(l)[0])
    let defaultType: ModifierType
    if (!noExplicit && i === candidates.length - 1) {
      const asExplicit = countResolved(lines, explicitType, item, d)
      defaultType =
        asExplicit === 0 && countResolved(lines, ModifierType.Implicit, item, d) > 0
          ? ModifierType.Implicit
          : explicitType
    } else {
      defaultType =
        countResolved(lines, ModifierType.Enchant, item, d) > countResolved(lines, ModifierType.Implicit, item, d)
          ? ModifierType.Enchant
          : ModifierType.Implicit
    }

    // подряд идущие строки одного типа — один «мод»
    let group: { type: ModifierType; lines: string[] } | undefined
    const flush = () => {
      if (group?.lines.length) {
        parseStatsFromMod(group.lines, item, { info: { type: group.type, tags: [] }, stats: [] }, d)
      }
      group = undefined
    }
    for (const line of section) {
      if (line === _$.VEILED_PREFIX || line === _$.VEILED_SUFFIX) {
        item.isVeiled = true
        continue
      }
      const [text, suffixType] = splitLineSuffix(line)
      const type = suffixType ?? defaultType
      if (!group || group.type !== type) {
        flush()
        group = { type, lines: [] }
      }
      group.lines.push(text)
    }
    flush()
  })
  return candidates
}

/** POETH: «Fractured Item» / «Расколотый предмет» — отдельная секция в конце текста. */
function parseFracturedMarker(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (section.length === 1 && section[0] === d.strings.FRACTURED_ITEM) {
    item.isFractured = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

// ---------------------------------------------------------------- EE2

function applyAugmentSockets(item: ParsedItem, d: Poe2Data) {
  // If we have any augment sockets
  if (item.augmentSockets) {
    // Count current mods that are of type Augment
    const augmentMods = item.newMods.filter((mod) => mod.info.type === ModifierType.Augment)
    const augmentStats = item.statsByType
      .filter((calc) => calc.type === ModifierType.Augment)
      .filter((calc) => !calc.stat.ref.startsWith('Bonded'))

    let statCombinations = combinations(augmentStats)
      .filter((f) => f.length)
      .sort((a, b) => b.length - a.length)
    const augs: BaseType[][] = []
    for (let i = 0; i < statCombinations.length;) {
      const foundAugs = determineAugments(augmentMods[0], statCombinations[i], d)
      if (foundAugs.length) {
        augs.push(foundAugs)
        for (const combStat of statCombinations[i]) {
          // drop any that we use here
          statCombinations = statCombinations.filter((f) => f.find((s) => s === combStat) === undefined)
        }
        i = 0
        continue
      }
      i++
    }

    const augments: Array<EditorItem | null> = augs
      .map((augGroup) => buildEditorItems(augGroup, item.category ?? ItemCategory.Unknown, true))
      .flat()

    if (augments.length < Math.max(item.augmentSockets.current, item.augmentSockets.normal)) {
      // have possible empty sockets

      const emptyAugments = item.isCorrupted
        ? item.augmentSockets.current - augments.length
        : Math.max(item.augmentSockets.current, item.augmentSockets.normal) - augments.length
      for (let i = 0; i < emptyAugments; i++) {
        augments.push(null)
      }
    }

    // set all the stuff

    item.augmentSockets.empty = augments.filter((augment) => augment === null).length
    item.augmentSockets.augments = augments
  }

  // EE2: если все гнёзда пусты — заполнить сохранёнными рунами (AppConfig savedAugments + item-editor useAugment).
  // POETH: не перенесено (UI); см. augment-builder.ts getSavedAugments.
}

function parseMirrored(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (section.length === 1) {
    if (section[0] === d.strings.MIRRORED) {
      item.isMirrored = true
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseSanctified(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (section.length === 1) {
    if (section[0] === d.strings.SANCTIFIED) {
      item.isSanctified = true
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseFlask(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  // the purpose of this parser is to "consume" flask buffs
  // so they are not recognized as modifiers

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (d.strings.FLASK_CHARGES.test(line)) {
      isParsed = 'SECTION_PARSED'
      break
    }
  }

  // EE2: строка-результат всегда truthy, поэтому качество читается из любой просмотренной секции (так у EE2
  // берётся качество оберегов, бижутерии и т. п.) — поведение сохранено
  if (isParsed) {
    parseQualityNested(section, item, d)
  }

  return isParsed
}

function parseJewelery(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (
    item.category !== ItemCategory.Amulet &&
    item.category !== ItemCategory.Ring &&
    item.category !== ItemCategory.Belt
  ) {
    return 'PARSER_SKIPPED'
  }

  for (const line of section) {
    if (line.startsWith(_$.QUALITY.substring(0, _$.QUALITY.indexOf(':')))) {
      return 'SECTION_PARSED'
    }
  }

  return 'SECTION_SKIPPED'
}

function parseCharmSlots(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  // the purpose of this parser is to "consume" charm slot 1 sections
  // so they are not recognized as modifiers
  if (item.category !== ItemCategory.Belt) return 'PARSER_SKIPPED'

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.startsWith(d.strings.CHARM_SLOTS)) {
      isParsed = 'SECTION_PARSED'
      break
    }
  }

  return isParsed
}

function parseSpirit(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  // the purpose of this parser is to "consume" Spirit: 100 sections
  // so they are not recognized as modifiers
  if (item.category !== ItemCategory.Sceptre) return 'PARSER_SKIPPED'

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.startsWith(d.strings.BASE_SPIRIT)) {
      isParsed = 'SECTION_PARSED'
      break
    }
  }

  return isParsed
}

function parsePriceNote(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.PRICE_NOTE)) {
      item.note = line.slice(_$.PRICE_NOTE.length)
      return 'SECTION_PARSED'
    }
  }

  return 'SECTION_SKIPPED'
}

function parseTimelostRadius(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (item.category !== ItemCategory.Jewel) return 'PARSER_SKIPPED'
  for (const line of section) {
    if (line.startsWith(d.strings.TIMELESS_RADIUS)) {
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseSentinelCharge(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.Sentinel) return 'PARSER_SKIPPED'

  if (section.length === 1) {
    if (section[0].startsWith(_$.SENTINEL_CHARGE)) {
      item.sentinelCharge = parseInt(section[0].slice(_$.SENTINEL_CHARGE.length), 10)
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseSynthesised(section: string[], item: ParserState, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  const _$REF = d.refStrings
  if (section.length === 1) {
    if (section[0] === _$.SECTION_SYNTHESISED) {
      item.isSynthesised = true
      if (item.baseType) {
        let baseTypeReg = _$REF.ITEM_SYNTHESISED.exec(item.baseType)
        if (!baseTypeReg || baseTypeReg.length < 2) {
          baseTypeReg = _$.ITEM_SYNTHESISED.exec(item.baseType)
        }
        if (baseTypeReg) item.baseType = baseTypeReg[1]
      } else {
        let nameReg = _$REF.ITEM_SYNTHESISED.exec(item.name)
        if (!nameReg || nameReg.length < 2) {
          nameReg = _$.ITEM_SYNTHESISED.exec(item.name)
        }
        if (nameReg) item.name = nameReg[1]
      }
      return 'SECTION_PARSED'
    }
  }

  return 'SECTION_SKIPPED'
}

function stripNameByRegex(item: ParserState, ref: RegExp, local: RegExp) {
  if (
    item.rarity === ItemRarity.Normal ||
    (item.rarity === ItemRarity.Magic && item.isUnidentified) ||
    (item.rarity === ItemRarity.Rare && item.isUnidentified) ||
    (item.rarity === ItemRarity.Unique && item.isUnidentified)
  ) {
    if (ref.test(item.name)) {
      item.name = ref.exec(item.name)![1]
    } else if (local.test(item.name)) {
      item.name = local.exec(item.name)![1]
    }
  }
}

function parseSuperior(item: ParserState, d: Poe2Data) {
  stripNameByRegex(item, d.refStrings.ITEM_SUPERIOR, d.strings.ITEM_SUPERIOR)
}

function parseExceptional(item: ParserState, d: Poe2Data) {
  stripNameByRegex(item, d.refStrings.ITEM_EXCEPTIONAL, d.strings.ITEM_EXCEPTIONAL)
}

function parseCategoryByHelpText(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (section[0] === _$.BEAST_HELP) {
    item.category = ItemCategory.CapturedBeast
    return 'SECTION_PARSED'
  } else if (section[0] === _$.METAMORPH_HELP) {
    item.category = ItemCategory.MetamorphSample
    return 'SECTION_PARSED'
  } else if (section[0] === _$.VOIDSTONE_HELP) {
    item.category = ItemCategory.Voidstone
    return 'SECTION_PARSED'
  }

  return 'SECTION_SKIPPED'
}

function parseHeistBlueprint(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.HeistBlueprint) return 'PARSER_SKIPPED'

  parseAreaLevelNested(section, item, d)
  if (!item.areaLevel) {
    return 'SECTION_SKIPPED'
  }

  item.heist = {}

  for (const line of section) {
    if (line.startsWith(_$.HEIST_TARGET)) {
      const targetText = line.slice(_$.HEIST_TARGET.length)
      switch (targetText) {
        case _$.HEIST_BLUEPRINT_ENCHANTS:
          item.heist.target = 'Enchants'
          break
        case _$.HEIST_BLUEPRINT_GEMS:
          item.heist.target = 'Gems'
          break
        case _$.HEIST_BLUEPRINT_REPLICAS:
          item.heist.target = 'Replicas'
          break
        case _$.HEIST_BLUEPRINT_TRINKETS:
          item.heist.target = 'Trinkets'
          break
      }
    } else if (line.startsWith(_$.HEIST_WINGS_REVEALED)) {
      item.heist.wingsRevealed = parseInt(line.slice(_$.HEIST_WINGS_REVEALED.length), 10)
    }
  }

  return 'SECTION_PARSED'
}

function parseTrials(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (item.info.refName !== 'Djinn Barya' && item.info.refName !== 'Inscribed Ultimatum') {
    return 'PARSER_SKIPPED'
  }

  parseAreaLevelNested(section, item, d)
  if (!item.areaLevel) {
    return 'SECTION_SKIPPED'
  }
  item.trials = {}

  for (const line of section) {
    if (line.startsWith(_$.TRIAL_COUNT)) {
      item.trials.numberOfTrials = Number(line.slice(_$.TRIAL_COUNT.length))
    } else if (item.info.refName === 'Inscribed Ultimatum') {
      if (line.startsWith(_$.ULTIMATUM_VICTORIOUS)) {
        item.trials.ultimatumHint = 'Victorious'
      } else if (line.startsWith(_$.ULTIMATUM_COWARDLY)) {
        item.trials.ultimatumHint = 'Cowardly'
      } else if (line.startsWith(_$.ULTIMATUM_DEADLY)) {
        item.trials.ultimatumHint = 'Deadly'
      }
    }
  }

  return 'SECTION_PARSED'
}

function parseAreaLevelNested(section: string[], item: ParsedItem, d: Poe2Data) {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.AREA_LEVEL)) {
      item.areaLevel = Number(line.slice(_$.AREA_LEVEL.length))
      break
    }
  }
}

function parseAreaLevel(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (
    item.info.refName !== 'Chronicle of Atzoatl' &&
    item.info.refName !== 'Expedition Logbook' &&
    item.info.refName !== 'Mirrored Tablet' &&
    item.info.refName !== 'Forbidden Tome'
  )
    return 'PARSER_SKIPPED'

  parseAreaLevelNested(section, item, d)

  return item.areaLevel ? 'SECTION_PARSED' : 'SECTION_SKIPPED'
}

function parseAtzoatlRooms(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  const _$ = d.strings
  if (item.info.refName !== 'Chronicle of Atzoatl') return 'PARSER_SKIPPED'
  if (section[0] !== _$.INCURSION_OPEN) return 'SECTION_SKIPPED'

  let state = IncursionRoom.Open
  for (const line of section.slice(1)) {
    if (line === _$.INCURSION_OBSTRUCTED) {
      state = IncursionRoom.Obstructed
      continue
    }

    const found = d.statByMatchStr(line)
    if (found) {
      item.newMods.push({
        info: { tags: [], type: ModifierType.Pseudo },
        stats: [
          {
            stat: found.stat,
            translation: {
              string:
                state === IncursionRoom.Open
                  ? found.matcher.string
                  : `${_$.INCURSION_OBSTRUCTED} ${found.matcher.string}`
            },
            roll: {
              value: state,
              min: state,
              max: state,
              dp: false,
              unscalable: true
            }
          }
        ]
      })
    } else {
      item.unknownModifiers.push({
        text: line,
        type: ModifierType.Pseudo
      })
    }
  }

  return 'SECTION_PARSED'
}

function parseMirroredTablet(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (item.info.refName !== 'Mirrored Tablet') return 'PARSER_SKIPPED'
  if (section.length < 8) return 'SECTION_SKIPPED'

  for (const line of section) {
    const found = tryParseTranslation({ string: line, unscalable: true }, ModifierType.Pseudo, undefined, d)
    if (found) {
      item.newMods.push({
        info: { tags: [], type: ModifierType.Pseudo },
        stats: [found]
      })
    } else {
      item.unknownModifiers.push({
        text: line,
        type: ModifierType.Pseudo
      })
    }
  }

  return 'SECTION_PARSED'
}

function parseFilledCoffin(section: string[], item: ParsedItem, d: Poe2Data): SectionParseResult {
  if (item.info.refName !== 'Filled Coffin') return 'PARSER_SKIPPED'
  if (!section.some((line) => line.endsWith(IMPLICIT_LINE))) return 'SECTION_SKIPPED'

  const { lines } = parseModType(section, d.strings)
  const modInfo: ModifierInfo = {
    type: ModifierType.Necropolis,
    tags: []
  }
  parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)

  return 'SECTION_PARSED'
}

function markupConditionParser(text: string) {
  // ignores state set by <<set:__>>
  // always evaluates first condition to true <if:__>{...}
  // full markup: https://gist.github.com/SnosMe/151549b532df8ea08025a76ae2920ca4

  text = text.replace(/<<set:.+?>>/g, '')
  text = text.replace(/<(if:.+?|elif:.+?|else)>{(.+?)}/g, (_, type: string, body: string) => {
    return type.startsWith('if:') ? body : ''
  })

  return text
}

export function parseStatsFromMod(
  lines: string[],
  item: ParsedItem,
  modifier: ParsedModifier,
  d: Poe2Data,
  addedAugment?: BaseType
): boolean {
  item.newMods.push(modifier)

  if (modifier.info.type === ModifierType.Veiled) {
    return true
  }

  const statIterator = linesToStatStrings(lines, d.strings)
  let stat = statIterator.next()
  while (!stat.done) {
    if (item.info.refName === 'From Nothing') {
      stat.value.string = stat.value.string.replace('()', '')
    }

    const parsedStat = tryParseTranslation(stat.value, modifier.info.type, item.category, d)

    // fully skip builtin skills
    if (
      parsedStat?.stat.ref === 'Grants Skill: Parry' ||
      parsedStat?.stat.ref === 'Grants Skill: Raise Shield' ||
      parsedStat?.stat.ref === 'Grants Skill: Spear Throw'
    ) {
      stat = statIterator.next(true)
      continue
    }

    if (parsedStat) {
      // keep augment basetype on the stat
      if (modifier.info.type === ModifierType.AddedAugment) {
        parsedStat.fromAddedAugment = addedAugment
      }
      modifier.stats.push(parsedStat)

      stat = statIterator.next(true)
    } else {
      stat = statIterator.next(false)
    }
  }

  item.unknownModifiers.push(
    ...stat.value.map((line) => ({
      text: line,
      type: modifier.info.type
    }))
  )

  return true
}

/**
 * @deprecated
 */
function transformToLegacyModifiers(item: ParsedItem) {
  item.statsByType = sumStatsByModType(item.newMods)
}

function applyElementalAdded(item: ParsedItem) {
  if (item.weaponELEMENTAL && item.rarity !== ItemRarity.Unique) {
    const knownRefs = new Set<string>([
      'Adds # to # Lightning Damage',
      'Adds # to # Cold Damage',
      'Adds # to # Fire Damage'
    ])

    item.statsByType.forEach((calc) => {
      if (knownRefs.has(calc.stat.ref)) {
        for (const source of calc.sources) {
          if (calc.stat.ref === 'Adds # to # Lightning Damage') {
            item.weaponLIGHTNING = item.weaponLIGHTNING
              ? source.contributes!.value + item.weaponLIGHTNING
              : source.contributes!.value
          } else if (calc.stat.ref === 'Adds # to # Cold Damage') {
            item.weaponCOLD = item.weaponCOLD ? source.contributes!.value + item.weaponCOLD : source.contributes!.value
          } else if (calc.stat.ref === 'Adds # to # Fire Damage') {
            item.weaponFIRE = item.weaponFIRE ? source.contributes!.value + item.weaponFIRE : source.contributes!.value
          }
        }
      }
    })
  }
}

function calcBasePercentile(item: ParsedItem, d: Poe2Data) {
  // use ref since we have ref from unique.base
  const info = item.info.unique ? d.itemByRef('ITEM', item.info.unique.base)?.[0].armour : item.info.armour
  if (!info) return

  // Base percentile is the same for all defences.
  // Using `AR/EV -> ES` order to improve accuracy
  // of calculation (larger rolls = more precise).
  if (item.armourAR && info.ar) {
    item.basePercentile = calcPropPercentile(item.armourAR, info.ar, QUALITY_STATS.ARMOUR, item)
  } else if (item.armourEV && info.ev) {
    item.basePercentile = calcPropPercentile(item.armourEV, info.ev, QUALITY_STATS.EVASION, item)
  } else if (item.armourES && info.es) {
    item.basePercentile = calcPropPercentile(item.armourES, info.es, QUALITY_STATS.ENERGY_SHIELD, item)
  }
  // no ward since base percent isn't used anymore
}

export function getMaxSockets(item: ParsedItem): number {
  switch (item.info.refName) {
    case "Atziri's Splendour":
      return 6

    case "Runeseeker's Call":
      return 5

    case 'Greymake':
    case 'Morior Invictus':
    case 'The Bringer of Rain':
      return 4

    case "Serle's Grit":
      return 3

    case 'Darkness Enthroned':
    case "Mahuxotl's Machination":
      return 2

    case 'Grasping Ring':
    case 'Corona Amulet':
    case 'Stalking Belt':
      return 1

    default:
    // fall through to below
  }

  const { category } = item
  switch (category) {
    case ItemCategory.BodyArmour:
    case ItemCategory.TwoHandedAxe:
    case ItemCategory.TwoHandedMace:
    case ItemCategory.TwoHandedSword:
    case ItemCategory.Crossbow:
    case ItemCategory.Bow:
    case ItemCategory.Warstaff:
    case ItemCategory.Staff:
    case ItemCategory.Talisman:
      return 2
    case ItemCategory.Helmet:
    case ItemCategory.Shield:
    case ItemCategory.Gloves:
    case ItemCategory.Boots:
    case ItemCategory.OneHandedAxe:
    case ItemCategory.OneHandedMace:
    case ItemCategory.OneHandedSword:
    case ItemCategory.Claw:
    case ItemCategory.Dagger:
    case ItemCategory.Focus:
    case ItemCategory.Spear:
    case ItemCategory.Flail:
    case ItemCategory.Wand:
    case ItemCategory.Buckler:
    case ItemCategory.Sceptre:
      return 1
    default:
      return 0
  }
}

export function isArmourOrWeaponOrCaster(
  category: ItemCategory | undefined
): 'armour' | 'weapon' | 'caster' | undefined {
  switch (category) {
    case ItemCategory.BodyArmour:
    case ItemCategory.Boots:
    case ItemCategory.Gloves:
    case ItemCategory.Helmet:
    case ItemCategory.Shield:
    case ItemCategory.Focus:
    case ItemCategory.Buckler:
      return 'armour'
    case ItemCategory.OneHandedAxe:
    case ItemCategory.OneHandedMace:
    case ItemCategory.OneHandedSword:
    case ItemCategory.Quiver:
    case ItemCategory.Claw:
    case ItemCategory.Dagger:
    case ItemCategory.Sceptre:
    case ItemCategory.TwoHandedAxe:
    case ItemCategory.TwoHandedMace:
    case ItemCategory.TwoHandedSword:
    case ItemCategory.Crossbow:
    case ItemCategory.Bow:
    case ItemCategory.Warstaff:
    case ItemCategory.Spear:
    case ItemCategory.Flail:
    case ItemCategory.Talisman:
      return 'weapon'
    case ItemCategory.Wand:
    case ItemCategory.Staff:
      return 'caster'
    default:
      return undefined
  }
}

function modifiedBfs(remaining: number, combo: number[], available: number[]): number[] | null {
  if (remaining === 0) return [...combo]
  if (combo.length >= 7 || available.length > 8) return []

  let best: number[] | null = null
  for (const augValue of available) {
    if (augValue > remaining) {
      // overflow
      continue
    }
    combo.push(augValue)
    const result = modifiedBfs(remaining - augValue, combo, available)
    combo.pop()
    if (result) {
      if (!best || result.length < best.length) {
        best = result
      } else if (result.length === best.length) {
        const resultMax = Math.max(...result.map((v) => result.filter((x) => x === v).length))
        const bestMax = Math.max(...best.map((v) => best!.filter((x) => x === v).length))
        if (resultMax > bestMax) {
          best = result
        } else if (resultMax === bestMax) {
          const resultSet = new Set(result)
          const bestSet = new Set(best)
          if (resultSet.size < bestSet.size) {
            // use one with more duplicates
            best = result
          }
        }
      }
    }
  }
  return best ? [...best].sort((a, b) => b - a) : null
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  return new Set([...a].filter((x) => b.has(x)))
}

function determineAugments(mod: ParsedModifier | undefined, statCalcs: StatCalculated[], d: Poe2Data): BaseType[] {
  if (mod?.info.type !== ModifierType.Augment) return []
  const augmentAppliedValue = statCalcs.map((s) => s.sources[0].contributes?.value).filter((v) => v !== undefined)

  const byTradeId = d.augments().byTradeId
  const allTradeIds = statCalcs.map((c) => c.stat.trade.ids[ModifierType.Augment]?.[0])
  const allPossibleAugments = allTradeIds
    .map((id) => (id ? byTradeId[id] : undefined))
    .filter((v): v is NonNullable<typeof v> => v !== undefined)

  const augmentRefSets = allPossibleAugments.map((augGroup) => new Set(augGroup.map((a) => a.refName)))

  const morePossibleAugments = augmentRefSets.reduce((acc, set) => intersect(set, acc), augmentRefSets[0] ?? new Set())

  // intersect all possible augments
  const possibleAugments = allPossibleAugments
    .map((augGroup) => augGroup.filter((aug) => morePossibleAugments.has(aug.refName)))
    .find((f) => f.length)

  if (!possibleAugments) return []

  const itemByRef = (refName: string) => d.itemByRef('ITEM', refName)?.[0]

  // something like "Raven-Touched"
  if (!augmentAppliedValue || !augmentAppliedValue.length) {
    const singleAugment = itemByRef(possibleAugments[0].refName)
    return singleAugment ? [singleAugment] : []
  }

  if (augmentAppliedValue.length > 1) {
    const applied = new Set(augmentAppliedValue)
    const likelyAugment = possibleAugments.find(
      (aug) => intersect(new Set(aug.values), applied).size === augmentAppliedValue.length
    )
    if (!likelyAugment) return []
    const base = itemByRef(likelyAugment.refName)
    return base ? [base] : []
  }

  // // Calculate how many of this augment are in the item
  const availableAugmentValues = possibleAugments
    .map((augment) => {
      if (augment.values.length === 1) return augment.values[0]

      // stats like "# to # added Lightning Damage"
      if ((augment.baseStat.match(/#/g) || []).length > 1) {
        const sum = augment.values.reduce((a, b) => a + b, 0)
        return sum / augment.values.length || 0
      }

      // everything else
      return augment.values[0]
    })
    .sort((a, b) => b - a)

  // BFS to find all combinations with minimum count
  const likelyValues = modifiedBfs(augmentAppliedValue[0], [], availableAugmentValues) ?? []

  return likelyValues
    .map((v) => {
      const augment = possibleAugments.find((aug) => aug.values.some((augVal) => augVal === v) || avg(aug.values) === v)
      return augment ? itemByRef(augment.refName) : undefined
    })
    .filter((b): b is BaseType => b !== undefined)
}

function isItemMissingItemClass(section: string[], d: Poe2Data): boolean {
  if (section.length > 3 || section.length < 2) return false
  return section[0].startsWith(d.strings.RARITY) && section[1] !== undefined
}

// Для юнит-тестов (как __testExports в EE2)
export const __testExports = {
  itemTextToSections,
  findInDatabase,
  parseNamePlate,
  isItemMissingItemClass,
  parseWeapon,
  parseArmour,
  parseModifiers,
  parseWaystone,
  parseRequirements,
  parseFractured,
  parseUnidentified,
  parseTrials,
  determineAugments,
  modifiedBfs,
  parseAugmentSockets,
  applyAugmentSockets
}
