// Regex-строки для поиска в игре (карты, торговец, библиотека) — этап S7.
// Данные карт строит tools/regex/build-regex-data.mjs → resources/data/poe1/regex/maps.{en,ru}.json.

import type { GameId } from '../games'

/** Язык клиента игры, для которого собирается строка поиска. */
export type RegexLang = 'en' | 'ru'

/** Метки порогов на свойствах карты («Item Quantity: +80%» и т. п.). */
export type MapLabelKey =
  | 'quantity'
  | 'rarity'
  | 'packSize'
  | 'moreMaps'
  | 'moreScarabs'
  | 'moreCurrency'
  | 'moreDivCards'


/** Флаги подсказки карты, по которым можно фильтровать. */
export type MapFlagKey = 'corrupted' | 'unidentified'

/** Причина пометки «опасный мод» (ключ строки интерфейса regex.scary.<ключ>). */
export type ScaryReason =
  | 'reflect'
  | 'regen'
  | 'recovery'
  | 'leech'
  | 'maxRes'
  | 'flasks'
  | 'hexproof'
  | 'penetration'
  | 'buffs'
  | 'meteor'
  | 'defences'

export interface MapModData {
  /** Стабильный id (видимые stat id через запятую) — одинаковый в EN и RU. */
  id: string
  /** Строки мода: нижний регистр, числа → #, строки через \n (по ним ищет движок). */
  text: string
  /** То же с исходным регистром — для показа. */
  display: string
  /** Кратчайшая уникальная подстрока — готовый фрагмент регулярки. */
  token: string
  kind: 'prefix' | 'suffix' | 'implicit'
  /** 't17' — только на кошмарных (T17) картах, 'maven', 'corrupted' — осквернённый имплисит. */
  tags: string[]
  scary?: ScaryReason
  /** Уникальной подстроки нет: токен заденет и эти моды (все строки мода есть в других модах). */
  alsoMatches?: string[]
}

export interface MapRegexData {
  meta: { source: string; date: string; patch: string; lang: RegexLang }
  mods: MapModData[]
  /** Метка строки свойства → фрагмент регулярки («tity:»). */
  labels: Record<MapLabelKey, string>
  /** Флаг → фрагмент регулярки («pted$»). */
  flags: Record<MapFlagKey, string>
  /** Строки подсказки карты, которые не являются модами (проверка ложных срабатываний). */
  extra: string[]
}

export type TriState = 'any' | 'only' | 'exclude'

/** Запрос «Карты»: что хотим, чего избегаем, пороги свойств и флаги. */
export interface MapQuery {
  want: string[]
  avoid: string[]
  /** 'any' — подсветить карту с любым из желаемых модов; 'all' — со всеми сразу. */
  wantMode: 'any' | 'all'
  /** Порог «≥ N %», 0/отсутствие — без порога. */
  thresholds: Partial<Record<MapLabelKey, number>>
  corrupted: TriState
  unidentified: TriState
}

export type SocketColor = 'r' | 'g' | 'b' | 'w'

/**
 * Свойство предмета в «Торговце» (S27). Фрагменты строят tools/regex/build-vendor-data.mjs →
 * src/shared/regex/vendorData.ts; порядок — как на странице (защита, сопротивления, камни, урон, скорость,
 * характеристики).
 */
export type VendorModKey =
  | 'life'
  | 'mana'
  | 'energyShield'
  | 'resFire'
  | 'resCold'
  | 'resLightning'
  | 'resChaos'
  | 'resAll'
  | 'gemAll'
  | 'gemSpell'
  | 'gemFire'
  | 'gemCold'
  | 'gemLightning'
  | 'gemChaos'
  | 'gemPhys'
  | 'gemMinion'
  | 'gemBow'
  | 'gemMelee'
  | 'spellDamage'
  | 'physDamage'
  | 'eleAttack'
  | 'addAttackPhys'
  | 'addAttackFire'
  | 'addAttackCold'
  | 'addAttackLightning'
  | 'addAttackChaos'
  | 'addSpellPhys'
  | 'addSpellFire'
  | 'addSpellCold'
  | 'addSpellLightning'
  | 'addSpellChaos'
  | 'moveSpeed'
  | 'attackSpeed'
  | 'castSpeed'
  | 'critChance'
  | 'str'
  | 'dex'
  | 'int'
  | 'allAttributes'

/** Класс предмета («Item Class: Boots») — фильтр «И» в «Торговце». */
export type VendorItemClass =
  | 'boots'
  | 'gloves'
  | 'helmet'
  | 'bodyArmour'
  | 'shield'
  | 'quiver'
  | 'ring'
  | 'amulet'
  | 'belt'
  | 'wand'
  | 'sceptre'
  | 'staff'
  | 'dagger'
  | 'claw'
  | 'bow'
  | 'sword1h'
  | 'axe1h'
  | 'mace1h'
  | 'sword2h'
  | 'axe2h'
  | 'mace2h'

/** Редкость («Rarity: Magic») — фильтр «И» в «Торговце». */
export type VendorRarity = 'normal' | 'magic' | 'rare'

/** Запрос «Торговец». */
export interface VendorQuery {
  /** Минимальная связь гнёзд (0 — неважно). */
  links: 0 | 3 | 4 | 5 | 6
  /** Ровно 6 гнёзд (рецепт: 7 сфер ювелира). */
  sixSockets: boolean
  /** R-G-B подряд в связке (рецепт: хроматическая сфера). */
  rgb: boolean
  /** N гнёзд одного цвета в одной связке (0 — неважно). */
  colorCount: number
  color: SocketColor
  /**
   * Свойства предметов (S27): ключ → порог «≥ N» (у свойств без порога — 1); нет ключа или 0 — не выбрано.
   * Скорость передвижения — mods.moveSpeed (раньше — поле movementSpeed, библиотека переносит).
   */
  mods: Partial<Record<VendorModKey, number>>
  /** Качество ≥ N % (0 — неважно). */
  quality: number
  /** Моды «+# к уровню камней» любого типа (прокачка). */
  plusGemLevel: boolean
  /** Камни уровня ≥ N (0 — неважно); всегда отдельным условием «И». */
  gemLevel: number
  /** Класс предмета ('' — любой); отдельное условие «И». */
  itemClass: VendorItemClass | ''
  /** Редкость (пусто — любая; несколько — любая из них); отдельное условие «И». */
  rarity: VendorRarity[]
  mode: 'any' | 'all'
}

// ---------------------------------------------------------------------------
// «Предметы» (S46): строки поиска для тайника — данные строит tools/regex/build-item-data.mjs →
// resources/data/poe1/regex/items.{en,ru}.json (main отдаёт по IPC regex:itemData).
// ---------------------------------------------------------------------------

/** Класс предмета на странице «Предметы»: классы «Торговца» + флаконы и камни. */
export type ItemClassKey =
  | VendorItemClass
  | 'lifeFlask'
  | 'manaFlask'
  | 'hybridFlask'
  | 'utilityFlask'
  | 'skillGem'
  | 'supportGem'

/** Редкость снаряжения (у камней — своя «Rarity: Gem», её ставит блок «Камни»). */
export type ItemRarity = 'normal' | 'magic' | 'rare' | 'unique'

/** Влияние: Создатель, Древний, завоеватели («Shaper Item» …), Пламенный экзарх и Пожиратель миров. */
export type InfluenceKey = 'shaper' | 'elder' | 'crusader' | 'hunter' | 'redeemer' | 'warlord' | 'exarch' | 'eater'

/** Строка мода предмета (не мод целиком: одна строка бывает в разных тирах, в ремесле и гибридах). */
export interface ItemModData {
  /** Стабильный id: stat id записи перевода (+ ~n) — одинаковый в EN и RU. */
  id: string
  /** Строки: нижний регистр, числа → #, через \n. */
  text: string
  /** То же с исходным регистром — для показа. */
  display: string
  /** Кратчайший уникальный фрагмент регулярки (подстрока или «a.*b»). */
  token: string
  /** Порог «≥ N» для строки с одним числом: <pre><atLeast(N)>(<posts>), как у «Торговца». */
  pre?: string
  posts?: string[]
  digit?: '.' | '\\d'
  kind: 'prefix' | 'suffix' | 'both'
  /** Классы, где строка может выпасть (нет — неизвестно: особые моды вроде эссенций). */
  cls?: ItemClassKey[]
  /** Только с влиянием (обычным образом не выпадает). */
  infl?: InfluenceKey[]
  /** crafted — только ремеслом; special — только особым способом (эссенции, Delve, завеса…). */
  src?: 'crafted' | 'special'
  /** Строки других модов, где эта есть целиком: без ^ и $ строка заденет и их. */
  also?: string[]
}

export interface ItemBaseData {
  /** id базы в RePoE без «Metadata/Items/» — одинаковый в EN и RU. */
  id: string
  cls: ItemClassKey
  /** Название на языке клиента. */
  name: string
  token: string
  /** Уровень, с которого база выпадает (поздние — с лучшими свойствами базы). */
  level: number
  /** Сколько других строк (база внутри названия другой базы) заденет токен. */
  also?: number
}

export interface ItemRegexData {
  meta: { source: string; date: string; patch: string; lang: RegexLang }
  mods: ItemModData[]
  bases: ItemBaseData[]
  /** Класс → фрагмент строки «Item Class: …». */
  classes: Record<ItemClassKey, string>
  /** Редкость → фрагмент строки «Rarity: …» (gem — «Rarity: Gem»). */
  rarity: Record<ItemRarity | 'gem', string>
  /** Влияние → фрагмент строки «Shaper Item» / «Предмет Создателя». */
  influence: Record<InfluenceKey, string>
  /** «Corrupted» / «Осквернено». */
  flags: { corrupted: string }
  /** Метка «Item Level:» / «Уровень предмета:». */
  itemLevel: string
}

/** Запрос «Предметы». */
export interface ItemsQuery {
  /** Класс ('' — любой); отдельное условие «И». */
  itemClass: ItemClassKey | ''
  /** id базы ('' — любая); только вместе с классом. */
  base: string
  /** Редкость (пусто — любая; несколько — любая из них). */
  rarity: ItemRarity[]
  /** Уровень предмета ≥ N (0 — неважно). */
  itemLevel: number
  /** Влияние — любое из выбранных. */
  influence: InfluenceKey[]
  /** Только без влияния (исключает все). */
  noInfluence: boolean
  corrupted: TriState
  /** Свойства «Торговца» (жизнь, сопротивления, скорость…): ключ → порог (без порога — 1). */
  props: Partial<Record<VendorModKey, number>>
  /** Строки модов: id → порог «≥ N» (0 — любое значение). */
  want: Record<string, number>
  /** Строки модов, которых быть не должно. */
  avoid: string[]
  /** Свойства и строки: 'any' — любое из, 'all' — все сразу. */
  mode: 'any' | 'all'
  /** Камни: уровень ≥ N, качество ≥ N %, ваал (любые / только / без). */
  gemLevel: number
  gemQuality: number
  vaal: TriState
}

/** Что предложить убрать, если строка длиннее лимита. */
export type OverflowItem =
  | { kind: 'mod'; id: string; saves: number }
  | { kind: 'threshold'; key: MapLabelKey; saves: number }
  | { kind: 'option'; key: string; saves: number }

export interface RegexBuildResult {
  /** Готовая строка ('' — ничего не выбрано). */
  text: string
  length: number
  /** length ≤ 250 */
  ok: boolean
  /** На сколько символов превышен лимит и что убрать в первую очередь. */
  overflow?: { by: number; suggest: OverflowItem[] }
  /** Невыбранные моды, которые строка тоже заденет (нет уникальной подстроки). */
  sideMatches: string[]
}

// ---------------------------------------------------------------------------
// Библиотека строк (%APPDATA%/POETH/regex-library.json)
// ---------------------------------------------------------------------------

export type PasteSlot = 1 | 2 | 3 | 4 | 5

export interface RegexEntry {
  id: string
  name: string
  text: string
  game: GameId
  /** Хоткей вставки pasteSearch1..5 (один слот — одна строка на игру). */
  slot?: PasteSlot
  /** Из какого готового пресета сохранено (для подсказки «что это ищет»). */
  presetId?: string
}

export type RegexPage = 'maps' | 'vendor' | 'items' | 'library'

export interface RegexPrefs {
  // язык клиента игры с S26 — общая настройка Settings.gameLang (старое prefs.gameLang переносит main)
  page: RegexPage
  maps: MapQuery
  vendor: VendorQuery
  items: ItemsQuery
}

export interface RegexLibrary {
  version: 1
  prefs: RegexPrefs
  entries: RegexEntry[]
}

export interface RegexEntryInput {
  /** нет id — новая запись */
  id?: string
  name: string
  text: string
  game: GameId
  presetId?: string
}

export type RegexExportResult = { status: 'saved'; path: string } | { status: 'canceled' | 'error' }
export type RegexImportResult =
  | { status: 'imported'; added: number; library: RegexLibrary }
  | { status: 'canceled' | 'invalid' }

/** Настройки regex (раздел Settings.regex). Пока пусто: предпочтения живут в библиотеке. */
export interface RegexSettings {}
