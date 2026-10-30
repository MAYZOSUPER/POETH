// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/calc-base.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: импорты под нашу структуру, форматирование. Парсером не используется (в EE2 — редактор
// предмета/фильтры: пересчёт свойств после смены рун); перенесено, чтобы UI прайс-чека PoE2 мог им пользоваться.

import { isArmourOrWeaponOrCaster } from './Parser'
import type { ParsedItem } from './ParsedItem'
import { calcFlat, calcIncreased, calcPropBase, OTHER_PSEUDO_STATS, QUALITY_STATS } from './calc-q20'
import { ARMOUR, WEAPON } from './meta'

export function recalculateItemProperties(newItem: ParsedItem, oldItem: ParsedItem) {
  if (newItem.category !== oldItem.category || !newItem.category) return

  if (ARMOUR.has(newItem.category)) {
    recalculateArmourProperties(newItem, oldItem)
  }
  if (WEAPON.has(newItem.category)) {
    recalculateWeaponProperties(newItem, oldItem)
  }
}

function recalculateWeaponProperties(newItem: ParsedItem, oldItem: ParsedItem) {
  // phys
  const basePHYSICAL = calcBase(oldItem, oldItem.weaponPHYSICAL, QUALITY_STATS.PHYSICAL_DAMAGE)
  newItem.weaponPHYSICAL = calcTotal(basePHYSICAL, newItem, QUALITY_STATS.PHYSICAL_DAMAGE)

  // attack speed
  const baseAS = calcBase(oldItem, oldItem.weaponAS, OTHER_PSEUDO_STATS.ATTACK_SPEED, false)
  newItem.weaponAS = calcTotal(baseAS, newItem, OTHER_PSEUDO_STATS.ATTACK_SPEED, false)

  // fire damage
  const baseFIRE = calcBase(oldItem, oldItem.weaponFIRE, OTHER_PSEUDO_STATS.FIRE_DAMAGE, false)
  newItem.weaponFIRE = calcTotal(baseFIRE, newItem, OTHER_PSEUDO_STATS.FIRE_DAMAGE, false)

  // cold damage
  const baseCOLD = calcBase(oldItem, oldItem.weaponCOLD, OTHER_PSEUDO_STATS.COLD_DAMAGE, false)
  newItem.weaponCOLD = calcTotal(baseCOLD, newItem, OTHER_PSEUDO_STATS.COLD_DAMAGE, false)

  // lightning damage
  const baseLIGHTNING = calcBase(oldItem, oldItem.weaponLIGHTNING, OTHER_PSEUDO_STATS.LIGHTNING_DAMAGE, false)
  newItem.weaponLIGHTNING = calcTotal(baseLIGHTNING, newItem, OTHER_PSEUDO_STATS.LIGHTNING_DAMAGE, false)

  // elemental damage
  const baseELEMENTAL = calcBase(oldItem, oldItem.weaponELEMENTAL, OTHER_PSEUDO_STATS.ELEMENTAL_DAMAGE, false)
  newItem.weaponELEMENTAL = calcTotal(baseELEMENTAL, newItem, OTHER_PSEUDO_STATS.ELEMENTAL_DAMAGE, false)

  // other properties
  const baseCRIT = calcBase(oldItem, oldItem.weaponCRIT, OTHER_PSEUDO_STATS.CRIT_CHANCE)
  newItem.weaponCRIT = calcTotal(baseCRIT, newItem, OTHER_PSEUDO_STATS.CRIT_CHANCE)

  const baseSPIRIT = calcBase(oldItem, oldItem.weaponSPIRIT, OTHER_PSEUDO_STATS.SPIRIT)
  newItem.weaponSPIRIT = calcTotal(baseSPIRIT, newItem, OTHER_PSEUDO_STATS.SPIRIT)
}

function recalculateArmourProperties(newItem: ParsedItem, oldItem: ParsedItem) {
  if (newItem.armourAR) {
    const base = calcBase(oldItem, oldItem.armourAR, QUALITY_STATS.ARMOUR)
    newItem.armourAR = calcTotal(base, newItem, QUALITY_STATS.ARMOUR)
  }
  if (newItem.armourEV) {
    const base = calcBase(oldItem, oldItem.armourEV, QUALITY_STATS.EVASION)
    newItem.armourEV = calcTotal(base, newItem, QUALITY_STATS.EVASION)
  }
  if (newItem.armourES) {
    const base = calcBase(oldItem, oldItem.armourES, QUALITY_STATS.ENERGY_SHIELD)
    newItem.armourES = calcTotal(base, newItem, QUALITY_STATS.ENERGY_SHIELD)
  }
  if (newItem.armourRW) {
    const base = calcBase(oldItem, oldItem.armourRW, QUALITY_STATS.WARD)
    newItem.armourRW = calcTotal(base, newItem, QUALITY_STATS.WARD)
  }
  if (newItem.armourBLOCK) {
    const base = calcBase(oldItem, oldItem.armourBLOCK, OTHER_PSEUDO_STATS.BLOCK)
    newItem.armourBLOCK = calcTotal(base, newItem, OTHER_PSEUDO_STATS.BLOCK)
  }
}

/** `type` — английское имя руны (refName). */
export function applyEleAugment(item: ParsedItem, type: string, values: number[]) {
  const { category } = item
  const weaponOrArmour = isArmourOrWeaponOrCaster(category)
  if (weaponOrArmour === undefined || weaponOrArmour === 'armour' || weaponOrArmour === 'caster') return
  if (values.length !== 2) return
  const adding = values.reduce((a, b) => a + b) / 2
  if (item.weaponELEMENTAL) {
    item.weaponELEMENTAL += adding
  } else {
    item.weaponELEMENTAL = adding
  }
  switch (type) {
    case 'Glacial Rune':
    case 'Lesser Glacial Rune':
    case 'Greater Glacial Rune':
      if (item.weaponCOLD) {
        item.weaponCOLD += adding
      } else {
        item.weaponCOLD = adding
      }
      break
    case 'Storm Rune':
    case 'Lesser Storm Rune':
    case 'Greater Storm Rune':
      if (item.weaponLIGHTNING) {
        item.weaponLIGHTNING += adding
      } else {
        item.weaponLIGHTNING = adding
      }
      break
    case 'Desert Rune':
    case 'Lesser Desert Rune':
    case 'Greater Desert Rune':
      if (item.weaponFIRE) {
        item.weaponFIRE += adding
      } else {
        item.weaponFIRE = adding
      }
      break
    default:
      break
  }
}

export function calcBase(
  item: ParsedItem,
  inStat: number | undefined,
  statRefs: { flat: string[]; incr: string[] },
  useQuality = true
) {
  const { incr, flat } = calcPropBase(statRefs, item)
  return calcFlat(inStat ?? 0, incr.value, useQuality ? (item.quality ?? 0) : 0) - flat.value
}

export function calcTotal(
  base: number,
  item: ParsedItem,
  statRefs: { flat: string[]; incr: string[] },
  useQuality = true,
  inverted = false
) {
  const { incr, flat } = calcPropBase(statRefs, item)
  return calcIncreased(base + flat.value, incr.value, useQuality ? (item.quality ?? 0) : 0, inverted)
}

export function calcBaseDamage(item: ParsedItem) {
  const { category } = item
  if (isArmourOrWeaponOrCaster(category) !== 'weapon') return 0
  const { weaponPHYSICAL } = item
  // Damage = (Base_Damage + Added_Damage) * Increased_Damage * More_Damage
  //           * Hit_Rate * (Critical_Strike_Damage * Critical_Strike_Chance)
  //           (Ignore Hit_Rate and crit stuff)

  const { incr, flat } = calcPropBase(QUALITY_STATS.PHYSICAL_DAMAGE, item)
  return calcFlat(weaponPHYSICAL ?? 0, incr.value, item.quality) - flat.value
}

export function calcTotalDamage(item: ParsedItem, baseDamage: number) {
  const { category } = item
  if (isArmourOrWeaponOrCaster(category) !== 'weapon') return 0
  // Damage = (Base_Damage + Added_Damage) * Increased_Damage * More_Damage
  //           * Hit_Rate * (Critical_Strike_Damage * Critical_Strike_Chance)
  //           (Ignore Hit_Rate and crit stuff)

  const { incr, flat } = calcPropBase(QUALITY_STATS.PHYSICAL_DAMAGE, item)
  return calcIncreased(baseDamage + flat.value, incr.value, item.quality ?? 0)
}
