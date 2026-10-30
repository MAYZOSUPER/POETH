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

import type { Poe1Data } from '../poe1/data'
import { parseModInfoLine } from '../poe1/parser/advanced-mod-desc'
import { ModifierType } from '../poe1/parser/modifiers'
import { ItemInfluence, ItemRarity, type ParsedItem } from '../poe1/parser/ParsedItem'
import { matchStatLine } from '../poe1/parser/stat-translations'
import type { Stat, StatMatcher } from '../poe1/data/interfaces'
import { equipReq } from './equipCompare'

export interface PobItemEn {
  /** текст для PoB (EN) */
  text: string
  /** строки модов, которые не перевелись (на языке клиента) */
  untranslated: string[]
}

/** Текст одного предмета для движка: больше — не считаем (исследование §11). */
export const POB_ITEM_TEXT_MAX = 16 * 1024
const LINES_MAX = 200

const SEP = '--------'
const NUM = '([+-]?\\d+(?:\\.\\d+)?)'
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const m = new RegExp(`^${tpl.split('#').map(esc).join(NUM)}$`).exec(s)
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

/** Переведённые моды по видам (в порядке текста) и непереведённые строки (EN → EN — нормализация для тестов). */
export function pobModLines(item: ParsedItem, src: Poe1Data, en: Poe1Data): { enchant: string[]; implicit: string[]; explicit: string[]; untranslated: string[] } {
  const out = { enchant: [] as string[], implicit: [] as string[], explicit: [] as string[], untranslated: [] as string[] }
  const secs = sections(item.rawText).slice(1)
  for (const sec of secs) {
    const lines: Array<{ text: string; type: ModifierType }> = []
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
      let type = header ? current : ModifierType.Explicit
      for (const [suffix, t] of SUFFIXES) {
        if (text.endsWith(suffix)) {
          text = text.slice(0, -suffix.length)
          type = t
          break
        }
      }
      lines.push({ text, type })
    }
    const done = lines.map((l) => ({ ...l, en: modLineToEn(l.text, src, en, item.category) }))
    // секция без единого мода — свойства, требования, описание уника: не наша
    if (!header && !done.some((l) => l.en)) continue
    for (const l of done) {
      if (!l.en) {
        out.untranslated.push(l.text)
        continue
      }
      const line = l.en + (EN_SUFFIX[l.type] ?? '')
      if (l.type === ModifierType.Enchant) out.enchant.push(line)
      else if (l.type === ModifierType.Implicit) out.implicit.push(line)
      else out.explicit.push(line)
    }
  }
  // моды, которые парсер APT не узнал, но которых нет среди непереведённых (секция целиком из неузнанных)
  for (const u of item.unknownModifiers) {
    const t = u.text.trim()
    if (t && !out.untranslated.includes(t)) out.untranslated.push(t)
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

/**
 * Предмет из окна цены → текст для PoB. null — не собрать (нет EN-имени базы, неопознан, слишком длинный текст).
 * `src` — данные языка предмета, `en` — английские данные (для EN-предмета не нужны).
 */
export function pobItemText(item: ParsedItem, src: Poe1Data | null, en: Poe1Data | null): PobItemEn | null {
  if (item.isUnidentified) return null
  if (item.lang === 'en') {
    const text = item.rawText.replace(/\r\n?/g, '\n').trim()
    return text && text.length <= POB_ITEM_TEXT_MAX ? { text, untranslated: [] } : null
  }
  if (!src || !en || src.lang !== item.lang) return null

  const unique = item.rarity === ItemRarity.Unique
  const base = (unique ? item.uniqueBase?.refName : undefined) ?? item.info.refName
  if (!base || !/^[\p{L}\p{N}][\p{L}\p{N} '’,.:\-()]{0,99}$/u.test(base)) return null
  const rarity = item.rarity ?? ItemRarity.Normal

  const head = [`Rarity: ${rarity}`]
  if (unique) head.push(item.info.refName)
  else if (rarity === ItemRarity.Rare) head.push('POETH Item')
  head.push(base)

  const parts: string[][] = [head]
  if (item.quality) parts.push([`Quality: +${item.quality}%`])
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

  const mods = pobModLines(item, src, en)
  if (mods.enchant.length) parts.push(mods.enchant)
  if (mods.implicit.length) parts.push(mods.implicit)
  if (mods.explicit.length) parts.push(mods.explicit)

  const flags = [
    ...item.influences.map((i) => INFLUENCE_EN[i]).filter(Boolean),
    item.isFractured ? 'Fractured Item' : '',
    item.isSynthesised ? 'Synthesised Item' : '',
    item.isSplit ? 'Split' : '',
    item.isMirrored ? 'Mirrored' : '',
    item.isCorrupted ? 'Corrupted' : ''
  ].filter(Boolean)
  if (flags.length) parts.push(flags)

  const lines = parts.map((p) => p.join('\n'))
  const text = lines.join(`\n${SEP}\n`)
  if (text.length > POB_ITEM_TEXT_MAX || text.split('\n').length > LINES_MAX) return null
  return { text, untranslated: mods.untranslated.slice(0, 40) }
}
