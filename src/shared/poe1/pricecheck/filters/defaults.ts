// POETH: что отмечено сразу после Ctrl+D. В порте APT по умолчанию включены только псевдо-суммы сопротивлений
// и здоровья, а явные моды выключены — у предмета без жизни и резистов не было отмечено ничего. Здесь —
// умолчания по типу предмета (для новичка: отмечено то, что сильнее всего влияет на цену) и ключ подсказки
// «почему так». Минимум у включённых фильтров — тот, что посчитал порт APT (−10 % от ролла в пределах тира).

import { ItemCategory, ItemRarity, WEAPON, type ParsedItem } from '../../parser'
import { ModifierMechanic, ModifierType } from '../../parser/modifiers'
import { FilterTag, type FilterPreset, type StatFilter } from './interfaces'

/** i18n-ключи подсказки «почему отмечено именно это» (pc1.defaults.*) */
export type DefaultsHint =
  | 'rare'
  | 'rareNone'
  | 'unid'
  | 'magic'
  | 'unique'
  | 'timeless'
  | 'gem'
  | 'map'
  | 'bulk'

/** Тир T1–T2 — «лучшие» диапазоны: прочие моды редкого отмечаются только такими. */
export const KEY_TIER = 2

/** Тир T1–T3 — «приличный» для урона, крита, уровней камней, подавления (у них много тиров). */
export const GOOD_TIER = 3

// S23 (живая проверка rc.8): у редкого кольца с +44 к мане отмечались только суммы сопротивлений и T2 скорость
// чар — цена вышла 1 alch при 10 000 «похожих», а с маной — 20 c. Галочки ставим так, как отметил бы опытный
// игрок, по ценности свойства для покупателя:
//  - ALWAYS — при любом ролле: жизнь, мана, ES, суммы сопротивлений, скорости передвижения / атаки / чар.
//    Предмет без них — другой предмет; слабый ролл почти не сужает поиск (минимум — −10 % от ролла).
//  - GOOD — урон чар / физ. / стихийный, крит, «+ к уровню камней», подавление, множитель DoT, заряды:
//    у этих модов много тиров, цену делают только верхние (T1–T3). Без тира (обычный Ctrl+C) — только
//    «+1» к камням и зарядам: такой ролл ценен всегда.
//  - JUNK — не отмечается даже T1: точность, радиус света, оглушение, шипы, «здоровье за удар», плоская
//    броня и уклонение на бижутерии (на броне они уже внутри свойства «Броня / Уклонение»).
//  - остальное — как раньше: только T1–T2.

/** Отмечаются при любом ролле (псевдо-суммы и %здоровья самоцветов). */
const ALWAYS = new Set([
  '+# total maximum Life',
  '+# total maximum Mana',
  '+# total maximum Energy Shield',
  '#% total increased maximum Energy Shield',
  '#% increased maximum Life',
  '+#% total Elemental Resistance',
  '+#% total to Chaos Resistance',
  '#% increased Movement Speed',
  '+#% total Attack Speed',
  '+#% total Cast Speed'
])

/** Отмечаются при тире T1–T3. */
const GOOD = new Set([
  '+#% Global Critical Strike Chance',
  '+#% total Critical Strike Chance for Spells',
  '#% increased Spell Critical Strike Chance',
  '+#% Global Critical Strike Multiplier',
  '+#% to Critical Strike Multiplier for Spell Damage',
  '#% increased Spell Damage',
  '#% increased Lightning Spell Damage',
  '#% increased Cold Spell Damage',
  '#% increased Fire Spell Damage',
  '#% increased Elemental Damage',
  '#% increased Lightning Damage',
  '#% increased Cold Damage',
  '#% increased Fire Damage',
  '#% increased Chaos Damage',
  '#% increased Elemental Damage with Attack Skills',
  '#% increased Burning Damage',
  '#% total increased Physical Damage',
  '#% increased Damage over Time',
  '+#% to Damage over Time Multiplier',
  '+#% to Chaos Damage over Time Multiplier',
  '+#% to Cold Damage over Time Multiplier',
  '+#% to Fire Damage over Time Multiplier',
  '+#% to Physical Damage over Time Multiplier',
  '+#% chance to Suppress Spell Damage',
  '#% increased Attack and Cast Speed',
  'Minions deal #% increased Damage',
  'Minions have #% increased Attack and Cast Speed',
  '#% increased maximum Mana',
  'Adds # to # Physical Damage to Spells',
  'Adds # to # Fire Damage to Spells',
  'Adds # to # Cold Damage to Spells',
  'Adds # to # Lightning Damage to Spells',
  'Adds # to # Chaos Damage to Spells'
])

/** «+1» ценен при любом ролле: уровни камней и максимум зарядов. */
const ANY_ROLL = [/^\+# to Level of (all|Socketed) [\w' -]*Gems$/, /^\+# to Maximum (Frenzy|Power|Endurance) Charges$/]

/** Не отмечаются даже T1. */
const JUNK = new Set([
  '+# to Accuracy Rating',
  '#% increased Global Accuracy Rating',
  '#% increased Light Radius',
  '#% increased Stun and Block Recovery',
  '#% reduced Enemy Stun Threshold',
  '#% increased Stun Duration on Enemies',
  '#% increased Stun Threshold',
  '#% chance to Avoid being Stunned',
  'Reflects # Physical Damage to Melee Attackers',
  'Grants # Life per Enemy Hit',
  'Gain # Life per Enemy Hit with Attacks',
  '+# to Armour',
  '+# to Evasion Rating',
  '#% reduced Attribute Requirements'
])

type Worth = 'always' | 'good' | 'junk' | 'other'

/** Ценность свойства для покупателя редкого предмета (по ref стата — одинаково для EN и RU). */
export function statWorth(ref: string): Worth {
  if (ALWAYS.has(ref)) return 'always'
  if (JUNK.has(ref)) return 'junk'
  if (GOOD.has(ref) || ANY_ROLL.some((re) => re.test(ref))) return 'good'
  return 'other'
}

/** Оружие заклинателя: цену делают моды заклинаний, а не DPS атак. */
const CASTER_WEAPONS = new Set<ItemCategory>([ItemCategory.Wand, ItemCategory.Sceptre, ItemCategory.Staff, ItemCategory.RuneDagger])

const EXPLICIT_TAGS = new Set<string>([
  ModifierType.Explicit,
  ModifierType.Fractured,
  ModifierMechanic.Shaper,
  ModifierMechanic.Elder,
  ModifierMechanic.Crusader,
  ModifierMechanic.Hunter,
  ModifierMechanic.Redeemer,
  ModifierMechanic.Warlord,
  ModifierMechanic.Delve,
  ModifierMechanic.Unveiled,
  ModifierMechanic.Incursion,
  ModifierMechanic.Essence,
  ModifierMechanic.Infamous
])

function bestTier(f: StatFilter): number | undefined {
  let best: number | undefined
  for (const s of f.sources) {
    const t = s.modifier.info.tier
    // крафтовые моды докупаются у верстака — цену не делают
    if (t == null || s.modifier.info.type === ModifierType.Crafted) continue
    if (best === undefined || t < best) best = t
  }
  return best
}

/** Отметил бы опытный игрок этот мод / псевдо-стат редкого предмета (правила — в начале файла). */
function wanted(f: StatFilter): boolean {
  const worth = statWorth(f.statRef)
  if (worth === 'always') return true
  if (worth === 'junk') return false
  const tier = bestTier(f)
  if (tier !== undefined) return tier <= (worth === 'good' ? GOOD_TIER : KEY_TIER)
  // тира нет: обычный Ctrl+C или только крафт с верстака (его докупают — цену не делает)
  return (
    worth === 'good' &&
    ANY_ROLL.some((re) => re.test(f.statRef)) &&
    f.sources.some((s) => s.modifier.info.type !== ModifierType.Crafted)
  )
}

function enable(f: StatFilter): void {
  f.disabled = false
  if (f.roll && f.roll.min === undefined && f.roll.max === undefined) {
    f.roll.min = f.roll.default.min
  }
}

function statFilters(preset: FilterPreset): StatFilter[] {
  return preset.stats.filter((s): s is StatFilter => !s.group && !s.hidden && !s.not && !s.fromSite)
}

/** DPS для оружия: общий, иначе физический, иначе стихийный. */
function enableWeaponDps(filters: StatFilter[]): boolean {
  for (const id of ['item.total_dps', 'item.physical_dps', 'item.elemental_dps']) {
    const f = filters.find((x) => x.tradeId[0] === id)
    if (f) {
      enable(f)
      f.hidden = undefined
      return true
    }
  }
  return false
}

/** Отметить фильтры пресета по умолчанию; вернуть ключ подсказки (или undefined — без подсказки). */
export function applyDefaultSelection(item: ParsedItem, preset: FilterPreset): DefaultsHint | undefined {
  const { filters } = preset

  if (preset.id === 'filters.preset_bulk' || (!item.rarity && item.category !== ItemCategory.Gem)) {
    return item.category === ItemCategory.Map ? 'map' : 'bulk'
  }

  if (item.category === ItemCategory.Gem) {
    if (filters.gemLevel) filters.gemLevel.disabled = false
    if (filters.quality && item.quality) filters.quality.disabled = false
    return 'gem'
  }

  if (item.category === ItemCategory.Map) {
    if (filters.mapTier) filters.mapTier.disabled = false
    return 'map'
  }

  if (item.rarity === ItemRarity.Unique) {
    if (filters.linkedSockets) filters.linkedSockets.disabled = false
    // порча меняет цену уника в обе стороны — ищем ровно такой же
    if (filters.corrupted && item.isCorrupted) filters.corrupted.exact = true
    return preset.timeless ? 'timeless' : 'unique'
  }

  if (item.isUnidentified) return 'unid'
  if (item.rarity === ItemRarity.Normal) return undefined

  const stats = statFilters(preset)

  // у волшебных предметов модов мало, и все они — цена (флаконы, самоцветы, тинктуры)
  if (item.rarity === ItemRarity.Magic) {
    for (const f of stats) if (EXPLICIT_TAGS.has(f.tag) || f.tag === FilterTag.Variant) enable(f)
    return 'magic'
  }

  let enabled = 0
  for (const f of stats) {
    if ((f.tag === FilterTag.Pseudo || EXPLICIT_TAGS.has(f.tag)) && wanted(f)) {
      enable(f)
      enabled++
    } else if (!f.disabled && f.tag !== FilterTag.Property) {
      // включено правилами APT (кластеры, варианты, заметные свойства)
      enabled++
    }
  }
  if (
    item.category &&
    WEAPON.has(item.category) &&
    !CASTER_WEAPONS.has(item.category) &&
    enableWeaponDps(preset.stats.filter((s): s is StatFilter => !s.group))
  ) {
    enabled++
  }
  if (filters.linkedSockets) filters.linkedSockets.disabled = false
  return enabled ? 'rare' : 'rareNone'
}
