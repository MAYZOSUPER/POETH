// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/augment-builder.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: данные языка параметром; getSavedAugments принимает настройку `savedAugments` параметром
// (в EE2 — AppConfig('price-check').savedAugments) и парсером не вызывается: автозаполнение пустых гнёзд
// сохранёнными рунами в EE2 делает item-editor (useAugment) — это UI, не перенесено.

import type { AugmentLineData, BaseType } from '../data/interfaces'
import type { Poe2Data } from '../data/Poe2Data'
import { ARMOUR, ItemCategory, MARTIAL_WEAPON } from './meta'
import type { EditorItem, ParsedItem } from './ParsedItem'
import { replaceHashWithValues } from './utils'

/** EE2: настройка прайс-чека `savedAugments` — категория предмета (или группа) → refName рун по гнёздам. */
export type SavedAugments = Partial<Record<string, Array<string | null>>>

export function selectAugmentEffectByItemCategory(
  category: ItemCategory,
  rune: BaseType['augment']
): AugmentLineData[] | undefined {
  if (!rune) return

  return rune.filter((rune) => rune.categories.includes(category))
}

export function buildEditorItems(augments: BaseType[], category: ItemCategory, existing?: true): EditorItem[] {
  return augments
    .map((augment) => {
      const effect = selectAugmentEffectByItemCategory(category, augment.augment)
      if (!effect || !effect.length) return undefined
      return buildEditorItem(augment, effect, existing)
    })
    .filter((augment): augment is EditorItem => augment !== undefined)
}

function zipHashAndValues(strings?: string[], values?: number[][]): string {
  if (!strings || !values) return "ns(shouldn't see this)"

  // if each value array is not the same, return empty
  if (!values.every((v) => v.length === values[0].length && v.every((v, i) => v === values[0][i])))
    return "ve(shouldn't see this)"

  const valueGenerator = values[0].values()

  const outString = strings
    .map((str) => {
      const replaceCount = str.match(/#/g)?.length ?? 0
      const valuesToAdd: number[] = []
      for (let i = 0; i < replaceCount; i++) {
        valuesToAdd.push(valueGenerator.next().value ?? 0)
      }
      return replaceHashWithValues(str, valuesToAdd)
    })
    .join('\n')

  return outString
}

function buildEditorItem(augment: BaseType, stats: AugmentLineData[], existing?: true): EditorItem {
  return {
    existing,
    name: augment.name,
    refName: augment.refName,
    icon: augment.icon,
    displayString: zipHashAndValues(
      stats?.map((s) => s.string),
      stats?.map((s) => s.values)
    ),
    stats,
    baseItem: augment
  }
}

export function getSavedAugments(item: ParsedItem, lookup: SavedAugments, d: Poe2Data): Array<BaseType | null> {
  if (!item.augmentSockets) return []

  let refNames: Array<string | null> = []
  if (item.category && lookup[item.category]?.length) {
    refNames = lookup[item.category]!
  } else if (item.category && MARTIAL_WEAPON.has(item.category) && lookup.martialWeapon?.length) {
    refNames = lookup.martialWeapon
  } else if (
    (item.category === ItemCategory.Wand || item.category === ItemCategory.Staff) &&
    lookup.casterWeapon?.length
  ) {
    refNames = lookup.casterWeapon
  } else if (item.category && ARMOUR.has(item.category) && lookup.armour?.length) {
    refNames = lookup.armour
  } else if (lookup.all?.length) {
    refNames = lookup.all
  }

  return refNames.map((refName) => {
    if (!refName) return null
    return d.itemByRef('ITEM', refName)?.[0] ?? null
  })
}
