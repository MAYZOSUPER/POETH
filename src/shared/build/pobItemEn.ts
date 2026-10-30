// Текст предмета для движка PoB (S44; чистый модуль: окно цены, tests/build/pobItemEn.test.ts).
// PoB понимает только английский текст предмета. EN-клиент — текст как есть (PoB сам читает Ctrl+C игры, в том числе
// расширенный). RU-клиент — предмет собирается заново на английском:
//   - имя и база — EN-ключи APT (`refName`), редкость, качество, требования, гнёзда, уровень предмета, флаги
//     (осквернён, отражён, расколот, синтезирован, влияния) — из разбора парсера;
//   - каждая строка мода — по стату: строка RU → стат данных APT (тот же парсер, что у окна цены) → английский шаблон
//     того же стата (тот же номер шаблона: «повышение/снижение» сохраняются) → числа строки по порядку;
//   - тип мода (собственное, крафт, расколотое, чары) — по заголовку `{ … }` расширенного Ctrl+C или по пометке
//     строки `(implicit)`/`(crafted)`/…; в EN — пометкой, как в обычном Ctrl+C игры (её понимает PoB).
// Строки, которые перевести не удалось, в текст не идут и возвращаются списком — окно честно говорит, что расчёт
// их не учёл. Секции без единого узнанного мода (свойства, описание уника, подсказки) пропускаются.
// S51 («Скопировать по-английски», `clipboard`): тот же текст, но как Ctrl+C игры — строка «Item Class:», редкость
// камней, валюты и карт, неопознанные вещи, уровень камня, тир карты, стопка; непереведённые строки остаются на своём
// месте как есть с пометкой « (untranslated)» (PoB снимает такие пометки, строка у него — «не поддерживается»).

import type { Poe1Data } from '../poe1/data'
import { pluralMatcherSource } from '../poe1/data/Poe1Data'
import { parseModInfoLine } from '../poe1/parser/advanced-mod-desc'
import { ItemCategory } from '../poe1/parser/meta'
import { ModifierType } from '../poe1/parser/modifiers'
import { ItemInfluence, ItemRarity, type ParsedItem } from '../poe1/parser/ParsedItem'
import { matchStatLine } from '../poe1/parser/stat-translations'
import type { Stat, StatMatcher } from '../poe1/data/interfaces'
import { equipReq } from './equipCompare'
import { itemClassEn } from './itemClassEn'

export interface PobItemEn {
  /** текст для PoB (EN) */
  text: string
  /** строки модов, которые не перевелись (на языке клиента) */
  untranslated: string[]
}

export interface PobItemTextOptions {
  /** S51: текст для буфера — как Ctrl+C игры, непереведённые строки на месте с пометкой (см. шапку модуля) */
  clipboard?: boolean
}

/** Пометка непереведённой строки в тексте для буфера (S51). */
export const UNTRANSLATED_MARK = ' (untranslated)'

/** Текст одного предмета для движка: больше — не считаем (исследование §11). */
export const POB_ITEM_TEXT_MAX = 16 * 1024
const LINES_MAX = 200
/** Самый длинный стат данных APT — 7 строк («Every 5 seconds, gain one of the following…»). */
const MULTILINE_MAX = 7

const SEP = '--------'
const NUM = '([+-]?\\d+(?:\\.\\d+)?)'
/** «+40(36-60)» расширенного Ctrl+C → «+40». */
const stripRolls = (s: string): string => s.replace(/(\d)\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/g, '$1')

const SUFFIXES: Array<[string, ModifierType]> = [
  [' (implicit)', ModifierType.Implicit],
  [' (crafted)', ModifierType.Crafted],
  [' (fractured)', ModifierType.Fractured],
  [' (enchant)', ModifierType.Enchant],
  [' (scourge)', ModifierType.Scourge]
]
const EN_SUFFIX: Partial<Record<ModifierType, string>> = {
  [ModifierType.Implicit]: ' (implicit)',
  [ModifierType.Crafted]: ' (crafted)',
  [ModifierType.Fractured]: ' (fractured)',
  [ModifierType.Enchant]: ' (enchant)',
  [ModifierType.Scourge]: ' (scourge)'
}
const MATCH_TYPES = [ModifierType.Explicit, ModifierType.Implicit, ModifierType.Enchant, ModifierType.Crafted, ModifierType.Fractured]

const INFLUENCE_EN: Record<ItemInfluence, string> = {
  [ItemInfluence.Shaper]: 'Shaper Item',
  [ItemInfluence.Elder]: 'Elder Item',
  [ItemInfluence.Crusader]: 'Crusader Item',
  [ItemInfluence.Hunter]: 'Hunter Item',
  [ItemInfluence.Redeemer]: 'Redeemer Item',
  [ItemInfluence.Warlord]: 'Warlord Item'
}

/** Тот же стат в EN-данных и его шаблон: тот же номер; если списки шаблонов разной длины — по знаку и значению. */
function enMatcher(src: Stat, used: StatMatcher, en: Poe1Data): StatMatcher | null {
  const s = en.statByRefV2(src.ref)
  const stat = s ? ('stats' in s ? s.stats.find((x) => x.ref === src.ref) : s) : undefined
  if (!stat || !stat.matchers.length) return null
  const index = src.matchers.indexOf(used)
  const holes = (m: StatMatcher): number => m.string.split('#').length - 1
  if (index >= 0 && src.matchers.length === stat.matchers.length) return stat.matchers[index]
  return (
    stat.matchers.find((m) => !!m.negate === !!used.negate && m.value === used.value && holes(m) === holes(used)) ??
    stat.matchers.find((m) => !!m.negate === !!used.negate && holes(m) === holes(used)) ??
    null
  )
}

/** Строка мода на языке `src` → EN (без пометки типа); не вышло — null. */
export function modLineToEn(line: string, src: Poe1Data, en: Poe1Data, category?: ParsedItem['category']): string | null {
  let s = stripRolls(line).trim()
  if (s.endsWith(src.strings.UNSCALABLE_VALUE)) s = s.slice(0, -src.strings.UNSCALABLE_VALUE.length)
  if (!s) return null
  let found: ReturnType<typeof matchStatLine>
  try {
    found = matchStatLine(s, src, MATCH_TYPES, category)
  } catch {
    return null
  }
  if (!found) return null
  const tpl = found.translation.string
  // RU-шаблон с обобщённым мн. числом («на # секунд(-ы)») ↔ «на 4 секунды» текста — как поиск стата в данных
  const m = new RegExp(`^${tpl.split('#').map(pluralMatcherSource).join(NUM)}$`).exec(s)
  const nums = m ? m.slice(1) : []
  if (nums.length !== tpl.split('#').length - 1) return null
  const target = enMatcher(found.stat, found.translation, en)
  if (!target || target.string.split('#').length - 1 !== nums.length) return null
  let k = 0
  return target.string.replace(/#/g, () => nums[k++]).trim()
}

function sections(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n--------\n/)
    .map((s) =>
      s
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
}

const isReminder = (l: string): boolean => /^\(.*\)$/.test(l)
const isHeader = (l: string): boolean => /^\{.*\}$/.test(l)

/**
 * Переведённые моды по видам (в порядке текста) и непереведённые строки (EN → EN — нормализация для тестов).
 * clipboard (S51) — непереведённые строки ещё и остаются среди модов своего вида, как есть, с пометкой; в обычном
 * формате (текст с трейда, старый Ctrl+C: ни одной строки `{ … }`, у собственных модов может не быть и суффикса) вид
 * секции — по её месту, как у парсера APT (parsePlainModifiers): последняя секция модов — явные (у обычных и
 * неопознанных вещей явных нет), предыдущие — собственные.
 */
export function pobModLines(
  item: ParsedItem,
  src: Poe1Data,
  en: Poe1Data,
  clipboard = false
): { enchant: string[]; implicit: string[]; explicit: string[]; untranslated: string[] } {
  const out = { enchant: [] as string[], implicit: [] as string[], explicit: [] as string[], untranslated: [] as string[] }
  // многострочный стат — построчно, пометка вида у каждой строки (как в игре)
  const push = (text: string, type: ModifierType): void => {
    const to = type === ModifierType.Enchant ? out.enchant : type === ModifierType.Implicit ? out.implicit : out.explicit
    for (const line of text.split('\n')) to.push(line + (EN_SUFFIX[type] ?? ''))
  }
  type Line = { text: string; type: ModifierType | undefined; en: string | null }
  const modSecs: Array<{ header: boolean; lines: Line[] }> = []
  const secs = sections(item.rawText).slice(1)
  // моды в игре идут после «Уровень предмета: N»; до него — свойства (у флаконов там и статы основы: «+40% к
  // сопротивлению молнии», «Длится 8 сек.»), они не моды
  const ilvl = secs.findIndex((s) => s.some((l) => l.startsWith(src.strings.ITEM_LEVEL)))
  for (const sec of secs.slice(ilvl + 1)) {
    const lines: Array<Omit<Line, 'en'>> = []
    let current = ModifierType.Explicit
    let header = false
    for (const raw of sec) {
      if (isHeader(raw)) {
        header = true
        try {
          current = parseModInfoLine(raw, src.strings).type
        } catch {
          current = ModifierType.Explicit
        }
        continue
      }
      if (isReminder(raw)) continue
      let text = raw
      let type = header ? current : undefined
      for (const [suffix, t] of SUFFIXES) {
        if (text.endsWith(suffix)) {
          text = text.slice(0, -suffix.length)
          type = t
          break
        }
      }
      lines.push({ text, type })
    }
    // стат на нескольких строках (флаконы, карты, timeless): как linesToStatStrings парсера APT — сначала строка
    // одна, потом вместе со следующими того же вида
    const done: Line[] = []
    for (let i = 0; i < lines.length; i++) {
      let found: string | null = null
      let end = i
      for (let j = i; j < Math.min(lines.length, i + MULTILINE_MAX) && !found; j++) {
        if (lines[j].type !== lines[i].type) break
        found = modLineToEn(
          lines
            .slice(i, j + 1)
            .map((l) => l.text)
            .join('\n'),
          src,
          en,
          item.category
        )
        end = j
      }
      if (!found) done.push({ ...lines[i], en: null })
      else {
        done.push({ text: lines[i].text, type: lines[i].type, en: found })
        i = end
      }
    }
    // секция без единого мода — свойства, требования, описание уника: не наша
    if (!header && !done.some((l) => l.en)) continue
    modSecs.push({ header, lines: done })
  }
  const plain = clipboard && !modSecs.some((s) => s.header)
  const noExplicit = item.isUnidentified || item.rarity === ItemRarity.Normal
  modSecs.forEach((sec, i) => {
    const fallback = plain && (noExplicit || i < modSecs.length - 1) ? ModifierType.Implicit : ModifierType.Explicit
    for (const l of sec.lines) {
      if (!l.en) {
        out.untranslated.push(l.text)
        if (!clipboard) continue
      }
      push(l.en ?? l.text + UNTRANSLATED_MARK, l.type ?? fallback)
    }
  })
  // моды, которые парсер APT не узнал, но которых нет среди непереведённых (секция целиком из неузнанных)
  for (const u of item.unknownModifiers) {
    const t = u.text.trim()
    if (!t || out.untranslated.includes(t)) continue
    out.untranslated.push(t)
    if (clipboard) push(t + UNTRANSLATED_MARK, u.type)
  }
  return out
}

function propLine(item: ParsedItem, prefix: string): string | null {
  for (const l of item.rawText.replace(/\r\n?/g, '\n').split('\n')) {
    const t = l.trim()
    if (t.startsWith(prefix)) return t.slice(prefix.length).trim()
  }
  return null
}

/** Редкость камня, валюты и карты в тексте игры (у разбора у них нет `rarity`). */
const CATEGORY_RARITY: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Gem]: 'Gem',
  [ItemCategory.Currency]: 'Currency',
  [ItemCategory.DivinationCard]: 'Divination Card'
}

/**
 * Предмет из окна цены → текст для PoB. null — не собрать (нет EN-имени базы, неопознан, слишком длинный текст).
 * `src` — данные языка предмета, `en` — английские данные (для EN-предмета не нужны).
 * `clipboard` (S51) — текст для буфера: неопознанные вещи тоже собираются.
 */
export function pobItemText(item: ParsedItem, src: Poe1Data | null, en: Poe1Data | null, opts: PobItemTextOptions = {}): PobItemEn | null {
  const clip = !!opts.clipboard
  if (item.isUnidentified && !clip) return null
  if (item.lang === 'en') {
    const text = item.rawText.replace(/\r\n?/g, '\n').trim()
    return text && text.length <= POB_ITEM_TEXT_MAX ? { text, untranslated: [] } : null
  }
  if (!src || !en || src.lang !== item.lang) return null

  const unique = item.rarity === ItemRarity.Unique
  const base = (unique ? item.uniqueBase?.refName : undefined) ?? item.info.refName
  if (!base || !/^[\p{L}\p{N}][\p{L}\p{N} '’,.:\-()]{0,99}$/u.test(base)) return null
  const rarity = item.rarity ?? ItemRarity.Normal

  const head: string[] = []
  if (clip) {
    const first = item.rawText.replace(/^﻿/, '').trimStart().split(/\r?\n/, 1)[0].trim()
    const srcClass = first.startsWith(src.strings.ITEM_CLASS) ? first.slice(src.strings.ITEM_CLASS.length) : ''
    head.push(`Item Class: ${itemClassEn(srcClass, item.category, base)}`)
    head.push(`Rarity: ${item.rarity ?? (item.category && CATEGORY_RARITY[item.category]) ?? rarity}`)
  } else head.push(`Rarity: ${rarity}`)
  // у неопознанной вещи в игре только база
  if (!item.isUnidentified) {
    if (unique) head.push(item.info.refName)
    else if (rarity === ItemRarity.Rare) head.push('POETH Item')
  }
  head.push(base)

  const parts: string[][] = [head]
  // качество и защита вещи как в игре: по «Energy Shield: 134» PoB вычисляет разброс базы (у брони он свой у каждой
  // вещи) — без этих строк он взял бы своё значение базы
  const props = [
    clip && item.stackSize ? `Stack Size: ${item.stackSize.value}/${item.stackSize.max}` : '',
    clip && item.mapTier ? `Map Tier: ${item.mapTier}` : '',
    clip && item.gemLevel ? `Level: ${item.gemLevel}` : '',
    item.quality ? `Quality: +${item.quality}%` : '',
    item.armourAR ? `Armour: ${item.armourAR}` : '',
    item.armourEV ? `Evasion Rating: ${item.armourEV}` : '',
    item.armourES ? `Energy Shield: ${item.armourES}` : '',
    item.armourWARD ? `Ward: ${item.armourWARD}` : ''
  ].filter(Boolean)
  if (props.length) parts.push(props)
  const req = equipReq(item.rawText)
  const reqLines = [
    req.level ? `Level: ${req.level}` : '',
    req.str ? `Str: ${req.str}` : '',
    req.dex ? `Dex: ${req.dex}` : '',
    req.int ? `Int: ${req.int}` : ''
  ].filter(Boolean)
  if (reqLines.length) parts.push(['Requirements:', ...reqLines])
  const sockets = propLine(item, src.strings.SOCKETS)
  if (sockets && /^[RGBWAD]( ?[- ] ?[RGBWAD])*$/.test(sockets)) parts.push([`Sockets: ${sockets}`])
  if (item.itemLevel) parts.push([`Item Level: ${item.itemLevel}`])

  // у камня в тексте — описание умения на его уровне, а не моды: в буфер только имя, уровень, качество, требования
  const mods = item.category === ItemCategory.Gem ? { enchant: [], implicit: [], explicit: [], untranslated: [] } : pobModLines(item, src, en, clip)
  if (mods.enchant.length) parts.push(mods.enchant)
  if (mods.implicit.length) parts.push(mods.implicit)
  if (mods.explicit.length) parts.push(mods.explicit)

  const flags = [
    item.isUnidentified ? 'Unidentified' : '',
    ...item.influences.map((i) => INFLUENCE_EN[i]).filter(Boolean),
    item.isFractured ? 'Fractured Item' : '',
    item.isSynthesised ? 'Synthesised Item' : '',
    item.isSplit ? 'Split' : '',
    item.isMirrored ? 'Mirrored' : '',
    item.isCorrupted ? 'Corrupted' : ''
  ].filter(Boolean)
  // PoB ищет флаги по строкам — ему хватит одной секции; в буфер — как в игре: «Unidentified», «Corrupted»… отдельно,
  // влияния — вместе
  if (!clip) {
    if (flags.length) parts.push(flags)
  } else {
    const influences = new Set(Object.values(INFLUENCE_EN))
    const shared = flags.filter((f) => influences.has(f))
    for (const f of flags) {
      if (!influences.has(f)) parts.push([f])
      else if (f === shared[0]) parts.push(shared)
    }
  }

  const lines = parts.map((p) => p.join('\n'))
  const text = lines.join(`\n${SEP}\n`)
  if (text.length > POB_ITEM_TEXT_MAX || text.split('\n').length > LINES_MAX) return null
  return { text, untranslated: mods.untranslated.slice(0, 40) }
}
