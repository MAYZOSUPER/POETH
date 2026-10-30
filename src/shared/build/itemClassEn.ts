// Класс предмета на английском для строки «Item Class: …» (S51: текст предмета для буфера — как Ctrl+C игры;
// чистый модуль, tests/build/itemEnCopy.test.ts). PoB строку класса пропускает (класс он знает по базе), парсеру APT
// нужна сама строка, игроку в англоязычном Discord — понятное слово.
//   - сначала — по строке класса RU-клиента: пары фикстур RU/EN (тот же предмет с ru. и www.pathofexile.com);
//   - нет в таблице — по категории разбора; у флаконов — по английской базе.

import { ItemCategory } from '../poe1/parser/meta'

/** «Класс предмета: …» RU-клиента → EN (все пары tests/fixtures/poe1). */
const RU_EN: Readonly<Record<string, string>> = {
  Амулеты: 'Amulets',
  Пояса: 'Belts',
  Доспехи: 'Body Armours',
  Обувь: 'Boots',
  Луки: 'Bows',
  Когти: 'Claws',
  Кинжалы: 'Daggers',
  'Гадальные карты': 'Divination Cards',
  Перчатки: 'Gloves',
  Шлемы: 'Helmets',
  Самоцветы: 'Jewels',
  'Флаконы жизни': 'Life Flasks',
  'Флаконы маны': 'Mana Flasks',
  Карты: 'Maps',
  'Одноручные топоры': 'One Hand Axes',
  'Одноручные булавы': 'One Hand Maces',
  Кольца: 'Rings',
  Щиты: 'Shields',
  'Камни умений': 'Skill Gems',
  'Стопки валюты': 'Stackable Currency',
  'Камни поддержки': 'Support Gems',
  Шпаги: 'Thrusting One Hand Swords',
  'Двуручные булавы': 'Two Hand Maces',
  'Двуручные мечи': 'Two Hand Swords',
  'Особые флаконы': 'Utility Flasks',
  Жезлы: 'Wands',
  'Воинские посохи': 'Warstaves'
}

const BY_CATEGORY: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Map]: 'Maps',
  [ItemCategory.Helmet]: 'Helmets',
  [ItemCategory.BodyArmour]: 'Body Armours',
  [ItemCategory.Gloves]: 'Gloves',
  [ItemCategory.Boots]: 'Boots',
  [ItemCategory.Shield]: 'Shields',
  [ItemCategory.Amulet]: 'Amulets',
  [ItemCategory.Belt]: 'Belts',
  [ItemCategory.Ring]: 'Rings',
  [ItemCategory.AbyssJewel]: 'Abyss Jewels',
  [ItemCategory.Jewel]: 'Jewels',
  [ItemCategory.ClusterJewel]: 'Jewels',
  [ItemCategory.Quiver]: 'Quivers',
  [ItemCategory.Claw]: 'Claws',
  [ItemCategory.Bow]: 'Bows',
  [ItemCategory.Sceptre]: 'Sceptres',
  [ItemCategory.Wand]: 'Wands',
  [ItemCategory.FishingRod]: 'Fishing Rods',
  [ItemCategory.Staff]: 'Staves',
  [ItemCategory.Warstaff]: 'Warstaves',
  [ItemCategory.Dagger]: 'Daggers',
  [ItemCategory.RuneDagger]: 'Rune Daggers',
  [ItemCategory.OneHandedAxe]: 'One Hand Axes',
  [ItemCategory.TwoHandedAxe]: 'Two Hand Axes',
  [ItemCategory.OneHandedMace]: 'One Hand Maces',
  [ItemCategory.TwoHandedMace]: 'Two Hand Maces',
  [ItemCategory.OneHandedSword]: 'One Hand Swords',
  [ItemCategory.TwoHandedSword]: 'Two Hand Swords',
  [ItemCategory.Tincture]: 'Tinctures',
  [ItemCategory.Gem]: 'Skill Gems',
  [ItemCategory.Currency]: 'Stackable Currency',
  [ItemCategory.DivinationCard]: 'Divination Cards'
}

/**
 * Класс предмета на английском. `srcClass` — значение строки класса на языке клиента («Кольца»), `category` — категория
 * разбора, `baseEn` — английская база (у флаконов класс зависит от неё).
 */
export function itemClassEn(srcClass: string, category: ItemCategory | undefined, baseEn: string): string {
  const known = RU_EN[srcClass.trim()]
  if (known) return known
  if (category === ItemCategory.Flask) {
    if (/\bLife Flask$/.test(baseEn)) return 'Life Flasks'
    if (/\bMana Flask$/.test(baseEn)) return 'Mana Flasks'
    if (/\bHybrid Flask$/.test(baseEn)) return 'Hybrid Flasks'
    return 'Utility Flasks'
  }
  return (category && BY_CATEGORY[category]) ?? category ?? 'Items'
}
