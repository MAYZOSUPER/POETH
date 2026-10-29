// Строка поиска для торговца (и стэша): связи и цвета гнёзд, качество, «+# к уровню камней», уровень
// камня; свойства предметов (S27: жизнь, сопротивления, «+ к уровню камней» по типам, урон, скорости,
// характеристики) и фильтры класса и редкости.
//
// Тексты свойств — RePoE stat_translations EN/RU через генератор tools/regex/build-vendor-data.mjs
// (vendorData.ts: кратчайшие фрагменты, проверенные на корпусе строк предметов торговца); метки
// («Quality:», «Level:», «Item Class:», «Rarity:») — client_strings APT. Поиск игры (PoE 1, с 3.14) идёт
// по каждой строке текста предмета как при Ctrl+C, без учёта регистра — включая «Item Class: Boots» и
// «Rarity: Magic». Буквы гнёзд (R/G/B/W) в RU-клиенте латинские.

import type {
  OverflowItem,
  RegexBuildResult,
  RegexLang,
  SocketColor,
  VendorItemClass,
  VendorModKey,
  VendorQuery,
  VendorRarity
} from '../types/regex'
import { atLeast } from './atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from './format'
import { VENDOR_DATA } from './vendorData'
import type { VendorSideReason } from './vendorTypes'

interface VendorTexts {
  /** метка перед числом: «Quality: +20%» (дальше .*<число>%) */
  quality: string
  /** перед уровнем камня: «Level: 20» */
  gemLevel: string
  /** «+1 to Level of Socketed Gems», «+1 to Level of all Spell Skill Gems» — любой тип */
  plusGem: string
}

export const VENDOR_TEXTS: Record<RegexLang, VendorTexts> = {
  en: {
    quality: 'ality:',
    gemLevel: 'evel: ',
    plusGem: 'to level of'
  },
  ru: {
    // «Качество: +20%» («количество предметов:» не задевает — там «тов:»)
    quality: 'ество:',
    // «Уровень: 20» у камня; у предметов ещё «Уровень: 64» в требованиях — их отсекает «!ь предмета:»
    gemLevel: 'вень: ',
    // «+1 к уровню размещённых камней», «+1 к уровню всех камней умений чар»
    plusGem: 'к уровню'
  }
}

/** Свойства в порядке страницы (защита, сопротивления, камни, урон, добавленный урон, скорость, характеристики). */
export const VENDOR_MOD_KEYS = Object.keys(VENDOR_DATA.en.mods) as VendorModKey[]

export const VENDOR_ITEM_CLASSES = Object.keys(VENDOR_DATA.en.classes) as VendorItemClass[]

export const VENDOR_RARITIES: VendorRarity[] = ['normal', 'magic', 'rare']

/** У свойства есть порог «≥ N» (иначе — просто «есть такой мод»). */
export function isThresholdMod(key: VendorModKey): boolean {
  return VENDOR_DATA.en.mods[key].token === undefined
}

/** Строки свойства как в подсказке игры (числа → #) — для подсказки в UI. */
export function vendorModText(lang: RegexLang, key: VendorModKey): string[] {
  return VENDOR_DATA[lang].mods[key].text
}

interface Threshold {
  pre: string
  digit: '.' | '\\d'
  n: number
  posts: string[]
}

function threshold(lang: RegexLang, key: VendorModKey, n: number): Threshold {
  const d = VENDOR_DATA[lang].mods[key]
  return { pre: d.pre ?? '', digit: d.digit ?? '\\d', n: Math.max(0, Math.min(999, Math.round(n))), posts: d.posts ?? [] }
}

/** Хвосты после числа одной группой: без повторов и «покрытых» (a — начало b), общее начало — за скобку. */
export function joinPosts(posts: string[]): string {
  const uniq = [...new Set(posts)]
  const list = uniq.filter((p) => !uniq.some((q) => q !== p && p.startsWith(q)))
  if (list.length === 1) return list[0]
  let lcp = list.reduce((a, b) => {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    return a.slice(0, i)
  })
  // не резать посреди \d, \+ и не оставлять квантификатор в начале альтернативы
  while (lcp && (/(^|[^\\])(\\\\)*\\$/.test(lcp) || list.some((p) => /^[+*?{]/.test(p.slice(lcp.length))))) {
    lcp = lcp.slice(0, -1)
  }
  if (lcp.length < 2) return `(${list.join('|')})`
  return `${lcp}(${list.map((p) => p.slice(lcp.length)).join('|')})`
}

function thresholdBody(t: Threshold): string {
  // с контекстом слева («\+») число должно совпасть целиком, без него хватает «хвоста»
  return `${t.pre}${atLeast(t.n, { digit: t.digit, whole: t.pre !== '' })}${joinPosts(t.posts)}`
}

/** Фрагмент регулярки свойства: порог — <pre><atLeast(N)>(<posts>), без порога — готовый токен. */
export function vendorModPattern(lang: RegexLang, key: VendorModKey, n = 0): string {
  const d = VENDOR_DATA[lang].mods[key]
  return d.token !== undefined ? d.token : thresholdBody(threshold(lang, key, n))
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
    mods: {},
    quality: 0,
    plusGemLevel: false,
    gemLevel: 0,
    itemClass: '',
    rarity: [],
    mode: 'any'
  }
}

/** Выбранные свойства в порядке страницы. */
export function selectedMods(q: VendorQuery): VendorModKey[] {
  return VENDOR_MOD_KEYS.filter((k) => (q.mods[k] ?? 0) > 0)
}

interface Part {
  /** ключ для подсказки «что убрать»: links, quality… или mod.<VendorModKey> */
  key: string
  body: string
  /** порог свойства: в режиме «любое» пороги с тем же pre, цифрой и числом сливаются в одну группу */
  thr?: Threshold
}

/** Части запроса, которые можно объединять через ИЛИ. */
export function vendorParts(lang: RegexLang, q: VendorQuery): Part[] {
  const tx = VENDOR_TEXTS[lang]
  const parts: Part[] = []
  if (q.links >= 3) parts.push({ key: 'links', body: linkPattern(q.links) })
  if (q.sixSockets) parts.push({ key: 'sixSockets', body: SIX_SOCKETS_PATTERN })
  if (q.rgb) parts.push({ key: 'rgb', body: RGB_PATTERN })
  if (q.colorCount >= 2) parts.push({ key: 'color', body: colorLinkPattern(q.color, Math.min(q.colorCount, 6)) })
  if (q.quality > 0) parts.push({ key: 'quality', body: `${tx.quality}.*${atLeast(q.quality)}%` })
  if (q.plusGemLevel) parts.push({ key: 'plusGemLevel', body: tx.plusGem })
  for (const key of selectedMods(q)) {
    if (!isThresholdMod(key)) {
      parts.push({ key: `mod.${key}`, body: vendorModPattern(lang, key) })
      continue
    }
    const thr = threshold(lang, key, q.mods[key] ?? 0)
    parts.push({ key: `mod.${key}`, body: thresholdBody(thr), thr })
  }
  return parts
}

/**
 * Режим «любое»: части через | в один терм. Пороги с одинаковыми pre, цифрой и числом — одной группой
 * («\+(1[5-9]|…)% to (fire r|cold r|lightning r|…)» вместо трёх atLeast): сопротивления на всё влезают в 250.
 */
function anyBody(parts: Part[]): string {
  const out: string[] = []
  const groups = new Map<string, { index: number; thr: Threshold }>()
  for (const p of parts) {
    if (!p.thr) {
      out.push(p.body)
      continue
    }
    const id = `${p.thr.pre}|${p.thr.digit}|${p.thr.n}`
    const g = groups.get(id)
    if (g) g.thr = { ...g.thr, posts: [...g.thr.posts, ...p.thr.posts] }
    else groups.set(id, { index: out.push('') - 1, thr: p.thr })
  }
  for (const g of groups.values()) out[g.index] = thresholdBody(g.thr)
  return out.join('|')
}

export interface VendorBuildResult extends RegexBuildResult {
  /** Невыбранные свойства, чьи строки строка заденет неизбежно («Adds # to # Fire Damage» → «… to Spells»). */
  also: VendorModKey[]
  /** Другие побочные совпадения: свойства приспешников, отрицательные значения, описания камней. */
  side: VendorSideReason[]
}

function vendorText(lang: RegexLang, q: VendorQuery, parts: Part[]): string {
  const tx = VENDOR_TEXTS[lang]
  const data = VENDOR_DATA[lang]
  const terms: Term[] = []
  if (parts.length) {
    if (q.mode === 'all') for (const p of parts) terms.push({ negate: false, body: p.body })
    else terms.push({ negate: false, body: anyBody(parts) })
  }
  // класс и редкость — отдельные условия «И»: «ботинки» и «со скоростью»
  if (q.itemClass) terms.push({ negate: false, body: data.classes[q.itemClass] })
  const rarity = VENDOR_RARITIES.filter((r) => q.rarity.includes(r))
  if (rarity.length && rarity.length < VENDOR_RARITIES.length) {
    terms.push({ negate: false, body: rarity.map((r) => data.rarity[r]).join('|') })
  }
  // уровень камня — всегда отдельным условием «И»: это фильтр «только камни»
  if (q.gemLevel > 0) {
    terms.push({ negate: false, body: `${tx.gemLevel}${atLeast(Math.min(q.gemLevel, 999), { digit: '\\d' })}` })
    terms.push({ negate: true, body: data.notItemLevel })
  }
  return joinTerms(terms)
}

export function buildVendorRegex(lang: RegexLang, q: VendorQuery): VendorBuildResult {
  const data = VENDOR_DATA[lang]
  const parts = vendorParts(lang, q)
  const text = vendorText(lang, q, parts)
  const chosen = selectedMods(q)
  const also = new Set<VendorModKey>()
  const side = new Set<VendorSideReason>()
  for (const key of chosen) {
    for (const k of data.mods[key].also ?? []) if (!chosen.includes(k)) also.add(k)
    for (const s of data.mods[key].side ?? []) side.add(s)
  }
  const result: VendorBuildResult = {
    text,
    length: text.length,
    ok: text.length <= REGEX_LIMIT,
    sideMatches: [],
    also: VENDOR_MOD_KEYS.filter((k) => also.has(k)),
    side: [...side].sort()
  }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    // сколько символов даст удаление части — пересборкой без неё (пороги в группе экономят меньше своей длины)
    const items: OverflowItem[] = parts.map((p) => ({
      kind: 'option',
      key: p.key,
      saves: text.length - vendorText(lang, q, parts.filter((x) => x !== p)).length
    }))
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}

// ---------------------------------------------------------------------------
// Готовые наборы для простого режима (строки regex.vendor.preset.<id>.name / .desc)
// ---------------------------------------------------------------------------

export interface VendorPreset {
  id: 'leagueBoots' | 'caster' | 'attack' | 'resists'
  query: Partial<VendorQuery>
}

export const VENDOR_PRESETS: readonly VendorPreset[] = [
  // старт лиги: ботинки с 10%+ скорости передвижения (ботинки — условие «И»)
  { id: 'leagueBoots', query: { itemClass: 'boots', mods: { moveSpeed: 10 } } },
  // кастер: «+ к уровню камней» чар и стихий, урон чар 15%+, добавленный урон к чарам
  {
    id: 'caster',
    query: {
      mods: {
        gemSpell: 1,
        gemFire: 1,
        gemCold: 1,
        gemLightning: 1,
        gemChaos: 1,
        spellDamage: 15,
        addSpellFire: 1,
        addSpellCold: 1,
        addSpellLightning: 1
      }
    }
  },
  // атака: физ. урон оружия 20%+, скорость атаки 5%+, добавленный физ. урон
  { id: 'attack', query: { mods: { physDamage: 20, attackSpeed: 5, addAttackPhys: 1 } } },
  // сопротивления: огонь, холод, молния 15%+ (и двойные), ко всем стихиям 6%+
  { id: 'resists', query: { mods: { resFire: 15, resCold: 15, resLightning: 15, resAll: 6 } } }
]

export function presetQuery(p: VendorPreset): VendorQuery {
  return { ...emptyVendorQuery(), ...p.query, mods: { ...p.query.mods } }
}

/** Запрос совпадает с набором (режим «любое / все сразу» не важен). */
export function isPresetQuery(p: VendorPreset, q: VendorQuery): boolean {
  const a = presetQuery(p)
  const key = (x: VendorQuery): string =>
    JSON.stringify({ ...x, mode: '', mods: VENDOR_MOD_KEYS.map((k) => x.mods[k] ?? 0), rarity: [...x.rarity].sort() })
  return key(a) === key(q)
}
