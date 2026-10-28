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

/** Тир T1–T2 — «лучшие» диапазоны: такие моды и делают редкий предмет дорогим. */
export const KEY_TIER = 2

/** Псевдо-статы, которые почти всегда влияют на цену брони и бижутерии. */
const KEY_PSEUDO = new Set([
  '+#% total Elemental Resistance',
  '+# total maximum Life',
  '+#% total to Chaos Resistance',
  '#% increased Movement Speed'
])

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
    const tier = bestTier(f)
    if (f.tag === FilterTag.Pseudo) {
      if (KEY_PSEUDO.has(f.statRef) || (tier !== undefined && tier <= KEY_TIER)) {
        enable(f)
        enabled++
      }
    } else if (EXPLICIT_TAGS.has(f.tag) && tier !== undefined && tier <= KEY_TIER) {
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
