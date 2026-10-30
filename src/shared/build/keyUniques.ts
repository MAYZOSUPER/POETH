// Свой список популярных «билдообразующих» уников PoE 1 (S40, K2 исследования build-key-items.md).
// Открытых лицензируемых списков нет (вики — CC BY-NC-SA, poe.ninja builds закрыт), поэтому теги и причины —
// свои, коротко, своими словами; тексты вики и poedb не копируем. Имя — английское (как в коде PoB).
// Обновлять к лиге: новые и изменённые уники (шаг рядом с данными дерева и камней в docs/league-update.md).
//
// Теги:
//   skill-source — даёт главное умение билда (ключевой, если главный камень — из skills);
//   trigger-host — запускает связку в своём гнезде (ключевой, если там главная связка);
//   radius-jewel — самоцвет с радиусом: даёт ноды без пути (ключевой, если такие ноды есть в дереве);
//   mechanic    — меняет механику билда (важный);
//   scaler      — сильно усиливает билд, но заменим (важный);
//   leveling    — для прокачки, снимают позже;
//   luxury      — цель на потом: билд работает и без него.

export type KeyTag = 'skill-source' | 'trigger-host' | 'radius-jewel' | 'mechanic' | 'scaler' | 'leveling' | 'luxury'

export interface KeyUnique {
  tag: KeyTag
  /** для skill-source: умения (EN, как имя камня в PoB), которые он даёт */
  skills?: string[]
  /** сокращения в заметках авторов (целым словом) */
  aliases?: string[]
  ru: string
  en: string
}

export const KEY_UNIQUES: Readonly<Record<string, KeyUnique>> = {
  // ---- даёт умение / запускает связку
  "Death's Oath": { tag: 'skill-source', skills: ['Death Aura'], ru: 'даёт умение Death Aura — на нём держится билд', en: 'grants Death Aura — the build stands on it' },
  'Mjölner': { tag: 'trigger-host', ru: 'сам запускает чары молнии из своих гнёзд', en: 'triggers the lightning spells socketed in it' },
  "Cospri's Malice": { tag: 'trigger-host', ru: 'сам запускает чары холода из своих гнёзд при крите', en: 'triggers the cold spells socketed in it on crit' },
  "The Poet's Pen": { tag: 'trigger-host', ru: 'сам запускает чары из своих гнёзд при атаке жезлом', en: 'triggers the spells socketed in it on wand attacks' },
  "Kitava's Thirst": { tag: 'trigger-host', ru: 'запускает чары из своих гнёзд, когда тратите ману', en: 'triggers its socketed spells when you spend mana' },
  // ---- самоцветы с радиусом
  'Thread of Hope': { tag: 'radius-jewel', aliases: ['ToH'], ru: 'даёт взять ноды в кольце без пути к ним', en: 'lets you take nodes in its ring without a path' },
  'Impossible Escape': { tag: 'radius-jewel', aliases: ['IE'], ru: 'даёт взять ноды у кейстоуна без пути к ним', en: 'lets you take nodes near a keystone without a path' },
  'Intuitive Leap': { tag: 'radius-jewel', ru: 'даёт взять ноды в радиусе без пути к ним', en: 'lets you take nodes in its radius without a path' },
  // ---- механика
  'Forbidden Flame': { tag: 'mechanic', aliases: ['Forbidden'], ru: 'в паре с Forbidden Flesh даёт ноту восхождения', en: 'with Forbidden Flesh, grants an ascendancy notable' },
  'Forbidden Flesh': { tag: 'mechanic', aliases: ['Forbidden'], ru: 'в паре с Forbidden Flame даёт ноту восхождения', en: 'with Forbidden Flame, grants an ascendancy notable' },
  "Aul's Uprising": { tag: 'mechanic', ru: 'аура без резерва — нужен вариант с аурой билда', en: 'an aura with no reservation — needs the variant with your aura' },
  "Xoph's Blood": { tag: 'mechanic', ru: 'даёт кейстоун Avatar of Fire: урон становится огнём', en: 'grants Avatar of Fire: your damage turns into fire' },
  'Hrimsorrow': { tag: 'mechanic', ru: 'превращает весь физический урон в холод', en: 'turns all physical damage into cold' },
  "Inpulsa's Broken Heart": { tag: 'mechanic', ru: 'враги под шоком взрываются — зачистка держится на этом', en: 'shocked enemies explode — clearing relies on it' },
  'Original Sin': { tag: 'mechanic', ru: 'весь стихийный урон становится хаосом', en: 'turns all elemental damage into chaos' },
  "Shavronne's Wrappings": { tag: 'mechanic', ru: 'хаос не проходит сквозь энергощит — опора низкой жизни', en: 'chaos stops bypassing energy shield — a low-life staple' },
  'Dissolution of the Flesh': { tag: 'mechanic', ru: 'жизнь резервируется вместо маны — особая защита билда', en: 'reserves life instead of mana — a special defence' },
  'Indigon': { tag: 'mechanic', ru: 'трата маны усиливает чары — урон билда идёт отсюда', en: 'spending mana boosts spells — the damage comes from here' },
  "Doryani's Prototype": { tag: 'mechanic', ru: 'меняет сопротивление молнии врагов на ваше', en: 'swaps enemy lightning resistance for yours' },
  'Melding of the Flesh': { tag: 'mechanic', ru: 'максимум сопротивлений — по самому высокому', en: 'all maximum resistances match the highest one' },
  'Brass Dome': { tag: 'mechanic', ru: 'без критов по вам — защита строится на нём', en: 'no crits against you — defence is built around it' },
  'Crystallised Omniscience': { tag: 'mechanic', ru: 'атрибуты считаются как Omniscience — билд под него', en: 'attributes become Omniscience — the build is made for it' },
  'Skin of the Lords': { tag: 'mechanic', ru: 'кейстоун из предмета вместо дерева', en: 'a keystone from the item instead of the tree' },
  'Nimis': { tag: 'mechanic', ru: 'снаряды возвращаются — урон билда идёт отсюда', en: 'projectiles return — the damage comes from here' },
  // ---- усиление
  'Ashes of the Stars': { tag: 'scaler', aliases: ['Ashes'], ru: '+1 к уровню камней и качество — заметное усиление', en: '+1 gem levels and quality — a notable boost' },
  'Void Battery': { tag: 'scaler', aliases: ['voids', 'Voids'], ru: 'заряды силы сильно поднимают урон чар', en: 'power charges boost spell damage a lot' },
  'Badge of the Brotherhood': { tag: 'scaler', aliases: ['Badge'], ru: 'заряды и уклонение — опора для зарядных билдов', en: 'charges and Elusive — core for charge builds' },
  "Ryslatha's Coil": { tag: 'scaler', ru: 'больше максимум физического урона — сильно для яда', en: 'more maximum physical damage — strong for poison' },
  "Watcher's Eye": { tag: 'scaler', aliases: ["Watcher's"], ru: 'моды под ауры — нужны именно моды автора', en: 'aura mods — you need the author’s mods' },
  'Split Personality': { tag: 'scaler', ru: 'атрибуты и урон растут с расстоянием от старта', en: 'attributes and damage grow with distance from the start' },
  "Replica Dragonfang's Flight": { tag: 'scaler', ru: '+уровень одного камня — нужен камень билда', en: '+levels to one gem — must be the build’s gem' },
  // ---- для прокачки
  'Tabula Rasa': { tag: 'leveling', aliases: ['Tabula'], ru: 'шесть связанных гнёзд с самого старта', en: 'six linked sockets from the start' },
  'Goldrim': { tag: 'leveling', ru: 'сопротивления на старте', en: 'resistances early on' },
  'Wanderlust': { tag: 'leveling', ru: 'скорость передвижения на старте', en: 'movement speed early on' },
  'Lochtonial Caress': { tag: 'leveling', ru: 'скорость и восполнение маны на старте', en: 'speed and mana early on' },
  'Axiom Perpetuum': { tag: 'leveling', ru: 'урон чар на старте', en: 'spell damage early on' },
  'Thousand Ribbons': { tag: 'leveling', ru: 'урон и защита на старте', en: 'damage and defence early on' },
  'Lifesprig': { tag: 'leveling', ru: '+1 к уровню чар на старте', en: '+1 spell level early on' },
  'Karui Ward': { tag: 'leveling', ru: 'скорость и урон снарядов на старте', en: 'speed and projectile damage early on' },
  'Praxis': { tag: 'leveling', ru: 'мана для умений на прокачке', en: 'mana for skills while levelling' },
  "Le Heup of All": { tag: 'leveling', ru: 'сопротивления и урон на старте', en: 'resistances and damage early on' },
  "Kaom's Sign": { tag: 'leveling', ru: 'жизнь и заряды на прокачке', en: 'life and charges while levelling' },
  // ---- цель на потом
  'Headhunter': { tag: 'luxury', aliases: ['HH'], ru: 'дорогое усиление — билд работает и без него', en: 'an expensive boost — the build works without it' },
  'Mageblood': { tag: 'luxury', aliases: ['MB'], ru: 'дорогое усиление — билд работает и без него', en: 'an expensive boost — the build works without it' },
  'Bottled Faith': { tag: 'luxury', ru: 'усиление урона — билд работает и без него', en: 'a damage boost — the build works without it' },
  'Dying Sun': { tag: 'luxury', ru: 'усиление снарядов — билд работает и без него', en: 'a projectile boost — the build works without it' },
  'Progenesis': { tag: 'luxury', ru: 'усиление защиты — билд работает и без него', en: 'a defence boost — the build works without it' },
  'Glorious Vanity': { tag: 'luxury', aliases: ['GV'], ru: 'усиление дерева — билд работает и без него', en: 'a tree boost — the build works without it' },
  'Militant Faith': { tag: 'luxury', ru: 'усиление дерева — билд работает и без него', en: 'a tree boost — the build works without it' },
  'Elegant Hubris': { tag: 'luxury', ru: 'усиление дерева — билд работает и без него', en: 'a tree boost — the build works without it' },
  'Lethal Pride': { tag: 'luxury', ru: 'усиление дерева — билд работает и без него', en: 'a tree boost — the build works without it' },
  'Brutal Restraint': { tag: 'luxury', ru: 'усиление дерева — билд работает и без него', en: 'a tree boost — the build works without it' }
}

export function keyUnique(name: string): KeyUnique | null {
  return Object.prototype.hasOwnProperty.call(KEY_UNIQUES, name) ? KEY_UNIQUES[name] : null
}
