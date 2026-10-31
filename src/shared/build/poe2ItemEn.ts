// «Скопировать предмет по-английски» для PoE 2 (S61, С7 исследования; чистый модуль — tests/build/poe2ItemEn.test.ts).
// То же, что S51 у PoE 1 (itemEnCopy.ts + pobItemEn.ts), но на данных Exiled Exchange 2 (EN и RU, одни и те же stat ref)
// и парсере PoE 2: игрок с RU-клиентом жмёт клавишу — в буфер идёт английский текст для Path of Building 2 или
// англоязычного Discord. EN-клиент — текст как есть.
//
// Текст собирается как обычный Ctrl+C игры (без строк `{ … }` и роллов `(10-20)`):
//   - «Item Class:» — по таблице классов (poe2ItemClassEn), «Rarity:» — по строкам клиента (тот же ключ RARITY_*);
//   - имя и база — EN-ключи данных (`refName`); у редкой вещи имя — «POETH Item» (слов редких имён в данных нет);
//   - свойства (качество, броня, дух, путевой камень…) — та же строка клиента, тот же ключ: RU-префикс → EN-префикс,
//     значение как есть (пометки `(augmented)` игра пишет по-английски на обоих клиентах);
//   - требования — «Requires: Level N, X Str, Y Dex, Z Int» по разбору парсера;
//   - каждая строка мода — по стату: строка → стат данных языка (тот же разбор, что у окна цены) → английский шаблон того
//     же стата (тот же номер шаблона) → числа строки по порядку; пометки `(rune)`, `(desecrated)`, `(implicit)`… —
//     как есть (они языконезависимы); собственный мод под строкой `{ … }` — с пометкой `(implicit)`, как в обычном Ctrl+C;
//   - флаги (Corrupted, Mirrored, Sanctified, Unidentified…) — по строкам клиента.
// Непереведённая строка мода остаётся на месте как есть с пометкой « (untranslated)» (как S51). Секции без единого
// узнанного мода (описание уника, подсказки «ПКМ…», описание камня) не переносятся. Заметка цены не переносится.

import type { Poe2Data } from '../poe2/data/Poe2Data'
import type { StatMatcher, Stat, TranslationDict } from '../poe2/data/interfaces'
import { parseClipboard } from '../poe2/parser/Parser'
import { ItemCategory } from '../poe2/parser/meta'
import { ModifierType } from '../poe2/parser/modifiers'
import { ItemRarity, type ParsedItem } from '../poe2/parser/ParsedItem'
import { matchStatLine } from '../poe2/parser/stat-translations'
import type { ItemLang } from '../types'
import type { ItemEnCopy } from './itemEnCopy'
import { POB_ITEM_TEXT_MAX, UNTRANSLATED_MARK, type PobItemEn } from './pobItemEn'
import { poe2ItemClassEn } from './poe2ItemClassEn'

const SEP = '--------'
const LINES_MAX = 200
/** Самый длинный стат данных — несколько строк (флаконы, плитки); как у S44 */
const MULTILINE_MAX = 7
const NUM = '([+-]?\\d+(?:[.,]\\d+)?)'

/** «+40(36-60)» расширенного Ctrl+C → «+40». */
const stripRolls = (s: string): string => s.replace(/(\d)\([+-]?\d+(?:[.,]\d+)?-[+-]?\d+(?:[.,]\d+)?\)/g, '$1')
const isHeader = (l: string): boolean => /^\{.*\}$/.test(l)
const isReminder = (l: string): boolean => /^\(.*\)$/.test(l)
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Пометки типа мода в конце строки — игра пишет их по-английски на обоих клиентах (как advanced-mod-desc). */
const TAGS: ReadonlyArray<[string, ModifierType]> = [
  [' (implicit)', ModifierType.Implicit],
  [' (enchant)', ModifierType.Enchant],
  [' (rune)', ModifierType.Augment],
  [' (added rune)', ModifierType.AddedAugment],
  [' (fractured)', ModifierType.Fractured],
  [' (crafted)', ModifierType.Crafted],
  [' (desecrated)', ModifierType.Desecrated],
  [' (scourge)', ModifierType.Scourge]
]
/** Без пометки и без строки `{ … }` — пробуем по очереди (реликвии Испытания Сехем — моды sanctum). */
const PLAIN_TYPES = [ModifierType.Explicit, ModifierType.Implicit, ModifierType.Enchant, ModifierType.Augment, ModifierType.Sanctum]

/** Строки-свойства «ПРЕФИКС значение»: тот же ключ строк клиента в EN. */
const PROP_KEYS = [
  'QUALITY',
  'ARMOUR',
  'EVASION',
  'ENERGY_SHIELD',
  'RUNIC_WARD',
  'BLOCK_CHANCE',
  'BASE_SPIRIT',
  'PHYSICAL_DAMAGE',
  'ELEMENTAL_DAMAGE',
  'LIGHTNING_DAMAGE',
  'COLD_DAMAGE',
  'FIRE_DAMAGE',
  'CRIT_CHANCE',
  'ATTACK_SPEED',
  'RELOAD_SPEED',
  'CHARM_SLOTS',
  'STACK_SIZE',
  'SOCKETS',
  'GEM_LEVEL',
  'AREA_LEVEL',
  'WAYSTONE_TIER',
  'MAP_TIER',
  'WAYSTONE_REVIVES',
  'WAYSTONE_PACK_SIZE',
  'WAYSTONE_MAGIC_MONSTERS',
  'WAYSTONE_RARE_MONSTERS',
  'WAYSTONE_DROP_CHANCE',
  'WAYSTONE_RARITY',
  'WAYSTONE_MONSTER_RARITY',
  'WAYSTONE_EFFECTIVENESS',
  'ITEM_LEVEL'
] as const

/** Флаги — строка целиком (Corrupted, Mirrored…). */
const FLAG_KEYS = ['CORRUPTED', 'DOUBLE_CORRUPTED', 'MIRRORED', 'SANCTIFIED', 'UNMODIFIABLE', 'FRACTURED_ITEM'] as const

const RARITY_KEYS = ['RARITY_NORMAL', 'RARITY_MAGIC', 'RARITY_RARE', 'RARITY_UNIQUE', 'RARITY_GEM', 'RARITY_CURRENCY', 'RARITY_QUEST'] as const

type Strings = TranslationDict & Record<string, unknown>

function str(d: TranslationDict, key: string): string | undefined {
  const v = (d as Strings)[key]
  return typeof v === 'string' && v ? v : undefined
}

/** Регулярка строки по шаблону стата: # → число, обобщённое RU мн. число «секунд(-ы)» → любое окончание. */
function templateRe(tpl: string): RegExp {
  let src = ''
  for (const [i, part] of tpl.split('#').entries()) {
    if (i) src += NUM
    let last = 0
    let piece = ''
    for (const m of part.matchAll(/([A-Za-zА-Яа-яЁё]+)\((-[A-Za-zА-Яа-яЁё]+(?:,\s*-[A-Za-zА-Яа-яЁё]+)*)\)/g)) {
      const word = m[1]
      piece += escapeRe(part.slice(last, m.index)) + escapeRe(word.slice(0, Math.max(1, word.length - 2))) + '[A-Za-zА-Яа-яЁё]*'
      last = m.index! + m[0].length
    }
    src += piece + escapeRe(part.slice(last))
  }
  return new RegExp(`^${src}$`)
}

/** Тот же стат в EN-данных и его шаблон: тот же номер; если списки разной длины — по знаку и значению. */
function enMatcher(src: Stat, used: StatMatcher, en: Poe2Data): StatMatcher | null {
  const stat = en.statByRef(src.ref)
  if (!stat || !stat.matchers.length) return null
  const holes = (m: StatMatcher): number => m.string.split('#').length - 1
  const index = src.matchers.indexOf(used)
  if (index >= 0 && src.matchers.length === stat.matchers.length) return stat.matchers[index]
  return (
    stat.matchers.find((m) => !!m.negate === !!used.negate && m.value === used.value && holes(m) === holes(used)) ??
    stat.matchers.find((m) => !!m.negate === !!used.negate && holes(m) === holes(used)) ??
    null
  )
}

/** Строка мода на языке `src` (без пометки типа) → EN; не вышло — null. */
export function poe2ModLineToEn(line: string, type: ModifierType, src: Poe2Data, en: Poe2Data, category?: ItemCategory): string | null {
  let s = stripRolls(line).trim()
  if (s.endsWith(src.strings.UNSCALABLE_VALUE)) s = s.slice(0, -src.strings.UNSCALABLE_VALUE.length)
  if (!s) return null
  let found: ReturnType<typeof matchStatLine>
  try {
    found = matchStatLine(s, src, type, category)
  } catch {
    return null
  }
  if (!found) return null
  const target = enMatcher(found.stat, found.translation, en)
  if (!target) return null
  const holes = target.string.split('#').length - 1
  let nums: string[] = []
  if (holes) {
    // шаблон, по которому нашёлся стат (обычный или расширенный), а не тот, что первым в списке
    const tpls = [found.translation.string, found.translation.advanced].filter((x): x is string => !!x)
    for (const tpl of tpls) {
      const m = templateRe(tpl).exec(s)
      if (m && m.length - 1 === holes) {
        nums = m.slice(1).map((n) => n.replace(',', '.'))
        break
      }
    }
    if (nums.length !== holes) return null
  }
  let k = 0
  return target.string.replace(/#/g, () => nums[k++]).trim()
}

function sections(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n--------\n/)
    .map((sec) =>
      sec
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
}

/**
 * Тип мода по строке `{ … }` — по началу строки клиента: собственное, чары, а у префиксов и суффиксов — слово перед
 * ними («Расколотое», «Очернённое», «Ремесленное»); остальное — явные.
 */
function headerType(line: string, d: Poe2Data): ModifierType {
  const text = line.slice(1, -1).trim()
  const starts = (key: string): boolean => {
    const s = str(d.strings, key)
    return !!s && text.startsWith(s)
  }
  if (starts('IMPLICIT_MODIFIER') || starts('CORRUPTED_IMPLICIT')) return ModifierType.Implicit
  if (starts('ENCHANT_MODIFIER')) return ModifierType.Enchant
  if (starts('FRACTURED_MODIFIER')) return ModifierType.Fractured
  if (starts('DESECRATED_MODIFIER')) return ModifierType.Desecrated
  if (starts('CRAFTED_MODIFIER')) return ModifierType.Crafted
  return ModifierType.Explicit
}

/** Пометка строки в обычном Ctrl+C по типу из строки `{ … }` (у явных — без пометки). */
const HEADER_TAG: Partial<Record<ModifierType, string>> = {
  [ModifierType.Implicit]: ' (implicit)',
  [ModifierType.Enchant]: ' (enchant)',
  [ModifierType.Fractured]: ' (fractured)',
  [ModifierType.Desecrated]: ' (desecrated)',
  [ModifierType.Crafted]: ' (crafted)'
}

type ModLine = { text: string; tag: string; type: ModifierType | undefined; header: boolean }

/** Строки секции модов → EN с пометками; null — в секции нет ни одного мода (описание, подсказка). */
function modSection(sec: string[], item: ParsedItem, src: Poe2Data, en: Poe2Data, untranslated: string[]): string[] | null {
  const lines: ModLine[] = []
  let current: ModifierType | undefined
  let anyHeader = false
  for (const raw of sec) {
    if (isHeader(raw)) {
      anyHeader = true
      current = headerType(raw, src)
      continue
    }
    if (isReminder(raw)) continue
    let text = raw
    let tag = ''
    let type = current
    for (const [suffix, t] of TAGS) {
      if (text.endsWith(suffix)) {
        text = text.slice(0, -suffix.length)
        tag = suffix
        type = t
        break
      }
    }
    lines.push({ text, tag, type, header: current !== undefined })
  }
  const out: Array<{ en: string | null; l: ModLine }> = []
  for (let i = 0; i < lines.length; i++) {
    const types = lines[i].type ? [lines[i].type!] : PLAIN_TYPES
    let found: string | null = null
    let end = i
    for (let j = i; j < Math.min(lines.length, i + MULTILINE_MAX) && !found; j++) {
      if (lines[j].type !== lines[i].type || lines[j].tag !== lines[i].tag) break
      const joined = lines
        .slice(i, j + 1)
        .map((l) => l.text)
        .join('\n')
      for (const t of types) {
        found = poe2ModLineToEn(joined, t, src, en, item.category)
        // строка уже по-английски (в RU-данных EE2 нет этого стата, игра показала английский) — узнаём EN-данными
        if (!found && !/[А-Яа-яЁё]/.test(joined)) found = poe2ModLineToEn(joined, t, en, en, item.category)
        if (found) break
      }
      end = j
    }
    if (found) {
      out.push({ en: found, l: lines[i] })
      i = end
    } else out.push({ en: null, l: lines[i] })
  }
  if (!anyHeader && !out.some((x) => x.en)) return null
  const res: string[] = []
  for (const { en: e, l } of out) {
    // собственный, расколотый… мод под строкой `{ … }` — в обычном Ctrl+C игры с пометкой (implicit), (fractured)…
    const tag = l.tag || (l.header && l.type ? (HEADER_TAG[l.type] ?? '') : '')
    if (e) {
      for (const part of e.split('\n')) res.push(part + tag)
    } else if (!/[А-Яа-яЁё]/.test(l.text)) {
      // строка и так по-английски (нового стата нет ни в одних данных) — как есть, без пометки
      res.push(stripRolls(l.text) + tag)
    } else {
      untranslated.push(l.text)
      res.push(stripRolls(l.text) + tag + UNTRANSLATED_MARK)
    }
  }
  return res
}

/** Свойство «ПРЕФИКС значение» → EN-префикс; значение как есть (десятичная запятая → точка). */
function propLine(line: string, src: Poe2Data, en: Poe2Data): string | null {
  for (const key of PROP_KEYS) {
    const from = str(src.strings, key)
    const to = str(en.strings, key)
    if (from && to && line.startsWith(from)) return to + line.slice(from.length).replace(/(\d),(\d)/g, '$1.$2')
  }
  return null
}

function flagLine(line: string, src: Poe2Data, en: Poe2Data): string | null {
  for (const key of FLAG_KEYS) {
    const from = str(src.strings, key)?.trim()
    const to = str(en.strings, key)?.trim()
    if (from && to && line === from) return to
  }
  const unid = (src.strings as Strings).UNIDENTIFIED
  if (unid instanceof RegExp && unid.test(line)) return 'Unidentified'
  return null
}

function rarityEn(item: ParsedItem, src: Poe2Data, en: Poe2Data, header: string[]): string {
  const line = header.find((l) => l.startsWith(src.strings.RARITY))
  const value = line?.slice(src.strings.RARITY.length).trim()
  for (const key of RARITY_KEYS) {
    if (value && str(src.strings, key) === value) return str(en.strings, key) ?? value
  }
  return item.rarity ?? 'Normal'
}

/** Требования одной строкой, как в PoE 2: «Requires: Level 65, 121 Str». */
function requiresLine(item: ParsedItem): string | null {
  const r = item.requires
  if (!r) return null
  const parts = [r.level ? `Level ${r.level}` : '', r.str ? `${r.str} Str` : '', r.dex ? `${r.dex} Dex` : '', r.int ? `${r.int} Int` : ''].filter(Boolean)
  return parts.length ? `Requires: ${parts.join(', ')}` : null
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '’,.:\-()]{0,119}$/u

/**
 * Разобранный предмет PoE 2 (RU) → английский текст для буфера. null — не собрать (нет EN-имени базы, слишком длинно).
 * EN-предмет — текст как есть.
 */
export function poe2ItemEnText(item: ParsedItem, src: Poe2Data | null, en: Poe2Data | null): PobItemEn | null {
  if (item.lang === 'en') {
    const text = item.rawText.replace(/\r\n?/g, '\n').trim()
    return text && text.length <= POB_ITEM_TEXT_MAX ? { text, untranslated: [] } : null
  }
  if (!src || !en || src.lang !== item.lang || en.lang !== 'en') return null

  const unique = item.info.namespace === 'UNIQUE'
  const base = (unique ? item.info.unique?.base : undefined) ?? item.info.refName
  if (!base || !NAME_RE.test(base)) return null

  const secs = sections(item.rawText)
  const header = secs[0] ?? []
  const first = header[0] ?? ''
  const srcClass = first.startsWith(src.strings.ITEM_CLASS) ? first.slice(src.strings.ITEM_CLASS.length) : ''
  const head = [`Item Class: ${poe2ItemClassEn(srcClass, item.category)}`, `Rarity: ${rarityEn(item, src, en, header)}`]
  if (!item.isUnidentified) {
    if (unique) head.push(item.info.refName)
    else if (item.rarity === ItemRarity.Rare) head.push('POETH Item')
  }
  head.push(base)

  const parts: string[][] = [head]
  const untranslated: string[] = []
  const gem = item.category === ItemCategory.Gem || item.category === ItemCategory.SkillGem || item.category === ItemCategory.SupportGem
  const ilvlAt = secs.findIndex((s) => s.some((l) => l.startsWith(src.strings.ITEM_LEVEL)))
  const reqPrefix = str(src.strings, 'REQUIRES') ?? '\u0000'
  const reqOld = src.strings.REQUIREMENTS

  secs.slice(1).forEach((sec, k) => {
    const i = k + 1
    // заметка цены — не переносим
    if (sec.some((l) => l.startsWith(src.strings.PRICE_NOTE))) return
    if (sec[0]?.startsWith(reqPrefix) || sec[0] === reqOld || sec[0] === `${reqOld}:`) {
      const r = requiresLine(item)
      if (r) parts.push([r])
      return
    }
    const props = sec.map((l) => propLine(l, src, en))
    if (props.every((p) => p !== null)) {
      parts.push(props as string[])
      return
    }
    const flags = sec.map((l) => flagLine(l, src, en))
    if (flags.every((f) => f !== null)) {
      parts.push(flags as string[])
      return
    }
    // моды — только после «Уровень предмета» (до него — свойства и описание); у камня — описание умения, не моды
    if (gem || (ilvlAt >= 0 && i <= ilvlAt)) return
    const mods = modSection(sec, item, src, en, untranslated)
    if (mods && mods.length) parts.push(mods)
  })

  const text = parts.map((p) => p.join('\n')).join(`\n${SEP}\n`)
  if (text.length > POB_ITEM_TEXT_MAX || text.split('\n').length > LINES_MAX) return null
  return { text, untranslated: untranslated.slice(0, 40) }
}

/**
 * Текст предмета на языке клиента → английский текст для буфера (как itemEnCopy S51, тот же результат и уведомления).
 * `src` — данные PoE 2 языка предмета, `en` — английские (для EN-клиента не нужны).
 */
export function poe2ItemEnCopy(raw: string, lang: ItemLang, src: Poe2Data | null, en: Poe2Data | null): ItemEnCopy {
  if (lang === 'en') {
    if (!raw.trim() || raw.length > POB_ITEM_TEXT_MAX) return { ok: false, reason: 'build' }
    return { ok: true, mode: 'as-is', text: raw, untranslated: [] }
  }
  if (!src || !en || src.lang !== lang || en.lang !== 'en') return { ok: false, reason: 'data' }
  const parsed = parseClipboard(raw, src)
  if (!parsed.ok) return { ok: false, reason: 'parse' }
  const built = poe2ItemEnText(parsed.value, src, en)
  if (!built) return { ok: false, reason: 'build' }
  return { ok: true, mode: 'translated', text: built.text, untranslated: built.untranslated }
}
