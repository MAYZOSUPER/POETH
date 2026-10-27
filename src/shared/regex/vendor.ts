// Строка поиска для торговца (и стэша): связи и цвета гнёзд, скорость передвижения, качество,
// «+# к уровню камней», уровень камня. Тексты сверены со stat_translations RePoE (EN/RU) и
// client_strings APT; буквы гнёзд (R/G/B/W) в RU-клиенте латинские.

import type { OverflowItem, RegexBuildResult, RegexLang, SocketColor, VendorQuery } from '../types/regex'
import { atLeast } from './atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from './format'

interface VendorTexts {
  /** после числа: «10% increased Movement Speed» */
  move: string
  /** метка перед числом: «Quality: +20%» (дальше .*<число>%) */
  quality: string
  /** перед уровнем камня: «Level: 20» */
  gemLevel: string
  /** терм-исключение «Item Level: 84» (у камней его нет); null — не нужен */
  notItemLevel: string | null
  /** «+1 to Level of Socketed Gems», «+1 to Level of all Spell Skill Gems» */
  plusGem: string
}

export const VENDOR_TEXTS: Record<RegexLang, VendorTexts> = {
  en: {
    move: '% increased mov',
    quality: 'ality:',
    gemLevel: 'evel: ',
    notItemLevel: 'm lev',
    plusGem: 'to level of'
  },
  ru: {
    // «10% повышение скорости передвижения»
    move: '% повышение скорости пер',
    // «Качество: +20%» («количество предметов:» не задевает — там «тов:»)
    quality: 'ество:',
    // «Уровень: 20» у камня; у предметов — «Уровень предмета: 84»
    gemLevel: 'вень: ',
    notItemLevel: null,
    // «+1 к уровню размещённых камней», «+1 к уровню всех камней умений чар»
    plusGem: 'к уровню'
  }
}

// Буква гнезда между дефисами — \w, а не «.»: иначе шаблон схватит разделитель «--------».

/** Связь из n гнёзд: «R-G-B» → -\w- (3), -\w-.- (4) … */
export function linkPattern(n: number): string {
  return '-\\w' + '-.'.repeat(n - 3) + '-'
}

/** Хроматическая сфера: R, G и B подряд в одной связке. */
export const RGB_PATTERN = 'r-g-b|r-b-g|g-r-b|g-b-r|b-r-g|b-g-r'

/** Шесть гнёзд в любых связях: «R-G B-B R G». */
export const SIX_SOCKETS_PATTERN = '(\\w[- ]){5}\\w'

/** count гнёзд цвета color в одной связке: b(-\w)*-b для двух синих. */
export function colorLinkPattern(color: SocketColor, count: number): string {
  return Array.from({ length: count }, () => color).join('(-\\w)*-')
}

export function emptyVendorQuery(): VendorQuery {
  return {
    links: 0,
    sixSockets: false,
    rgb: false,
    colorCount: 0,
    color: 'b',
    movementSpeed: 0,
    quality: 0,
    plusGemLevel: false,
    gemLevel: 0,
    mode: 'any'
  }
}

interface Part {
  key: string
  body: string
}

/** Части запроса, которые можно объединять через ИЛИ. */
export function vendorParts(lang: RegexLang, q: VendorQuery): Part[] {
  const tx = VENDOR_TEXTS[lang]
  const parts: Part[] = []
  if (q.links >= 3) parts.push({ key: 'links', body: linkPattern(q.links) })
  if (q.sixSockets) parts.push({ key: 'sixSockets', body: SIX_SOCKETS_PATTERN })
  if (q.rgb) parts.push({ key: 'rgb', body: RGB_PATTERN })
  if (q.colorCount >= 2) parts.push({ key: 'color', body: colorLinkPattern(q.color, Math.min(q.colorCount, 6)) })
  if (q.movementSpeed > 0) parts.push({ key: 'movementSpeed', body: `${atLeast(q.movementSpeed)}${tx.move}` })
  if (q.quality > 0) parts.push({ key: 'quality', body: `${tx.quality}.*${atLeast(q.quality)}%` })
  if (q.plusGemLevel) parts.push({ key: 'plusGemLevel', body: tx.plusGem })
  return parts
}

export function buildVendorRegex(lang: RegexLang, q: VendorQuery): RegexBuildResult {
  const tx = VENDOR_TEXTS[lang]
  const parts = vendorParts(lang, q)
  const terms: Term[] = []
  if (parts.length) {
    if (q.mode === 'all') for (const p of parts) terms.push({ negate: false, body: p.body })
    else terms.push({ negate: false, body: parts.map((p) => p.body).join('|') })
  }
  // уровень камня — всегда отдельным условием «И»: это фильтр «только камни»
  if (q.gemLevel > 0) {
    terms.push({ negate: false, body: `${tx.gemLevel}${atLeast(Math.min(q.gemLevel, 999), { digit: '\\d' })}` })
    if (tx.notItemLevel) terms.push({ negate: true, body: tx.notItemLevel })
  }
  const text = joinTerms(terms)
  const result: RegexBuildResult = { text, length: text.length, ok: text.length <= REGEX_LIMIT, sideMatches: [] }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    const items: OverflowItem[] = parts.map((p) => ({ kind: 'option', key: p.key, saves: p.body.length + 1 }))
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}
