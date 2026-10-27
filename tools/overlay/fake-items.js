// Образцы текста предметов для тестового окна (tools/overlay/fake-game.cjs).
// СИНТЕТИЧЕСКИЕ: формат как у копирования PoE 1 3.29 (расширенный, с тирами), но тексты
// RU приблизительные — это не фикстуры парсера (настоящие — tests/fixtures/poe1/{en,ru}, S2).
// Для проверки цикла захвата важна первая строка (Item Class / Класс предмета).

/* eslint-disable */
window.FAKE_ITEMS = [
  {
    id: 'en-rare',
    panel: 'inv',
    label: 'Sorcerer Gloves',
    lang: 'en',
    color: '#e8d36d',
    text: [
      'Item Class: Gloves',
      'Rarity: Rare',
      'Grim Grasp',
      'Sorcerer Gloves',
      '--------',
      'Energy Shield: 98 (augmented)',
      '--------',
      'Requirements:',
      'Level: 69',
      'Int: 97',
      '--------',
      'Sockets: B-B-R-G ',
      '--------',
      'Item Level: 84',
      '--------',
      '{ Prefix Modifier "Fecund" (Tier: 2) — Life }',
      '+81(80-89) to maximum Life',
      '{ Prefix Modifier "Shimmering" (Tier: 4) — Defences, Energy Shield }',
      '+31(27-34) to maximum Energy Shield',
      '{ Suffix Modifier "of the Volcano" (Tier: 4) — Elemental, Fire, Resistance }',
      '+38(36-41)% to Fire Resistance',
      '{ Suffix Modifier "of the Comet" (Tier: 5) — Elemental, Cold, Resistance }',
      '+25(24-29)% to Cold Resistance'
    ]
  },
  {
    id: 'ru-rare',
    panel: 'inv',
    label: 'Перчатки чародея',
    lang: 'ru',
    color: '#e8d36d',
    text: [
      'Класс предмета: Перчатки',
      'Редкость: Редкий',
      'Мрачная хватка',
      'Перчатки чародея',
      '--------',
      'Энергетический щит: 98 (augmented)',
      '--------',
      'Требования:',
      'Уровень: 69',
      'Инт: 97',
      '--------',
      'Гнёзда: B-B-R-G ',
      '--------',
      'Уровень предмета: 84',
      '--------',
      '{ Префикс "Плодородный" (Ступень: 2) — Здоровье }',
      '+81(80-89) к максимуму здоровья',
      '{ Суффикс "вулкана" (Ступень: 4) — Стихии, Огонь, Сопротивление }',
      '+38(36-41)% к сопротивлению огню'
    ]
  },
  {
    id: 'en-chaos',
    panel: 'inv',
    label: 'Chaos Orb ×7',
    lang: 'en',
    color: '#c8b98f',
    text: [
      'Item Class: Stackable Currency',
      'Rarity: Currency',
      'Chaos Orb',
      '--------',
      'Stack Size: 7/20',
      '--------',
      'Reforges a rare item with new random modifiers',
      '--------',
      'Right click this item then left click a rare item to apply it.',
      'Shift click to unstack.'
    ]
  },
  {
    id: 'ru-chaos',
    panel: 'stash',
    label: 'Сфера хаоса ×7',
    lang: 'ru',
    color: '#c8b98f',
    text: [
      'Класс предмета: Валюта',
      'Редкость: Валюта',
      'Сфера хаоса',
      '--------',
      'Размер стопки: 7/20',
      '--------',
      'Изменяет редкий предмет, создавая новые случайные свойства',
      '--------',
      'Щёлкните правой кнопкой мыши по этому предмету, затем левой кнопкой мыши по редкому предмету.',
      'Shift + клик — разделить стопку.'
    ]
  },
  {
    id: 'en-unique',
    panel: 'stash',
    label: 'Le Heup of All',
    lang: 'en',
    color: '#af6025',
    text: [
      'Item Class: Rings',
      'Rarity: Unique',
      'Le Heup of All',
      'Iron Ring',
      '--------',
      'Requirements:',
      'Level: 30',
      '--------',
      'Item Level: 75',
      '--------',
      '{ Implicit Modifier — Damage, Physical, Attack }',
      'Adds 1 to 4 Physical Damage to Attacks (implicit)',
      '--------',
      '{ Unique Modifier — Damage }',
      '30(10-30)% increased Damage',
      '{ Unique Modifier — Attribute }',
      '+30(10-30) to all Attributes',
      '{ Unique Modifier — Elemental, Resistance }',
      '+30(10-30)% to all Elemental Resistances',
      '--------',
      'What\'s yours is mine, what\'s theirs is mine.'
    ]
  },
  {
    id: 'ru-unique',
    panel: 'stash',
    label: 'Всё моё',
    lang: 'ru',
    color: '#af6025',
    text: [
      'Класс предмета: Кольца',
      'Редкость: Уникальный',
      'Всё моё',
      'Железное кольцо',
      '--------',
      'Требования:',
      'Уровень: 30',
      '--------',
      'Уровень предмета: 75',
      '--------',
      'Добавляет от 1 до 4 физического урона к атакам (implicit)',
      '--------',
      '30(10-30)% увеличение урона',
      '+30(10-30) ко всем характеристикам',
      '+30(10-30)% к сопротивлению всем стихиям'
    ]
  }
]
