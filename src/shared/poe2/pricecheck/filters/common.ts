// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/common.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: импорты под нашу структуру, форматирование.

import { type ParsedItem, ItemCategory, ItemRarity, itemIsModifiable, EXPLICIT_MOD_TYPES, ModifierType } from '../../parser'

/** Выше этого уровня предмета моды не становятся лучше (для фильтра ilvl). */
export function maxUsefulItemLevel(category: ItemCategory | undefined) {
  const itemLevelCaps: Partial<Record<ItemCategory, number>> = {
    [ItemCategory.Wand]: 81,
    [ItemCategory.Staff]: 81,
    [ItemCategory.Relic]: 80,
    [ItemCategory.Tablet]: 1,
    [ItemCategory.Jewel]: 1,
    [ItemCategory.Map]: 1
  }

  const maxUsefulItemLevel = category ? (itemLevelCaps[category] ?? 82) : 82
  return maxUsefulItemLevel
}

/** Похоже на готовый предмет (уник, крафт, 20 % качества, нельзя менять) — пресет «база» не нужен. */
export function likelyFinishedItem(item: ParsedItem) {
  return (
    item.rarity === ItemRarity.Unique ||
    item.statsByType.some((calc) => calc.type === ModifierType.Crafted) ||
    (item.quality === 20 && !item.qualityType) || // quality > 20 can be used for selling bases, quality < 20 drops sometimes
    !itemIsModifiable(item)
  )
}

/** У базы есть ценность для крафта (высокий ilvl, лишнее гнездо, качество > 20, расколотый…). */
export function hasCraftingValue(item: ParsedItem) {
  return (
    itemIsModifiable(item) &&
    // Base useful crafting item (synth and influence not in poe2 yet though)
    Boolean(
      item.isSynthesised ||
        item.isFractured ||
        item.influences.length ||
        // Clusters (deprecated)
        item.category === ItemCategory.ClusterJewel ||
        // Jewels
        (item.category === ItemCategory.Jewel && item.rarity === ItemRarity.Magic) ||
        // High ilvl (minus 15, seems like low ilevel ones still kinda sell?)
        item.itemLevel! >= maxUsefulItemLevel(item.category) - 15 ||
        // is exceptional item
        (item.augmentSockets && item.augmentSockets.current > item.augmentSockets.normal) ||
        (item.quality && item.quality > 20)
    )
  )
}

export function explicitModifierCount(item: ParsedItem) {
  const randomMods = item.newMods.filter((mod) => EXPLICIT_MOD_TYPES.has(mod.info.type))
  if (randomMods.length === 0) {
    return { prefixes: 0, suffixes: 0, total: 0 }
  }

  const prefixes = randomMods.filter((mod) => mod.info.generation === 'prefix').length
  const suffixes = randomMods.filter((mod) => mod.info.generation === 'suffix').length

  return {
    prefixes,
    suffixes,
    total: prefixes + suffixes
  }
}
