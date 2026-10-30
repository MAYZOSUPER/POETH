// Строка поиска для тайника — страница «Предметы» (S46): класс, база, редкость, уровень предмета, влияние,
// осквернённые; свойства «Торговца» (жизнь, сопротивления, скорость… — те же фрагменты, что в vendor.ts)
// и любые строки модов из RePoE с порогом «≥ N»; камни (уровень, качество, ваал). Готовые наборы для новичка.
//
// Данные строк модов, баз, классов, влияния — tools/regex/build-item-data.mjs → items.{en,ru}.json:
// фрагменты проверены на корпусе строк предметов (моды, имплиситы, зачарования, уникальные, названия свойств,
// метки, базы, фикстуры) — EN и RU, с ё=е, RU — без заглавных букв. Поиск игры (PoE 1) идёт по каждой строке
// текста предмета без учёта регистра; термы через пробел — «И», "!a|b" — ни a, ни b.

import type {
  InfluenceKey,
  ItemClassKey,
  ItemModData,
  ItemRarity,
  ItemRegexData,
  ItemsQuery,
  OverflowItem,
  RegexBuildResult,
  RegexLang,
  VendorModKey
} from '../types/regex'
import { atLeast } from './atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from './format'
import {
  VENDOR_ITEM_CLASSES,
  VENDOR_MOD_KEYS,
  VENDOR_TEXTS,
  anyBody,
  isThresholdMod,
  threshold,
  thresholdBody,
  vendorModPattern,
  type Part,
  type Threshold
} from './vendor'
import { VENDOR_DATA } from './vendorData'
import type { VendorSideReason } from './vendorTypes'

/** Классы в порядке списка: снаряжение (как у «Торговца»), флаконы, камни. */
export const ITEM_CLASS_KEYS: readonly ItemClassKey[] = [
  ...VENDOR_ITEM_CLASSES,
  'lifeFlask',
  'manaFlask',
  'hybridFlask',
  'utilityFlask',
  'skillGem',
  'supportGem'
]

export const GEM_CLASSES: readonly ItemClassKey[] = ['skillGem', 'supportGem']
export const FLASK_CLASSES: readonly ItemClassKey[] = ['lifeFlask', 'manaFlask', 'hybridFlask', 'utilityFlask']

export const ITEM_RARITIES: readonly ItemRarity[] = ['normal', 'magic', 'rare', 'unique']

/** Создатель и Древний, завоеватели; экзарх и Пожиратель — отдельно (экспертный режим). */
export const INFLUENCE_KEYS: readonly InfluenceKey[] = [
  'shaper',
  'elder',
  'crusader',
  'hunter',
  'redeemer',
  'warlord',
  'exarch',
  'eater'
]
export const CLASSIC_INFLUENCES: readonly InfluenceKey[] = INFLUENCE_KEYS.slice(0, 6)

/**
 * Ваал-камни: в названии «Vaal Haste» / «Спешка ваал» (в RU — строчными в конце названия) и в тегах «Vaal».
 * Ищется вместе с «Rarity: Gem», поэтому базы «Vaal Regalia» и строки самоцветов не мешают.
 */
export const VAAL_TOKEN: Record<RegexLang, string> = { en: 'vaal', ru: 'ваал' }

export function emptyItemsQuery(): ItemsQuery {
  return {
    itemClass: '',
    base: '',
    rarity: [],
    itemLevel: 0,
    influence: [],
    noInfluence: false,
    corrupted: 'any',
    props: {},
    want: {},
    avoid: [],
    mode: 'any',
    gemLevel: 0,
    gemQuality: 0,
    vaal: 'any'
  }
}

/** Блок «Камни» включён: строка ищет только камни (условие «Rarity: Gem»). */
export function hasGemFilter(q: ItemsQuery): boolean {
  return q.gemLevel > 0 || q.gemQuality > 0 || q.vaal !== 'any'
}

/** Выбранные свойства «Торговца» в порядке страницы. */
export function selectedProps(q: ItemsQuery): VendorModKey[] {
  return VENDOR_MOD_KEYS.filter((k) => (q.props[k] ?? 0) > 0)
}

/** У строки мода есть порог «≥ N» (строка с одним числом). */
export function hasThreshold(m: ItemModData): boolean {
  return !!m.posts?.length
}

/** Строка мода может выпасть на предмете класса (нет данных о классах — показываем везде). */
export function modFitsClass(m: ItemModData, cls: ItemClassKey | ''): boolean {
  return !cls || !m.cls || m.cls.includes(cls)
}

interface ItemsIndex {
  byId: Map<string, ItemModData>
  baseById: Map<string, ItemRegexData['bases'][number]>
}

const indexCache = new WeakMap<ItemRegexData, ItemsIndex>()

export function getItemsIndex(data: ItemRegexData): ItemsIndex {
  let idx = indexCache.get(data)
  if (!idx) {
    idx = { byId: new Map(data.mods.map((m) => [m.id, m])), baseById: new Map(data.bases.map((b) => [b.id, b])) }
    indexCache.set(data, idx)
  }
  return idx
}

/** Выбранные строки модов, которые есть в данных (в порядке выбора). */
function wanted(index: ItemsIndex, q: ItemsQuery): ItemModData[] {
  return Object.keys(q.want)
    .filter((id) => !q.avoid.includes(id))
    .map((id) => index.byId.get(id))
    .filter((m): m is ItemModData => !!m)
}

/** Части «хочу», которые объединяются через ИЛИ (режим «любое») или идут отдельными термами («все сразу»). */
export function itemsParts(data: ItemRegexData, lang: RegexLang, q: ItemsQuery): Part[] {
  const index = getItemsIndex(data)
  const parts: Part[] = []
  for (const key of selectedProps(q)) {
    if (!isThresholdMod(key)) {
      parts.push({ key: `prop.${key}`, body: vendorModPattern(lang, key) })
      continue
    }
    const thr = threshold(lang, key, q.props[key] ?? 0)
    parts.push({ key: `prop.${key}`, body: thresholdBody(thr), thr })
  }
  for (const m of wanted(index, q)) {
    const n = Math.max(0, Math.min(999, Math.round(q.want[m.id] ?? 0)))
    if (n > 0 && hasThreshold(m)) {
      const thr: Threshold = { pre: m.pre ?? '', digit: m.digit ?? '\\d', n, posts: m.posts ?? [] }
      parts.push({ key: `mod.${m.id}`, body: thresholdBody(thr), thr })
    } else {
      parts.push({ key: `mod.${m.id}`, body: m.token })
    }
  }
  return parts
}

/** Части запроса без «хочу»: каждая — отдельный терм или кусок общего «не хочу». */
interface Cond {
  key: string
  term?: Term
  /** кусок терма «не хочу» ("!a|b|c") */
  not?: string[]
}

function conditions(data: ItemRegexData, lang: RegexLang, q: ItemsQuery): Cond[] {
  const index = getItemsIndex(data)
  const out: Cond[] = []
  const avoid = q.avoid.map((id) => index.byId.get(id)).filter((m): m is ItemModData => !!m)
  for (const m of avoid) out.push({ key: `avoid.${m.id}`, not: [m.token] })
  if (q.corrupted === 'exclude') out.push({ key: 'corrupted', not: [data.flags.corrupted] })
  if (q.noInfluence) out.push({ key: 'influence', not: INFLUENCE_KEYS.map((k) => data.influence[k]) })
  if (q.vaal === 'exclude') out.push({ key: 'vaal', not: [VAAL_TOKEN[lang]] })

  if (q.itemClass) out.push({ key: 'class', term: { negate: false, body: data.classes[q.itemClass] } })
  const base = q.itemClass && q.base ? index.baseById.get(q.base) : undefined
  if (base && base.cls === q.itemClass) out.push({ key: 'base', term: { negate: false, body: base.token } })
  // камни: «Rarity: Gem» вместо редкости снаряжения (у класса камней она уже есть)
  const gems = hasGemFilter(q)
  if (gems && !GEM_CLASSES.includes(q.itemClass as ItemClassKey)) {
    out.push({ key: 'gems', term: { negate: false, body: data.rarity.gem } })
  }
  const rarity = ITEM_RARITIES.filter((r) => q.rarity.includes(r))
  if (!gems && rarity.length && rarity.length < ITEM_RARITIES.length) {
    out.push({ key: 'rarity', term: { negate: false, body: rarity.map((r) => data.rarity[r]).join('|') } })
  }
  if (q.itemLevel > 0) {
    const n = Math.min(100, q.itemLevel)
    out.push({ key: 'itemLevel', term: { negate: false, body: `${data.itemLevel} ${atLeast(n, { digit: '\\d', whole: true })}` } })
  }
  const infl = INFLUENCE_KEYS.filter((k) => q.influence.includes(k))
  if (!q.noInfluence && infl.length) {
    out.push({ key: 'influence', term: { negate: false, body: infl.map((k) => data.influence[k]).join('|') } })
  }
  if (q.corrupted === 'only') out.push({ key: 'corrupted', term: { negate: false, body: data.flags.corrupted } })
  if (q.gemLevel > 0) {
    const n = Math.min(q.gemLevel, 40)
    out.push({ key: 'gemLevel', term: { negate: false, body: `${VENDOR_TEXTS[lang].gemLevel}${atLeast(n, { digit: '\\d' })}` } })
  }
  if (q.gemQuality > 0) {
    const n = Math.min(q.gemQuality, 30)
    out.push({ key: 'gemQuality', term: { negate: false, body: `${VENDOR_TEXTS[lang].quality}.*${atLeast(n)}%` } })
  }
  if (q.vaal === 'only') out.push({ key: 'vaal', term: { negate: false, body: VAAL_TOKEN[lang] } })
  return out
}

function itemsText(q: ItemsQuery, conds: Cond[], parts: Part[]): string {
  const terms: Term[] = []
  // «не хочу» одним термом: "!a|b|c" — нет ни одного (как у карт)
  const not = conds.flatMap((c) => c.not ?? [])
  if (not.length) terms.push({ negate: true, body: not.join('|') })
  for (const c of conds) if (c.term) terms.push(c.term)
  if (parts.length) {
    if (q.mode === 'all') for (const p of parts) terms.push({ negate: false, body: p.body })
    else terms.push({ negate: false, body: anyBody(parts) })
  }
  return joinTerms(terms)
}

export interface ItemsBuildResult extends RegexBuildResult {
  /** Невыбранные свойства «Торговца», чьи строки строка заденет неизбежно. */
  also: VendorModKey[]
  /** Побочные совпадения свойств «Торговца»: приспешники, минус, описания камней. */
  side: VendorSideReason[]
}

export function buildItemsRegex(data: ItemRegexData, lang: RegexLang, q: ItemsQuery): ItemsBuildResult {
  const index = getItemsIndex(data)
  const conds = conditions(data, lang, q)
  const parts = itemsParts(data, lang, q)
  const text = itemsText(q, conds, parts)

  const chosenProps = selectedProps(q)
  const also = new Set<VendorModKey>()
  const side = new Set<VendorSideReason>()
  for (const key of chosenProps) {
    const d = VENDOR_DATA[lang].mods[key]
    for (const k of d.also ?? []) if (!chosenProps.includes(k)) also.add(k)
    for (const s of d.side ?? []) side.add(s)
  }
  // строки модов, где выбранная есть целиком: только те, что бывают на этом классе
  const chosen = new Set([...Object.keys(q.want), ...q.avoid])
  const sideMods = new Set<string>()
  for (const id of chosen) {
    for (const other of index.byId.get(id)?.also ?? []) {
      const m = index.byId.get(other)
      if (m && !chosen.has(other) && modFitsClass(m, q.itemClass)) sideMods.add(other)
    }
  }

  const result: ItemsBuildResult = {
    text,
    length: text.length,
    ok: text.length <= REGEX_LIMIT,
    sideMatches: data.mods.filter((m) => sideMods.has(m.id)).map((m) => m.id),
    also: VENDOR_MOD_KEYS.filter((k) => also.has(k)),
    side: [...side].sort()
  }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    // сколько даст удаление условия — пересборкой без него (пороги в группе экономят меньше своей длины)
    const items: OverflowItem[] = [
      ...conds.map((c) => ({
        kind: 'option' as const,
        key: c.key,
        saves: text.length - itemsText(q, conds.filter((x) => x !== c), parts).length
      })),
      ...parts.map((p) => ({
        kind: 'option' as const,
        key: p.key,
        saves: text.length - itemsText(q, conds, parts.filter((x) => x !== p)).length
      }))
    ]
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}

// ---------------------------------------------------------------------------
// Готовые наборы для новичка (строки regex.items.preset.<id>.name / .why)
// ---------------------------------------------------------------------------

export type ItemsPresetGroup = 'craft' | 'rares' | 'gems' | 'flasks'

export interface ItemsPreset {
  id:
    | 'craftBase'
    | 'influenceBase'
    | 'rareSell'
    | 'rareBoots'
    | 'gemLevel'
    | 'gemQuality'
    | 'vaalGems'
    | 'flaskBleed'
    | 'flaskUtility'
  group: ItemsPresetGroup
  query: Partial<ItemsQuery>
}

/** id строк модов флаконов (RePoE stat id, проверяются тестами на данных). */
export const FLASK_MOD_IDS = {
  bleedImmunity: 'local_flask_bleeding_immunity_if_bleeding_and_remove_corrupted_blood_s',
  effect: 'local_flask_effect_+%,local_flask_consume_flask_effect_+%_when_used',
  duration: 'local_flask_duration_+%,local_flask_consume_flask_duration_+%_when_used'
} as const

export const ITEMS_PRESET_GROUPS: readonly ItemsPresetGroup[] = ['craft', 'rares', 'gems', 'flasks']

export const ITEMS_PRESETS: readonly ItemsPreset[] = [
  // крафт: обычные (белые) базы высокого уровня, не осквернённые — их можно менять сферами
  { id: 'craftBase', group: 'craft', query: { rarity: ['normal'], itemLevel: 84, corrupted: 'exclude' } },
  // базы с влиянием Создателя, Древнего или завоевателей — дорогие свойства влияния
  { id: 'influenceBase', group: 'craft', query: { influence: [...CLASSIC_INFLUENCES], corrupted: 'exclude' } },
  // жёлтые на продажу: хотя бы одно крупное свойство — их стоит проверить ценой первыми
  {
    id: 'rareSell',
    group: 'rares',
    query: {
      rarity: ['rare'],
      mode: 'any',
      props: { life: 80, resFire: 40, resCold: 40, resLightning: 40, resChaos: 30, moveSpeed: 30 }
    }
  },
  // себе: ботинки со скоростью и здоровьем сразу
  { id: 'rareBoots', group: 'rares', query: { itemClass: 'boots', rarity: ['rare'], mode: 'all', props: { moveSpeed: 25, life: 50 } } },
  // камни: 20 уровень, 20 % качества, ваал-камни
  { id: 'gemLevel', group: 'gems', query: { gemLevel: 20 } },
  { id: 'gemQuality', group: 'gems', query: { gemQuality: 20 } },
  { id: 'vaalGems', group: 'gems', query: { vaal: 'only' } },
  // флаконы: жизнь со снятием кровотечения; особые — эффект или длительность
  { id: 'flaskBleed', group: 'flasks', query: { itemClass: 'lifeFlask', want: { [FLASK_MOD_IDS.bleedImmunity]: 0 } } },
  {
    id: 'flaskUtility',
    group: 'flasks',
    query: { itemClass: 'utilityFlask', mode: 'any', want: { [FLASK_MOD_IDS.effect]: 0, [FLASK_MOD_IDS.duration]: 0 } }
  }
]

export function itemsPresetQuery(p: ItemsPreset): ItemsQuery {
  const q = emptyItemsQuery()
  return {
    ...q,
    ...p.query,
    rarity: [...(p.query.rarity ?? q.rarity)],
    influence: [...(p.query.influence ?? q.influence)],
    props: { ...p.query.props },
    want: { ...p.query.want },
    avoid: [...(p.query.avoid ?? q.avoid)]
  }
}

/** Запрос совпадает с набором (порядок выбора не важен). */
export function isItemsPresetQuery(p: ItemsPreset, q: ItemsQuery): boolean {
  const key = (x: ItemsQuery): string =>
    JSON.stringify({
      ...x,
      rarity: [...x.rarity].sort(),
      influence: [...x.influence].sort(),
      props: VENDOR_MOD_KEYS.map((k) => x.props[k] ?? 0),
      want: Object.entries(x.want).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      avoid: [...x.avoid].sort()
    })
  return key(itemsPresetQuery(p)) === key(q)
}
