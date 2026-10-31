// Класс предмета PoE 2 на английском для строки «Item Class: …» (S61: «предмет по-английски» для PoE 2, как
// itemClassEn.ts S51 у PoE 1; чистый модуль, tests/build/poe2ItemEn.test.ts).
//   - сначала — по строке класса RU-клиента: названия классов — LocalIdentity/poe2-data @ 6a49dbd (те же, что у
//     генератора RU-фикстур tools/data/make-poe2-ru-fixtures.mjs), кроме помеченных «свой»;
//   - нет в таблице — по категории разбора; не узнали — строка как есть (её игрок увидит в Discord, PoB её пропускает).

import { ItemCategory } from '../poe2/parser/meta'

/** «Класс предмета: …» RU-клиента PoE 2 → EN. */
const RU_EN: Readonly<Record<string, string>> = {
  Амулеты: 'Amulets',
  Пояса: 'Belts',
  'Нательные доспехи': 'Body Armours',
  Обувь: 'Boots',
  Луки: 'Bows',
  Баклеры: 'Bucklers',
  Обереги: 'Charms',
  Когти: 'Claws',
  Самострелы: 'Crossbows',
  Кинжалы: 'Daggers',
  Кистени: 'Flails',
  Фокусы: 'Foci',
  Перчатки: 'Gloves',
  Шлемы: 'Helmets',
  Самоцветы: 'Jewels',
  'Флаконы жизни': 'Life Flasks',
  'Флаконы маны': 'Mana Flasks',
  'Одноручные топоры': 'One Hand Axes',
  'Одноручные булавы': 'One Hand Maces',
  'Одноручные мечи': 'One Hand Swords',
  'Боевые посохи': 'Quarterstaves',
  Колчаны: 'Quivers',
  Реликвии: 'Relics',
  Кольца: 'Rings',
  Скипетры: 'Sceptres',
  Щиты: 'Shields',
  'Камни умений': 'Skill Gems',
  Копья: 'Spears',
  Валюта: 'Stackable Currency',
  Посохи: 'Staves',
  'Камни поддержки': 'Support Gems',
  Плитки: 'Tablet',
  'Двуручные топоры': 'Two Hand Axes',
  'Двуручные булавы': 'Two Hand Maces',
  'Двуручные мечи': 'Two Hand Swords',
  Жезлы: 'Wands',
  'Путевые камни': 'Waystones',
  // свой: в poe2-data @ 6a49dbd у этих классов пустые названия
  'Неогранённые камни умений': 'Uncut Skill Gems',
  'Неогранённые камни духа': 'Uncut Spirit Gems',
  'Неогранённые камни поддержки': 'Uncut Support Gems'
}

const BY_CATEGORY: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Helmet]: 'Helmets',
  [ItemCategory.BodyArmour]: 'Body Armours',
  [ItemCategory.Gloves]: 'Gloves',
  [ItemCategory.Boots]: 'Boots',
  [ItemCategory.Shield]: 'Shields',
  [ItemCategory.Buckler]: 'Bucklers',
  [ItemCategory.Focus]: 'Foci',
  [ItemCategory.Amulet]: 'Amulets',
  [ItemCategory.Belt]: 'Belts',
  [ItemCategory.Ring]: 'Rings',
  [ItemCategory.Jewel]: 'Jewels',
  [ItemCategory.Quiver]: 'Quivers',
  [ItemCategory.Charm]: 'Charms',
  [ItemCategory.Claw]: 'Claws',
  [ItemCategory.Bow]: 'Bows',
  [ItemCategory.Crossbow]: 'Crossbows',
  [ItemCategory.Sceptre]: 'Sceptres',
  [ItemCategory.Wand]: 'Wands',
  [ItemCategory.Staff]: 'Staves',
  [ItemCategory.Warstaff]: 'Quarterstaves',
  [ItemCategory.Dagger]: 'Daggers',
  [ItemCategory.Spear]: 'Spears',
  [ItemCategory.Flail]: 'Flails',
  [ItemCategory.OneHandedAxe]: 'One Hand Axes',
  [ItemCategory.TwoHandedAxe]: 'Two Hand Axes',
  [ItemCategory.OneHandedMace]: 'One Hand Maces',
  [ItemCategory.TwoHandedMace]: 'Two Hand Maces',
  [ItemCategory.OneHandedSword]: 'One Hand Swords',
  [ItemCategory.TwoHandedSword]: 'Two Hand Swords',
  [ItemCategory.Waystone]: 'Waystones',
  [ItemCategory.Relic]: 'Relics',
  [ItemCategory.Tablet]: 'Tablet',
  [ItemCategory.Currency]: 'Stackable Currency',
  [ItemCategory.SkillGem]: 'Skill Gems',
  [ItemCategory.SupportGem]: 'Support Gems'
}

/** «Нательные доспехи» → «Body Armours»; EN-строка (или неизвестная) — как есть, иначе по категории. */
export function poe2ItemClassEn(srcClass: string, category?: ItemCategory): string {
  const cls = srcClass.trim()
  const known = RU_EN[cls]
  if (known) return known
  // строка уже латиницей (EN-клиент или новый класс без перевода) — как есть
  if (cls && !/[А-Яа-яЁё]/.test(cls)) return cls
  return (category && BY_CATEGORY[category]) ?? cls
}
