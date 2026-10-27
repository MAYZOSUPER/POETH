// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/parser/Parser.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH:
//  - данные языка (`d: Poe1Data`) передаются параметром вместо глобальных CLIENT_STRINGS/ITEM_BY_*/STAT_BY_*
//    (держим en и ru одновременно, язык выбирается по первой строке текста — см. index.ts);
//  - результат без `neverthrow` (свой Result), `lang`/`textFormat`/`timeless` в ParsedItem;
//  - обычный формат Ctrl+C и текст с трейда (`item.extended.text`): у явных модов там нет строк `{ … }`, а у
//    собственных/крафтовых/расколотых — суффиксов, поэтому секции модов определяются по распознанным статам
//    (parsePlainModifiers); маркеры «Fractured Item», «Note:» поглощаются;
//  - неизвестные область карты / награда / билд наёмника не роняют разбор (поле просто не заполняется).

import type { BaseType } from '../data/interfaces'
import { StatBetter } from '../data/interfaces'
import type { Poe1Data } from '../data/Poe1Data'
import { ModifierType, ModifierMechanic, sumStatsByModType } from './modifiers'
import { linesToStatStrings, tryParseTranslation, getRollOrMinmaxAvg, type ParsedStat } from './stat-translations'
import { ItemCategory, JEWELLERY } from './meta'
import { IncursionRoom, type ParsedItem, ItemInfluence, ItemRarity } from './ParsedItem'
import { magicBasetype } from './magic-name'
import {
  isModInfoLine,
  groupLinesByMod,
  parseModInfoLine,
  parseModType,
  type ModifierInfo,
  type ParsedModifier,
  ENCHANT_LINE,
  SCOURGE_LINE,
  IMPLICIT_LINE,
  CRAFTED_LINE,
  FRACTURED_LINE
} from './advanced-mod-desc'
import { calcPropPercentile, QUALITY_STATS } from './calc-q20'
import { EXTRA_STRINGS } from './extra-strings'
import { detectTimelessJewel } from './timeless'
import { ok, err } from './result'

export type ParseErrorCode = 'item.parse_error' | 'item.unknown' | 'item.unknown_lang'
export type ParseResult = { ok: true; value: ParsedItem } | { ok: false; error: ParseErrorCode; detail?: string }
type ParseFailure = { ok: false; error: ParseErrorCode; detail?: string }

type SectionParseResult = 'SECTION_PARSED' | 'SECTION_SKIPPED' | 'PARSER_SKIPPED'

type ParserFn = (section: string[], item: ParserState, d: Poe1Data) => SectionParseResult
type VirtualParserFn = (item: ParserState, d: Poe1Data) => ParseFailure | void
/** POETH: парсер, которому нужны все оставшиеся секции сразу; возвращает поглощённые секции. */
type MultiParserFn = (sections: string[][], item: ParserState, d: Poe1Data) => string[][]

interface ParserState extends ParsedItem {
  name: string
  baseType: string | undefined
  infoVariants: BaseType[]
}

const parsers: Array<ParserFn | { virtual: VirtualParserFn } | { multi: MultiParserFn }> = [
  parseUnidentified,
  { virtual: parseSuperior },
  { virtual: parseFoulborn },
  { virtual: parseVestigial },
  parseSynthesised,
  parseCategoryByHelpText,
  { virtual: parseMapTier },
  { virtual: normalizeName },
  { virtual: findInDatabase },
  // -----------
  parseItemLevel,
  parseTalismanTier,
  parseGem,
  parseVaalGem,
  parseArmour,
  parseWeapon,
  parseAccessory,
  parseFlask,
  parseTincture,
  parseStackSize,
  parseCorrupted,
  parseImbuedGem,
  parseFoil,
  parseInfluence,
  parseInfluence, // POETH: в тексте с трейда два влияния могут быть в разных секциях
  parseMap,
  parseSockets,
  parseHeistContract,
  parseHeistBlueprint,
  parseChart,
  parseAreaLevel,
  parseAtzoatlRooms,
  parseMirroredTablet,
  parseFilledCoffin,
  parseMirrored,
  parseSplit,
  parseFracturedMarker, // POETH
  parseNote, // POETH
  parseSentinelCharge,
  parseScryingOrb,
  parseMercenary,
  parseLogbookArea,
  parseLogbookArea,
  parseLogbookArea,
  parseMercenaryGems,
  parseMercenaryGems,
  parseMercenaryGems,
  parseMercenaryGems,
  parseMercenaryGems,
  parseMercenaryGems,
  parseModifiers, // enchant
  parseModifiers, // scourge
  parseModifiers, // implicit
  parseModifiers, // explicit
  { multi: parsePlainModifiers }, // POETH: обычный формат / текст с трейда
  { virtual: augmentModifiers },
  { virtual: transformToLegacyModifiers },
  { virtual: parseFractured },
  { virtual: pickCorrectVariant },
  { virtual: calcDisenchantDust },
  { virtual: calcBasePercentile },
  { virtual: parseTimeless } // POETH
]

const VALUE_AUGMENTED = ' (augmented)'

/** Разбор текста предмета на известном языке данных `d`. Язык текста должен совпадать с `d.lang`. */
export function parseClipboard(clipboard: string, d: Poe1Data): ParseResult {
  const _$ = d.strings
  try {
    let sections = itemTextToSections(clipboard)
    if (!sections.length) return err('item.parse_error')

    if (sections[0][2] === _$.CANNOT_USE_ITEM) {
      sections[0].pop() // remove CANNOT_USE_ITEM line
      sections[1].unshift(...sections[0]) // prepend item class & rarity into second section
      sections.shift() // remove first section where CANNOT_USE_ITEM line was
    }
    const parsed = parseNamePlate(sections[0], d)
    if (!parsed.ok) return parsed

    sections.shift()
    const item = parsed.value
    item.rawText = clipboard
    item.textFormat = sections.some((section) => section.some(isModInfoLine)) ? 'advanced' : 'plain'

    // each section can be parsed at most by one parser
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
        // workaround upstream bug
        parseEldritchItem(section, d)

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

function normalizeName(item: ParserState, d: Poe1Data) {
  const _$ = d.strings
  if (item.rarity === ItemRarity.Magic) {
    const baseType = magicBasetype(item.name, d)
    if (baseType) {
      item.name = baseType
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

function findInDatabase(item: ParserState, d: Poe1Data): ParseFailure | void {
  let info: BaseType[] | undefined
  if (item.category === ItemCategory.DivinationCard) {
    info = d.itemByTranslated('DIVINATION_CARD', item.name)
  } else if (item.category === ItemCategory.CapturedBeast) {
    info = d.itemByTranslated('CAPTURED_BEAST', item.baseType ?? item.name)
  } else if (item.category === ItemCategory.Gem) {
    info = d.itemByTranslated('GEM', item.name)
  } else if (item.category === ItemCategory.MetamorphSample) {
    // POETH: имена образцов нормализованы в английские (normalizeName) — ищем по refName
    info = d.itemByTranslated('ITEM', item.name) ?? d.itemByRef('ITEM', item.name)
  } else if (item.category === ItemCategory.Voidstone) {
    info = d.itemByRef('ITEM', 'Charged Compass')
  } else if (item.rarity === ItemRarity.Unique && !item.isUnidentified) {
    info = d.itemByTranslated('UNIQUE', item.name)
  } else {
    info = d.itemByTranslated('ITEM', item.baseType ?? item.name)
  }
  if (!info?.length) {
    return { ok: false, error: 'item.unknown', detail: item.baseType ?? item.name }
  }
  if (info[0].unique) {
    const baseTypes = d.itemByTranslated('ITEM', item.baseType!)
    if (!baseTypes?.length) return { ok: false, error: 'item.unknown', detail: item.baseType }

    const baseTypeRefs = new Set(baseTypes.map((b) => b.refName))
    info = info.filter((info) => baseTypeRefs.has(info.unique!.base))
    if (!info.length) return { ok: false, error: 'item.unknown', detail: `${item.name} / ${item.baseType}` }
  }
  item.infoVariants = info
  // choose 1st variant, correct one will be picked at the end of parsing
  item.info = info[0]
  // same for every variant
  if (!item.category) {
    if (item.info.craftable) {
      item.category = item.info.craftable.category
    } else if (item.info.unique) {
      item.category = d.itemByRef('ITEM', item.info.unique.base)?.[0].craftable?.category
    }
  }
}

export function makeIdentifiedUnique(uniqueInfo: BaseType, unidentified: ParsedItem): ParsedItem {
  const newItem: ParsedItem = {
    ...unidentified,
    info: uniqueInfo,
    uniqueBase: unidentified.info
  }

  calcDisenchantDust(newItem)

  return newItem
}

function parseMapTier(item: ParserState, d: Poe1Data) {
  const execResult = d.strings.MAP_TIER.exec(item.baseType || item.name)
  if (!execResult) return

  item.mapTier = Number(execResult[1])

  if (item.baseType) {
    item.baseType = item.baseType.replace(execResult[0], '')
  } else {
    item.name = item.name.replace(execResult[0], '')
  }
}

function parseAreaPropNested(line: string, item: ParsedItem, d: Poe1Data): boolean {
  const _$ = d.strings
  if (line.startsWith(_$.MAP_ITEM_QUANTITY)) {
    item.areaItemQuantity = parseInt(line.slice(_$.MAP_ITEM_QUANTITY.length), 10)
    return true
  } else if (line.startsWith(_$.MAP_ITEM_RARITY)) {
    item.areaItemRarity = parseInt(line.slice(_$.MAP_ITEM_RARITY.length), 10)
    return true
  } else if (line.startsWith(_$.MAP_MONSTER_PACK_SIZE)) {
    item.areaPackSize = parseInt(line.slice(_$.MAP_MONSTER_PACK_SIZE.length), 10)
    return true
  }
  return false
}

function parseMap(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.Map) return 'PARSER_SKIPPED'

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (parseAreaPropNested(line, item, d)) {
      isParsed = 'SECTION_PARSED'
    } else if (line.startsWith(_$.MAP_MORE_MAPS)) {
      item.mapMoreMaps = parseInt(line.slice(_$.MAP_MORE_MAPS.length), 10)
      isParsed = 'SECTION_PARSED'
    } else if (line.startsWith(_$.MAP_MORE_SCARABS)) {
      item.mapMoreScarabs = parseInt(line.slice(_$.MAP_MORE_SCARABS.length), 10)
      isParsed = 'SECTION_PARSED'
    } else if (line.startsWith(_$.MAP_MORE_CURRENCY)) {
      item.mapMoreCurrency = parseInt(line.slice(_$.MAP_MORE_CURRENCY.length), 10)
      isParsed = 'SECTION_PARSED'
    } else if (line.startsWith(_$.MAP_MORE_DIVINATION_CARDS)) {
      item.mapMoreDivCards = parseInt(line.slice(_$.MAP_MORE_DIVINATION_CARDS.length), 10)
      isParsed = 'SECTION_PARSED'
    } else if (line.startsWith(_$.MAP_AREA)) {
      const areaName = line.slice(_$.MAP_AREA.length)
      const areaInfo = d.itemByTranslated('AREA', areaName)
      // POETH: неизвестная область (новый патч) не роняет разбор
      if (areaInfo) item.mapArea = areaInfo[0]
      isParsed = 'SECTION_PARSED'
    } else if (_$.MAP_COMPLETION_REWARD.test(line)) {
      const rewardName = _$.MAP_COMPLETION_REWARD.exec(line)![1]
      const rewardInfo = d.itemByTranslated('UNIQUE', rewardName)
      if (rewardInfo) item.mapCompletionReward = rewardInfo[0]
      isParsed = 'SECTION_PARSED'
    }
  }

  return isParsed
}

function parseFractured(item: ParserState) {
  if (item.newMods.some((mod) => mod.info.type === ModifierType.Fractured)) {
    item.isFractured = true
  }
}

function pickCorrectVariant(item: ParserState, d: Poe1Data) {
  item.info = _pickCorrectVariant(item.infoVariants, item) ?? item.infoVariants[0]
  if (item.info.unique) {
    const baseVariants = d.itemByRef('ITEM', item.info.unique.base)
    if (baseVariants) item.uniqueBase = _pickCorrectVariant(baseVariants, item) ?? baseVariants[0]
  }
}

function _pickCorrectVariant(variants: BaseType[], item: ParsedItem): BaseType | undefined {
  if (variants.length <= 1) return variants[0]

  for (const variant of variants) {
    const cond = variant.disc
    if (!cond) continue

    if (cond.propAR && !item.armourAR) continue
    if (cond.propEV && !item.armourEV) continue
    if (cond.propES && !item.armourES) continue

    if (cond.mapTier) {
      if (!item.mapTier) continue
      if (cond.mapTier === 'W' && !(item.mapTier <= 5)) continue
      if (cond.mapTier === 'Y' && !(item.mapTier >= 6 && item.mapTier <= 10)) continue
      if (cond.mapTier === 'R' && !(item.mapTier >= 11)) continue
    }

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

    return variant
  }

  // it may happen that we don't find correct variant
  // i.e. corrupted implicit on Two-Stone Ring
  return undefined
}

function parseNamePlate(section: string[], d: Poe1Data): { ok: true; value: ParserState } | ParseFailure {
  const _$ = d.strings
  let line = section.shift()
  if (!line?.startsWith(_$.ITEM_CLASS)) {
    return err('item.parse_error')
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
    name: name,
    baseType: baseType,
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

  return ok(item)
}

function parseInfluence(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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

function parseCorrupted(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (section[0] === _$.CORRUPTED) {
    item.isCorrupted = true
    return 'SECTION_PARSED'
  } else if (section[0] === _$.UNMODIFIABLE) {
    item.isCorrupted = true
    item.isUnmodifiable = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseFoil(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.rarity !== ItemRarity.Unique) {
    return 'PARSER_SKIPPED'
  }
  if (section[0] === d.strings.FOIL_UNIQUE) {
    item.isFoil = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseUnidentified(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (section[0] === d.strings.UNIDENTIFIED) {
    item.isUnidentified = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseItemLevel(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  // POETH: у гадальной карты «Item Level: N» бывает только в тексте награды (а в RU там «Уровень: N»)
  if (item.category === ItemCategory.DivinationCard) return 'PARSER_SKIPPED'
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

function parseTalismanTier(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (section[0].startsWith(_$.TALISMAN_TIER)) {
    item.talismanTier = Number(section[0].slice(_$.TALISMAN_TIER.length))
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseVaalGem(section: string[], item: ParserState, d: Poe1Data): SectionParseResult {
  if (item.category !== ItemCategory.Gem) return 'PARSER_SKIPPED'

  if (section.length === 1) {
    const gemInfo = d.itemByTranslated('GEM', section[0])
    if (gemInfo) {
      item.vaalGem = gemInfo[0]
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseGem(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.Gem) {
    return 'PARSER_SKIPPED'
  }
  if (section[1]?.startsWith(_$.GEM_LEVEL)) {
    // "Level: 20 (Max)"
    item.gemLevel = parseInt(section[1].slice(_$.GEM_LEVEL.length), 10)

    parseQualityNested(section, item, d)

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseImbuedGem(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.category !== ItemCategory.Gem) return 'PARSER_SKIPPED'

  if (section.length === 1) {
    const support = d.statByMatchStr(section[0])
    if (!support) return 'SECTION_SKIPPED'

    item.newMods.push({
      info: { tags: [], type: ModifierType.Imbued },
      stats: [
        {
          stat: support.stat,
          translation: support.matcher
        }
      ]
    })
    item.imbuedGem = true

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseStackSize(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (
    item.rarity !== ItemRarity.Normal &&
    item.category !== ItemCategory.Currency &&
    item.category !== ItemCategory.DivinationCard
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
    item.stackSize = { value, max }

    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseSockets(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (section[0].startsWith(_$.SOCKETS)) {
    let sockets = section[0].slice(_$.SOCKETS.length).trimEnd()

    item.sockets = {
      white: sockets.split('W').length - 1,
      linked: undefined
    }

    sockets = sockets.replace(/[^ -]/g, '#')
    if (sockets === '#-#-#-#-#-#') {
      item.sockets.linked = 6
    } else if (sockets === '# #-#-#-#-#' || sockets === '#-#-#-#-# #' || sockets === '#-#-#-#-#') {
      item.sockets.linked = 5
    }
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseQualityNested(section: string[], item: ParsedItem, d: Poe1Data): boolean {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.QUALITY)) {
      // "Quality: +20% (augmented)"
      item.quality = parseInt(line.slice(_$.QUALITY.length), 10)
      return true
    }
  }
  return false
}

function parseMemoryStrandsNested(section: string[], item: ParsedItem, d: Poe1Data): boolean {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.MEMORY_STRANDS)) {
      item.memoryStrands = parseInt(line.slice(_$.MEMORY_STRANDS.length), 10)
      return true
    }
  }
  return false
}

function parseArmour(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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
    if (line.startsWith(_$.TAG_WARD)) {
      item.armourWARD = parseInt(line.slice(_$.TAG_WARD.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.BLOCK_CHANCE)) {
      item.armourBLOCK = parseInt(line.slice(_$.BLOCK_CHANCE.length), 10)
      isParsed = 'SECTION_PARSED'
      continue
    }
  }

  if (isParsed === 'SECTION_PARSED') {
    parseQualityNested(section, item, d)
    parseMemoryStrandsNested(section, item, d)
  }

  return isParsed
}

function parseWeapon(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.startsWith(_$.CRIT_CHANCE)) {
      item.weaponCRIT = parseFloat(line.slice(_$.CRIT_CHANCE.length))
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.ATTACK_SPEED)) {
      item.weaponAS = parseFloat(line.slice(_$.ATTACK_SPEED.length))
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.PHYSICAL_DAMAGE)) {
      item.weaponPHYSICAL = getRollOrMinmaxAvg(
        line
          .slice(_$.PHYSICAL_DAMAGE.length)
          .split('-')
          .map((str) => parseInt(str, 10))
      )
      isParsed = 'SECTION_PARSED'
      continue
    }
    if (line.startsWith(_$.ELEMENTAL_DAMAGE)) {
      item.weaponELEMENTAL = line
        .slice(_$.ELEMENTAL_DAMAGE.length)
        .split(', ')
        .map((element) => getRollOrMinmaxAvg(element.split('-').map((str) => parseInt(str, 10))))
        .reduce((sum, x) => sum + x, 0)

      isParsed = 'SECTION_PARSED'
      continue
    }
  }

  if (isParsed === 'SECTION_PARSED') {
    parseQualityNested(section, item, d)
    parseMemoryStrandsNested(section, item, d)
  }

  return isParsed
}

function parseAccessory(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (!JEWELLERY.has(item.category!) && item.category !== ItemCategory.Quiver) return 'PARSER_SKIPPED'

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (line.endsWith(VALUE_AUGMENTED)) {
      const found = tryParseTranslation(
        { string: line.slice(0, -VALUE_AUGMENTED.length), unscalable: true },
        ModifierType.Pseudo,
        undefined,
        d
      )
      if (found && found.stat.jewelleryQuality) {
        item.quality = found.roll!.value
        item.newMods.push({
          info: { tags: [], type: ModifierType.Pseudo },
          stats: [found]
        })
        isParsed = 'SECTION_PARSED'
      }
    }
  }

  if (parseMemoryStrandsNested(section, item, d)) {
    isParsed = 'SECTION_PARSED'
  }

  return isParsed
}

function parseLogbookArea(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.info.refName !== 'Expedition Logbook') return 'PARSER_SKIPPED'
  if (section.length < 3) return 'SECTION_SKIPPED'

  // skip Logbook Area line, parse Faction
  const faction = d.statByMatchStr(section[1])
  if (!faction || !faction.stat.ref.startsWith('Has Logbook Faction:')) return 'SECTION_SKIPPED'

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

  const { modType, lines } = parseModType(section.slice(2))
  for (const line of lines) {
    const found = d.statByMatchStr(line)
    // Area contains an Expedition Boss (#)
    if (found && found.stat.better === StatBetter.NotComparable) {
      areaMods.push({
        info: { tags: [], type: modType },
        stats: [
          {
            stat: found.stat,
            translation: found.matcher
          }
        ]
      })
    }
  }

  if (!item.logbookAreaMods) {
    item.logbookAreaMods = [areaMods]
  } else {
    item.logbookAreaMods.push(areaMods)
  }

  return 'SECTION_PARSED'
}

function parseMercenary(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.info.refName !== 'Mercenary Warrant') return 'PARSER_SKIPPED'

  for (const line of section) {
    if (line.startsWith(_$.MERCENARY_LEVEL)) {
      item.itemLevel = Number(line.slice(_$.MERCENARY_LEVEL.length))
    } else if (line.startsWith(_$.MERCENARY_BUILD)) {
      let buildInfo = d.itemByTranslated('MERCENARY_BUILD', line.slice(_$.MERCENARY_BUILD.length))
      if (!buildInfo) continue // POETH: неизвестный билд не роняет разбор

      if (typeof buildInfo[0].mercenaryBuild === 'string') {
        buildInfo = d.itemByRef('MERCENARY_BUILD', buildInfo[0].mercenaryBuild) ?? buildInfo
      }
      item.mercenaryBuild = buildInfo[0]
    }
  }

  if (item.mercenaryBuild) {
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseMercenaryGems(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.info.refName !== 'Mercenary Warrant') return 'PARSER_SKIPPED'

  const skill = tryParseTranslation({ string: section[0], unscalable: true }, ModifierType.Pseudo, ItemCategory.MercenaryWarrant, d)
  if (!skill) return 'SECTION_SKIPPED'

  const group: ParsedStat[] = [skill]

  for (const line of section.slice(1)) {
    const support = tryParseTranslation({ string: line, unscalable: true }, ModifierType.Pseudo, ItemCategory.MercenaryWarrant, d)
    if (support) {
      group.push(support)
    }
    if (!support || (support.stat.mercenary!.syntheticFamily && support.stat.mercenary!.tier !== 3)) {
      item.unknownModifiers.push({
        text: `${line} [${section[0]}]`,
        type: ModifierType.Pseudo
      })
    }
  }

  if (!item.mercenarySkills) {
    item.mercenarySkills = []
  }
  item.mercenarySkills.push(group)

  return 'SECTION_PARSED'
}

const MOD_RARITIES = new Set<ItemRarity | undefined>([ItemRarity.Normal, ItemRarity.Magic, ItemRarity.Rare, ItemRarity.Unique])

function parseModifiers(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (!MOD_RARITIES.has(item.rarity)) {
    return 'PARSER_SKIPPED'
  }

  const recognizedLine = section.find(
    (line) => line.endsWith(ENCHANT_LINE) || line.endsWith(SCOURGE_LINE) || isModInfoLine(line)
  )

  if (!recognizedLine) {
    return 'SECTION_SKIPPED'
  }

  if (isModInfoLine(recognizedLine)) {
    for (const { modLine, statLines } of groupLinesByMod(section)) {
      const modInfo = parseModInfoLine(modLine, _$)
      if (statLines[0] === _$.VEILED_PREFIX || statLines[0] === _$.VEILED_SUFFIX) {
        modInfo.type = ModifierType.Veiled
        item.isVeiled = true
      }
      // POETH: тип мода уже известен из строки `{ … }` — суффиксы `(implicit)`/`(crafted)`/… у строк статов
      // (если клиент их добавляет) отбрасываем, иначе стат не распознается
      const lines = statLines.map((line) => splitLineSuffix(line)[0])
      parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)
    }
  } else {
    const { modType, lines } = parseModType(section)
    const modInfo: ModifierInfo = {
      type: modType,
      tags: []
    }
    parseStatsFromMod(lines, item, { info: modInfo, stats: [] }, d)
  }

  return 'SECTION_PARSED'
}

// ---------------------------------------------------------------- POETH: обычный формат

const PLAIN_SUFFIXES: ReadonlyArray<[string, ModifierType]> = [
  [CRAFTED_LINE, ModifierType.Crafted],
  [FRACTURED_LINE, ModifierType.Fractured],
  [IMPLICIT_LINE, ModifierType.Implicit],
  [ENCHANT_LINE, ModifierType.Enchant],
  [SCOURGE_LINE, ModifierType.Scourge]
]

function splitLineSuffix(line: string): [text: string, type: ModifierType | undefined] {
  for (const [suffix, type] of PLAIN_SUFFIXES) {
    if (line.endsWith(suffix)) return [line.slice(0, -suffix.length), type]
  }
  return [line, undefined]
}

/** Сколько статов из строк распознаётся под типом мода (с учётом многострочных статов). */
function countResolved(lines: string[], type: ModifierType, item: ParsedItem, d: Poe1Data): number {
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
 * Обычный Ctrl+C и текст с трейда: явные моды идут без строк `{ … }`; в тексте с трейда у собственных
 * (implicit), крафтовых и расколотых модов нет и суффиксов. Секция модов — оставшаяся секция, где распознан
 * хотя бы один стат. Последняя такая секция — явные моды, предыдущие — собственные (или чары, если они
 * распознаются лучше). У неопознанных и обычных (Normal) предметов явных модов нет. Строки с суффиксом
 * `(crafted)`/`(fractured)`/`(implicit)`/… получают тип по суффиксу. Нераспознанные строки → unknownModifiers.
 */
function parsePlainModifiers(sections: string[][], item: ParserState, d: Poe1Data): string[][] {
  if (item.textFormat !== 'plain' || !MOD_RARITIES.has(item.rarity)) return []
  const _$ = d.strings
  const x = EXTRA_STRINGS[d.lang]

  const probe = [ModifierType.Explicit, ModifierType.Implicit, ModifierType.Enchant]
  const candidates = sections.filter((section) => {
    if (section[0].startsWith(x.REQUIREMENTS) || section[0].startsWith(x.NOTE)) return false
    const lines = section.map((l) => splitLineSuffix(l)[0])
    return probe.some((type) => countResolved(lines, type, item, d) > 0)
  })
  if (!candidates.length) return []

  const noExplicit = item.isUnidentified || item.rarity === ItemRarity.Normal
  candidates.forEach((section, i) => {
    const lines = section.map((l) => splitLineSuffix(l)[0])
    let defaultType: ModifierType
    if (!noExplicit && i === candidates.length - 1) {
      const asExplicit = countResolved(lines, ModifierType.Explicit, item, d)
      defaultType =
        asExplicit === 0 && countResolved(lines, ModifierType.Implicit, item, d) > 0
          ? ModifierType.Implicit
          : ModifierType.Explicit
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

function parseFracturedMarker(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (section.length === 1 && section[0] === EXTRA_STRINGS[d.lang].FRACTURED_ITEM) {
    item.isFractured = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseNote(section: string[], _item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (section.length === 1 && section[0].startsWith(EXTRA_STRINGS[d.lang].NOTE)) {
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseTimeless(item: ParserState) {
  const info = detectTimelessJewel(item)
  if (info) item.timeless = info
}

// ---------------------------------------------------------------- APT

function parseMirrored(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (section[0] === d.strings.MIRRORED) {
    item.isMirrored = true
    return 'SECTION_PARSED'
  }
  return 'SECTION_SKIPPED'
}

function parseSplit(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (section.length === 1) {
    if (section[0] === d.strings.SPLIT) {
      item.isSplit = true
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseFlask(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.category !== ItemCategory.Flask) return 'PARSER_SKIPPED'

  // the purpose of this parser is to "consume" flask buffs
  // so they are not recognized as modifiers

  let isParsed: SectionParseResult = 'SECTION_SKIPPED'

  for (const line of section) {
    if (d.strings.FLASK_CHARGES.test(line)) {
      isParsed = 'SECTION_PARSED'
      break
    }
  }

  if (isParsed === 'SECTION_PARSED') {
    parseQualityNested(section, item, d)
  }

  return isParsed
}

function parseTincture(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.category !== ItemCategory.Tincture) return 'PARSER_SKIPPED'

  if (parseQualityNested(section, item, d)) {
    return 'SECTION_PARSED'
  }

  return 'SECTION_SKIPPED'
}

function parseSentinelCharge(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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

function parseScryingOrb(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.info.refName !== 'Scrying Orb') return 'PARSER_SKIPPED'

  if (section.length === 1) {
    if (section[0].startsWith(_$.MAP_AREA)) {
      const areaName = section[0].slice(_$.MAP_AREA.length)
      const areaInfo = d.itemByTranslated('AREA', areaName)
      if (areaInfo) item.mapArea = areaInfo[0]
      return 'SECTION_PARSED'
    }
  }
  return 'SECTION_SKIPPED'
}

function parseEldritchItem(section: string[], d: Poe1Data): void {
  const _$ = d.strings
  // these don't have a dedicated section and are appended to last-ish one,
  // it can be Explicit Mods section, Corrupted, or Mirrored line.
  while (section.length) {
    const lastLine = section[section.length - 1]
    if (lastLine === _$.ITEM_EATER || lastLine === _$.ITEM_EXARCH) {
      section.pop()
    } else {
      break
    }
  }
}

function parseSynthesised(section: string[], item: ParserState, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (section.length === 1) {
    if (section[0] === _$.SECTION_SYNTHESISED) {
      item.isSynthesised = true
      if (item.baseType) {
        item.baseType = _$.ITEM_SYNTHESISED.exec(item.baseType)?.[1] ?? item.baseType
      } else {
        item.name = _$.ITEM_SYNTHESISED.exec(item.name)?.[1] ?? item.name
      }
      return 'SECTION_PARSED'
    }
  }

  return 'SECTION_SKIPPED'
}

function parseSuperior(item: ParserState, d: Poe1Data) {
  const _$ = d.strings
  if (
    item.rarity === ItemRarity.Normal ||
    (item.rarity === ItemRarity.Magic && item.isUnidentified) ||
    (item.rarity === ItemRarity.Rare && item.isUnidentified) ||
    (item.rarity === ItemRarity.Unique && item.isUnidentified)
  ) {
    if (_$.ITEM_SUPERIOR.test(item.name)) {
      item.name = _$.ITEM_SUPERIOR.exec(item.name)![1]
    }
  }
}

function parseFoulborn(item: ParserState, d: Poe1Data) {
  const _$ = d.strings
  if (item.rarity !== ItemRarity.Unique || item.isUnidentified) return

  if (_$.FOULBORN_NAME.test(item.name)) {
    item.name = _$.FOULBORN_NAME.exec(item.name)![1]
    item.isFoulborn = true
  }
}

function parseVestigial(item: ParserState, d: Poe1Data) {
  const _$ = d.strings
  if (item.rarity !== ItemRarity.Unique || !item.baseType) return

  if (_$.VESTIGIAL_NAME.test(item.baseType)) {
    item.baseType = _$.VESTIGIAL_NAME.exec(item.baseType)![1]
    item.isVestigial = true
  }
}

function parseCategoryByHelpText(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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

function parseHeistContract(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.HeistContract) return 'PARSER_SKIPPED'

  if (!parseAreaLevelNested(section, item, d)) {
    return 'SECTION_SKIPPED'
  }

  item.heistContract = {}

  for (const line of section) {
    const jobMatch = line.match(_$.HEIST_CONTRACT_JOB)
    if (jobMatch) {
      switch (jobMatch.groups!.job) {
        case _$.HEIST_JOB_LOCKPICKING:
          item.heistContract.requiredJob = 'Lockpicking'
          break
        case _$.HEIST_JOB_BRUTEFORCE:
          item.heistContract.requiredJob = 'Brute Force'
          break
        case _$.HEIST_JOB_PERCEPTION:
          item.heistContract.requiredJob = 'Perception'
          break
        case _$.HEIST_JOB_DEMOLITION:
          item.heistContract.requiredJob = 'Demolition'
          break
        case _$.HEIST_JOB_COUNTERTHAUMATURGY:
          item.heistContract.requiredJob = 'Counter-Thaumaturgy'
          break
        case _$.HEIST_JOB_TRAPDISARMAMENT:
          item.heistContract.requiredJob = 'Trap Disarmament'
          break
        case _$.HEIST_JOB_AGILITY:
          item.heistContract.requiredJob = 'Agility'
          break
        case _$.HEIST_JOB_DECEPTION:
          item.heistContract.requiredJob = 'Deception'
          break
        case _$.HEIST_JOB_ENGINEERING:
          item.heistContract.requiredJob = 'Engineering'
          break
      }
      item.heistContract.jobLevel = Number(jobMatch.groups!.level)
      continue
    }

    const targetMatch = line.match(_$.HEIST_CONTRACT_TARGET)
    if (targetMatch) {
      if (targetMatch[1] === _$.HEIST_TARGET_PRICELESS) {
        item.heistContract.targetValue = 'Priceless'
      }
      continue
    }
  }

  return 'SECTION_PARSED'
}

function parseHeistBlueprint(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.HeistBlueprint) return 'PARSER_SKIPPED'

  if (!parseAreaLevelNested(section, item, d)) {
    return 'SECTION_SKIPPED'
  }

  item.heistBlueprint = {}

  for (const line of section) {
    if (line.startsWith(_$.HEIST_BLUEPRINT_TARGET)) {
      const targetText = line.slice(_$.HEIST_BLUEPRINT_TARGET.length)
      switch (targetText) {
        case _$.HEIST_BLUEPRINT_ENCHANTS:
          item.heistBlueprint.target = 'Enchants'
          break
        case _$.HEIST_BLUEPRINT_GEMS:
          item.heistBlueprint.target = 'Gems'
          break
        case _$.HEIST_BLUEPRINT_REPLICAS:
          item.heistBlueprint.target = 'Replicas'
          break
        case _$.HEIST_BLUEPRINT_TRINKETS:
          item.heistBlueprint.target = 'Trinkets'
          break
      }
    } else if (line.startsWith(_$.HEIST_WINGS_REVEALED)) {
      const [revealed, total] = line.slice(_$.HEIST_WINGS_REVEALED.length).split('/')
      item.heistBlueprint.wingsRevealed = parseInt(revealed, 10)
      item.heistBlueprint.wingsTotal = parseInt(total, 10)
    }
  }

  return 'SECTION_PARSED'
}

function parseChart(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  const _$ = d.strings
  if (item.category !== ItemCategory.Chart) return 'PARSER_SKIPPED'

  if (!parseAreaLevelNested(section, item, d)) {
    return 'SECTION_SKIPPED'
  }

  const areaInfo = d.itemByTranslated('AREA', section[0])
  if (areaInfo) item.mapArea = areaInfo[0]

  for (const line of section) {
    if (parseAreaPropNested(line, item, d)) {
      // line parsed
    } else if (line.startsWith(_$.CHART_SULPHUR)) {
      item.chartSulphur = parseInt(line.slice(_$.CHART_SULPHUR.length), 10)
    }
  }

  return 'SECTION_PARSED'
}

function parseAreaLevelNested(section: string[], item: ParsedItem, d: Poe1Data): boolean {
  const _$ = d.strings
  for (const line of section) {
    if (line.startsWith(_$.AREA_LEVEL)) {
      item.areaLevel = Number(line.slice(_$.AREA_LEVEL.length))
      return true
    }
  }
  return false
}

function parseAreaLevel(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (
    item.info.refName !== 'Chronicle of Atzoatl' &&
    item.info.refName !== 'Expedition Logbook' &&
    item.info.refName !== 'Mirrored Tablet' &&
    item.info.refName !== 'Forbidden Tome'
  )
    return 'PARSER_SKIPPED'

  if (!parseAreaLevelNested(section, item, d)) {
    return 'SECTION_SKIPPED'
  }

  return 'SECTION_PARSED'
}

function parseAtzoatlRooms(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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
              string: state === IncursionRoom.Open ? found.matcher.string : `${_$.INCURSION_OBSTRUCTED} ${found.matcher.string}`
            },
            roll: { value: state, min: state, max: state, dp: false, unscalable: true }
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

function parseMirroredTablet(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
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

function parseFilledCoffin(section: string[], item: ParsedItem, d: Poe1Data): SectionParseResult {
  if (item.info.refName !== 'Filled Coffin') return 'PARSER_SKIPPED'
  if (!section.some((line) => line.endsWith(IMPLICIT_LINE))) return 'SECTION_SKIPPED'

  const { lines } = parseModType(section)
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

function parseStatsFromMod(lines: string[], item: ParsedItem, modifier: ParsedModifier, d: Poe1Data) {
  item.newMods.push(modifier)

  if (modifier.info.type === ModifierType.Veiled) {
    const found = modifier.info.name ? d.statByMatchStr(modifier.info.name) : undefined
    if (found) {
      modifier.stats.push({
        stat: found.stat,
        translation: found.matcher
      })
    } else {
      item.unknownModifiers.push({
        text: modifier.info.name ?? lines.join('\n'),
        type: modifier.info.type
      })
    }
    return
  }

  const statIterator = linesToStatStrings(lines, d.strings)
  let stat = statIterator.next()
  while (!stat.done) {
    const parsedStat = tryParseTranslation(stat.value, modifier.info.type, item.category, d)
    if (parsedStat) {
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
}

function augmentModifiers(item: ParsedItem) {
  for (const mod of item.newMods) {
    if (item.isSynthesised && mod.info.type === ModifierType.Implicit) {
      mod.info.mechanic ??= ModifierMechanic.Synthesised
    }

    for (const stat of mod.stats) {
      if (stat.roll?.generation !== 'legacy' || stat.roll.unscalable) continue

      if (item.rarity === ItemRarity.Unique && item.isCorrupted) {
        stat.roll.generation = 'volatile'
      } else if (
        item.rarity === ItemRarity.Rare &&
        item.isMirrored &&
        (item.category === ItemCategory.Ring || item.category === ItemCategory.Amulet)
      ) {
        stat.roll.generation = 'reflecting'
      }
    }
  }
}

/**
 * @deprecated
 */
function transformToLegacyModifiers(item: ParsedItem) {
  item.statsByType = sumStatsByModType(item.newMods)
}

function calcBasePercentile(item: ParsedItem) {
  const info = item.uniqueBase?.armour ?? item.info.armour
  if (!info) return

  // Base percentile is the same for all defences.
  // Using `AR/EV -> ES -> WARD` order to improve accuracy
  // of calculation (larger rolls = more precise).
  if (item.armourAR && info.ar) {
    item.basePercentile = calcPropPercentile(item.armourAR, info.ar, QUALITY_STATS.ARMOUR, item)
  } else if (item.armourEV && info.ev) {
    item.basePercentile = calcPropPercentile(item.armourEV, info.ev, QUALITY_STATS.EVASION, item)
  } else if (item.armourES && info.es) {
    item.basePercentile = calcPropPercentile(item.armourES, info.es, QUALITY_STATS.ENERGY_SHIELD, item)
  } else if (item.armourWARD && info.ward) {
    item.basePercentile = calcPropPercentile(item.armourWARD, info.ward, QUALITY_STATS.WARD, item)
  }
}

function calcDisenchantDust(item: ParsedItem) {
  if (!item.info.unique?.disenchantValue) return

  let increaseByFactors = 0

  // +50% per Influence Type
  increaseByFactors += item.influences.length * 50

  // +2% per 1% Item Quality
  if (item.quality) {
    increaseByFactors += item.quality * 2
  }

  // +50% per Corruption Implicit
  if (item.isCorrupted) {
    for (const mod of item.newMods) {
      if (mod.info.mechanic === ModifierMechanic.Corruption) {
        increaseByFactors += 50
      }
    }
  }

  const factorsMulti = (increaseByFactors + 100) / 100
  const term1 = 50 // ilvl 46 and below
  const term2 = 2 * (Math.min(Math.max(item.itemLevel!, 46), 68) - 46) // ilvl 47 to 68
  const term3 = Math.floor((3 * (Math.min(Math.max(item.itemLevel!, 46), 68) - 46)) / 11) // ilvl 47 to 68
  const term4 = 25 * (Math.min(Math.max(item.itemLevel!, 68), 84) - 68) // ilvl 69 to 84
  const totalMulti = 5 * (term1 + term2 + term3 + term4) * factorsMulti

  item.dustEquivalent = Math.floor(item.info.unique.disenchantValue * totalMulti)
}
