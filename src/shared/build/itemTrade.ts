// Кнопка «Трейд» у предмета этапа (S40): готовый поиск на pathofexile.com/trade текущей лиги, открывается в
// нашем трейд-окне (tradeWindow.open({ query }) — main сам строит адрес …/search/<лига>/<состояние>).
//   • уник — по имени и базе (+ определяющие моды выбранного варианта, + связи, если в нём главная связка);
//   • жёлтая, синяя, белая, флакон, самоцвет — текст предмета PoB → текст «как в игре» → парсер и фильтры окна
//     цены (порт APT, S4/S23): тип по слоту, ключевые свойства (жизнь, сопротивления, скорость, важное для
//     билда) от ~80 % значения автора; «дешевле» — только жизнь, скорость и сумма сопротивлений от ~70 %;
//   • «похожая жёлтая» вместо уника (K3) — как у PoB TradeQueryGenerator: категория слота, «и» — жёсткие нужды
//     (сопротивления, атрибуты, скорость), «вес» — жизнь + сумма стихийных сопротивлений.
// Запрос — только английские имена и trade id; для ru.pathofexile.com имена переводит localizeTradeRequest.
// Никаких фоновых запросов: поиск выполняет сайт, когда игрок нажал кнопку.

import type { Poe1Data } from '../poe1/data'
import { ItemCategory, ItemRarity, parseItem, type ParsedItem } from '../poe1/parser'
import { ModifierType } from '../poe1/parser/modifiers'
import { matchStatLine } from '../poe1/parser/stat-translations'
import { CATEGORY_TO_TRADE_ID, createPriceCheck, createTradeRequest, type FilterPreset, type StatFilter } from '../poe1/pricecheck'
import { itemNumbers, pobItemGameText, propKind, type PobItemInfo, type PropKind } from './pobItem'
import type { SlotNeeds } from './slotNeeds'
import type { SlotKind } from './stageItems'

/** Тело запроса трейда ({query, sort}) — то, что принимает tradeWindow.open({ query }). */
export interface TradeBody {
  query: Record<string, unknown>
  sort?: Record<string, string>
}

/** Строка подсказки «В поиск попадут»: что именно ищем. */
export type SearchLine =
  | { kind: 'name'; name: string }
  | { kind: 'type'; base: string }
  | { kind: 'category'; category: string }
  /** стат: ref на английском (# — место числа) и минимум; prop — для иконки */
  | { kind: 'stat'; ref: string; min: number | null; prop: PropKind | null }
  | { kind: 'links'; min: number }
  | { kind: 'level'; max: number }

export interface ItemSearch {
  body: TradeBody
  lines: SearchLine[]
}

export type SearchMode = 'full' | 'cheap'

export interface SearchOptions {
  mode?: SearchMode
  /** уровень персонажа на этапе: вещь должна надеваться */
  level?: number | null
  /** камней в главной связке, если она в этом предмете */
  links?: number | null
}

/** «От ~80 % значения автора, чтобы находилось»: малые числа (≤ 3: уровни камней, заряды) — как есть. */
export function lowMin(value: number, share = 0.8): number {
  const v = Math.abs(value)
  if (v <= 3) return value
  return Math.sign(value) * Math.floor(v * share)
}

const STATUS = { option: 'available' }

/** Предмет PoB через парсер окна цены (EN). Не разобрался — null. */
export function parsePobForTrade(info: PobItemInfo, en: Poe1Data): ParsedItem | null {
  const res = parseItem(pobItemGameText(info), en)
  return res.ok ? res.value : null
}

/** Категория трейда предмета (по базе из данных APT), иначе — по слоту. */
export function tradeCategory(parsed: ParsedItem | null, kind: SlotKind): string | null {
  const cat = parsed?.category ? CATEGORY_TO_TRADE_ID.get(parsed.category) : undefined
  if (cat) return cat
  const bySlot: Partial<Record<SlotKind, string>> = {
    weapon: 'weapon',
    helmet: 'armour.helmet',
    body: 'armour.chest',
    gloves: 'armour.gloves',
    boots: 'armour.boots',
    amulet: 'accessory.amulet',
    ring: 'accessory.ring',
    belt: 'accessory.belt',
    flask: 'flask',
    jewel: 'jewel',
    abyss: 'jewel.abyss'
  }
  return bySlot[kind] ?? null
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let o = obj
  for (const k of path.slice(0, -1)) {
    const next = o[k]
    o = (typeof next === 'object' && next !== null ? next : (o[k] = {})) as Record<string, unknown>
  }
  o[path[path.length - 1]] = value
}

function addLevel(body: TradeBody, lines: SearchLine[], level: number | null | undefined): void {
  if (!level || level < 1 || level >= 100) return
  setPath(body.query, ['filters', 'req_filters', 'filters', 'lvl', 'max'], level)
  lines.push({ kind: 'level', max: level })
}

function addLinks(body: TradeBody, lines: SearchLine[], links: number | null | undefined): void {
  if (!links || links < 2) return
  setPath(body.query, ['filters', 'socket_filters', 'filters', 'links', 'min'], Math.min(6, links))
  lines.push({ kind: 'links', min: Math.min(6, links) })
}

/** trade id стата по английскому ref и типу мода (явный, псевдо…). */
function statId(en: Poe1Data, ref: string, type: ModifierType): string | null {
  const s = en.statByRefV2(ref)
  const stats = s ? ('stats' in s ? s.stats : [s]) : []
  return stats.find((x) => x.ref === ref)?.trade.ids[type]?.[0] ?? null
}

// ---------------------------------------------------------------------------- уник

function uniqueSearch(info: PobItemInfo, en: Poe1Data, opts: SearchOptions): ItemSearch {
  const filters: Array<{ id: string; value?: { min?: number } }> = []
  const lines: SearchLine[] = [{ kind: 'name', name: info.name }]
  // вариант уника отличают его собственные строки ({variant:…}): «Grants Level 22 Envy Skill» у Aul's Uprising;
  // у вариантов-старых версий («Pre 3.19.0» → «Current») строк варианта нет (readPobItem), ищем просто по имени
  if (info.variants > 1) {
    const mods = [...info.implicits.map((m) => ({ m, implicit: true })), ...info.explicits.map((m) => ({ m, implicit: false }))]
    for (const { m, implicit } of mods) {
      if (!m.variant || filters.length >= 3) continue
      const st = matchStatLine(m.text, en, implicit ? [ModifierType.Implicit] : [ModifierType.Explicit])
      const id = st?.stat.trade.ids[st.type]?.[0]
      if (!st || !id) continue
      filters.push({ id })
      lines.push({ kind: 'stat', ref: st.stat.ref, min: null, prop: propKind(st.stat.ref) })
    }
  }
  const body: TradeBody = {
    query: {
      status: STATUS,
      name: info.name,
      type: info.base,
      stats: [{ type: 'and', filters }],
      filters: {
        type_filters: { filters: { rarity: { option: 'unique' } } },
        // Foulborn (мутированный) — отдельно от обычного: другие моды и цена
        misc_filters: { filters: { foulborn_item: { option: String(info.foulborn) } } }
      }
    },
    sort: { price: 'asc' }
  }
  addLinks(body, lines, opts.links && opts.links >= 5 ? Math.min(opts.links, info.links || opts.links) : null)
  return { body, lines }
}

// ---------------------------------------------------------------------------- жёлтая, синяя, белая

const SAME_BASE: ReadonlySet<ItemCategory> = new Set([ItemCategory.Flask, ItemCategory.Jewel, ItemCategory.AbyssJewel, ItemCategory.ClusterJewel, ItemCategory.Tincture])

function pickPreset(presets: FilterPreset[], active: string): FilterPreset | undefined {
  return presets.find((p) => p.id === 'filters.preset_pseudo') ?? presets.find((p) => p.id === active) ?? presets[0]
}

function rareSearch(info: PobItemInfo, parsed: ParsedItem, en: Poe1Data, opts: SearchOptions): ItemSearch | null {
  let pc: { presets: FilterPreset[]; active: string }
  try {
    pc = createPriceCheck(parsed, en, { league: '' })
  } catch {
    return null
  }
  const preset = pickPreset(pc.presets, pc.active)
  if (!preset) return null
  const cheap = opts.mode === 'cheap'
  const f = preset.filters
  // тип по слоту: любая база той же категории (если окно цены это умеет), иначе — та же база; у флаконов и
  // самоцветов база и есть суть предмета (ртутный ≠ флакон жизни, глаз Бездны — тип урона)
  const sameBase = parsed.category !== undefined && SAME_BASE.has(parsed.category)
  if (f.searchRelaxed) f.searchRelaxed.disabled = sameBase || parsed.rarity === ItemRarity.Normal
  if (f.itemLevel) f.itemLevel.disabled = true
  if (f.quality) f.quality.disabled = true
  if (f.linkedSockets) f.linkedSockets.disabled = true
  if (f.whiteSockets) f.whiteSockets.disabled = true
  for (const inf of f.influences ?? []) inf.disabled = true
  if (f.rarity && parsed.rarity === ItemRarity.Normal) f.rarity.disabled = true

  const lines: SearchLine[] = []
  const relaxed = f.searchRelaxed && !f.searchRelaxed.disabled ? f.searchRelaxed : null
  if (relaxed?.category) lines.push({ kind: 'category', category: CATEGORY_TO_TRADE_ID.get(relaxed.category) ?? '' })
  else if (f.searchExact.baseTypeTrade ?? f.searchExact.baseType) lines.push({ kind: 'type', base: (f.searchExact.baseTypeTrade ?? f.searchExact.baseType) as string })

  const flat = preset.stats.filter((s): s is StatFilter => !s.group)
  for (const s of flat) {
    const prop = propKind(s.statRef)
    const keep = !s.hidden && !!prop && (cheap ? prop === 'life' || prop === 'speed' : true) && s.tradeId[0] && !s.tradeId[0].startsWith('item.')
    s.disabled = !keep
    if (!keep) continue
    if (s.roll) {
      s.roll.min = lowMin(s.roll.value)
      s.roll.max = ''
    }
    lines.push({ kind: 'stat', ref: s.statRef, min: s.roll ? (s.roll.min as number) : null, prop })
  }
  for (const g of preset.stats) if (g.group) for (const s of g.stats) s.disabled = true

  const body = createTradeRequest(f, preset.stats, en) as unknown as TradeBody
  if (cheap) {
    // сумма сопротивлений псевдо-статом от ~70 %: вариантов больше, цена ниже
    const r = itemNumbers(info).res
    const sum = r.fire + r.cold + r.lightning
    const id = sum > 0 ? statId(en, '+#% total Elemental Resistance', ModifierType.Pseudo) : null
    if (id) {
      const min = lowMin(sum, 0.7)
      ;(body.query.stats as Array<{ filters: unknown[] }>)[0].filters.push({ id, value: { min } })
      lines.push({ kind: 'stat', ref: '+#% total Elemental Resistance', min, prop: 'res' })
    }
  }
  addLinks(body, lines, opts.links ?? (info.links >= 5 ? info.links : null))
  addLevel(body, lines, opts.level)
  return { body, lines }
}

/** Поиск по базе (если окно цены предмет не разобрало): тип и редкость. */
function baseSearch(info: PobItemInfo, opts: SearchOptions): ItemSearch {
  const body: TradeBody = { query: { status: STATUS, type: info.base, stats: [{ type: 'and', filters: [] }], filters: {} }, sort: { price: 'asc' } }
  const lines: SearchLine[] = [{ kind: 'type', base: info.base }]
  addLinks(body, lines, opts.links)
  addLevel(body, lines, opts.level)
  return { body, lines }
}

/** Поиск «как у автора» (или «дешевле») для предмета этапа; парсер не понял предмет — по базе или null. */
export function itemSearch(info: PobItemInfo, en: Poe1Data, opts: SearchOptions = {}): ItemSearch | null {
  if (info.rarity === 'unique') return uniqueSearch(info, en, opts)
  const parsed = parsePobForTrade(info, en)
  if (parsed) {
    const r = rareSearch(info, parsed, en, opts)
    if (r) return r
  }
  return info.rarity === 'normal' ? baseSearch(info, opts) : null
}

// ---------------------------------------------------------------------------- похожая жёлтая

const RES_ID: Record<string, string> = {
  fire: '+#% total to Fire Resistance',
  cold: '+#% total to Cold Resistance',
  lightning: '+#% total to Lightning Resistance',
  chaos: '+#% total to Chaos Resistance'
}
const ATTR_ID: Record<string, string> = { str: '+# total to Strength', dex: '+# total to Dexterity', int: '+# total to Intelligence' }

/**
 * «Трейд: похожая жёлтая» — редкая вещь того же слота с тем, что нужно от слота (K3): одна группа «и» с минимумами
 * псевдо-статов — нехватка каждой стихии и атрибутов (по статам автора) или сумма стихийных сопротивлений, жизнь
 * (или ЭЩ), скорость, уровни чар. Группу «вес» (как у PoB TradeQueryGenerator) сайт без входа в аккаунт не
 * принимает: «Query is too complex… Logging in will increase this limit» (проверено 31.10.2026), а трейд-окно
 * у игрока может быть без входа — поэтому только «и».
 */
export function similarRareSearch(info: PobItemInfo, kind: SlotKind, needs: SlotNeeds, en: Poe1Data, opts: { level?: number | null } = {}): ItemSearch | null {
  const parsed = parsePobForTrade(info, en)
  const category = tradeCategory(parsed, kind)
  if (!category) return null
  const lines: SearchLine[] = [{ kind: 'category', category }]
  const and: Array<{ id: string; value?: { min?: number } }> = []
  const hard = (ref: string, type: ModifierType, min: number, prop: PropKind): void => {
    const id = statId(en, ref, type)
    if (!id || min <= 0) return
    and.push({ id, value: { min } })
    lines.push({ kind: 'stat', ref, min, prop })
  }
  let links: number | null = null
  for (const n of needs.needs) {
    if (n.id === 'res' && n.sum) hard('+#% total Elemental Resistance', ModifierType.Pseudo, n.value, 'res')
    else if (n.id === 'res') for (const [e, v] of Object.entries(n.res ?? {})) hard(RES_ID[e], ModifierType.Pseudo, v ?? 0, 'res')
    else if (n.id === 'attr') for (const [a, v] of Object.entries(n.attr ?? {})) hard(ATTR_ID[a], ModifierType.Pseudo, v ?? 0, 'build')
    else if (n.id === 'life') hard('+# total maximum Life', ModifierType.Pseudo, n.value, 'life')
    else if (n.id === 'es') hard('+# total maximum Energy Shield', ModifierType.Pseudo, n.value, 'build')
    else if (n.id === 'speed') hard('#% increased Movement Speed', ModifierType.Pseudo, n.value, 'speed')
    else if (n.id === 'spell') hard('+# to Level of all Spell Skill Gems', ModifierType.Explicit, n.value, 'build')
    else if (n.id === 'links') links = n.value
  }
  const body: TradeBody = {
    query: {
      status: STATUS,
      stats: [{ type: 'and', filters: and }],
      filters: { type_filters: { filters: { category: { option: category }, rarity: { option: 'nonunique' } } } }
    },
    sort: { price: 'asc' }
  }
  addLinks(body, lines, links)
  addLevel(body, lines, opts.level)
  return { body, lines }
}
