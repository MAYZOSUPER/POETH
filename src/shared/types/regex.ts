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
  /**
   * Строки: нижний регистр, числа → #, через \n; склоняемое слово («секунд(-ы)» — клиент пишет «4 секунды»)
   * заменено на «"»: такой символ в токен не попадает.
   */
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
  /** Только с влиянием (обычным образом не выпадает нигде). */
  infl?: InfluenceKey[]
  /** По классам: здесь строка выпадает только с влиянием (на шлеме — с Создателем, на жезле — обычным образом). */
  inflBy?: Partial<Record<ItemClassKey, InfluenceKey[]>>
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

// ---------------------------------------------------------------------------
// PoE 2 (S62): путевые камни, плитки (в игре «Tablet» / «Плитка»), торговец. Данные строит
// tools/regex/poe2/build-poe2-regex-data.mjs → resources/data/poe2/regex/regex.{en,ru}.json (IPC regex:poe2Data).
// ---------------------------------------------------------------------------

export type Poe2RegexPage = 'waystone' | 'tablet' | 'vendor' | 'library'

/** Свойства путевого камня с порогом «≥ N %» («Pack Size: +20%», «Waystone Drop Chance: +90%»). */
export type WaystoneLabelKey =
  | 'packSize'
  | 'magicMonsters'
  | 'rareMonsters'
  | 'dropChance'
  | 'itemRarity'
  | 'monsterRarity'
  | 'effectiveness'

/** Тип плитки (база): Breach, Expedition, Delirium, Ritual, Irradiated, Overseer, Abyss, Temple. */
export type TabletType = 'breach' | 'expedition' | 'delirium' | 'ritual' | 'irradiated' | 'overseer' | 'abyss' | 'temple'

export type Poe2Rarity = 'normal' | 'magic' | 'rare' | 'unique'

/** Причина пометки «опасный мод» путевого камня (ключ строки regex.poe2.scary.<ключ>). */
export type Poe2ScaryReason =
  | 'maxRes'
  | 'recovery'
  | 'flasks'
  | 'cooldown'
  | 'penetration'
  | 'curse'
  | 'steal'
  | 'noDamage'
  | 'buffs'

/** prefix/suffix — обычные; desecrated — осквернение костями Бездны; instilled — вложение эмоций Делириума. */
export type Poe2ModKind = 'prefix' | 'suffix' | 'desecrated' | 'instilled'

export interface Poe2ModData {
  /** Видимые stat id через запятую (+ ~n) — одинаковый в EN и RU. */
  id: string
  /** Строки мода: нижний регистр, числа → #, через \n. */
  text: string
  display: string
  /** Кратчайший уникальный фрагмент (число — \d[\d.()-]*: в расширенном тексте у числа диапазон «28(26-30)»). */
  token: string
  kind: Poe2ModKind
  /** 'noRu' — в данных нет русского текста: в RU-клиенте мод не найти (UI не даёт выбрать). */
  tags: string[]
  scary?: Poe2ScaryReason
  /** Плитки: на каких типах выпадает. */
  types?: TabletType[]
  /** trade id статов для запроса trade2 («Цена по профилю»). */
  trade?: string[]
  /** Уникальной подстроки нет: токен заденет и эти моды. */
  alsoMatches?: string[]
  /** …и столько строк подсказки (в RU EE2 бывает один перевод на два стата). */
  alsoExtra?: number
}

export interface Poe2WaystoneData {
  mods: Poe2ModData[]
  /** Строки подсказки, которые не моды раздела (проверка ложных срабатываний). */
  extra: string[]
  /** Метка свойства («ck size:») для терма «<метка>.*<atLeast>%». */
  labels: Record<WaystoneLabelKey, string>
  /** Фрагмент перед номером тира в названии базы: «Waystone (Tier 15)» → «e \(tier ». */
  tier: string
  rarity: Record<Poe2Rarity, string>
  flags: { corrupted: string; unidentified: string }
}

export interface Poe2TabletData {
  mods: Poe2ModData[]
  extra: string[]
  /** Тип → фрагмент названия базы («Ritual Tablet» / «Плитка Ритуала»). */
  types: Record<TabletType, string>
  /** «10 uses remaining» / «Осталось зарядов - 10»: фрагменты до и после числа. */
  uses: { pre: string; post: string }
  rarity: Record<Poe2Rarity, string>
}

/** Свойство «Торговца» PoE 2 (ключ — как на странице: защита, сопротивления, уровни умений, урон, скорость, характеристики). */
export type Poe2VendorKey =
  | 'life'
  | 'mana'
  | 'energyShield'
  | 'spirit'
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
  | 'gemMelee'
  | 'gemProjectile'
  | 'spellDamage'
  | 'physDamage'
  | 'addPhys'
  | 'addFire'
  | 'addCold'
  | 'addLightning'
  | 'addChaos'
  | 'addAttackPhys'
  | 'addAttackFire'
  | 'addAttackCold'
  | 'addAttackLightning'
  | 'moveSpeed'
  | 'attackSpeed'
  | 'castSpeed'
  | 'critChance'
  | 'str'
  | 'dex'
  | 'int'
  | 'allAttributes'
  | 'rarity'

/** Класс снаряжения PoE 2 («Item Class: Boots»). */
export type Poe2ItemClass =
  | 'boots'
  | 'gloves'
  | 'helmet'
  | 'bodyArmour'
  | 'shield'
  | 'buckler'
  | 'focus'
  | 'quiver'
  | 'ring'
  | 'amulet'
  | 'belt'
  | 'wand'
  | 'staff'
  | 'sceptre'
  | 'quarterstaff'
  | 'bow'
  | 'crossbow'
  | 'spear'
  | 'mace1h'
  | 'mace2h'
  | 'flail'
  | 'lifeFlask'
  | 'manaFlask'
  | 'charm'

export interface Poe2VendorProp {
  /** Свои строки (числа → #) — для подсказки. */
  text: string[]
  /** Порог «≥ N»: <pre><atLeast(N)>(диапазон)?(<posts>). */
  pre?: string
  posts?: string[]
  /** Без порога — готовый фрагмент. */
  token?: string
  /** Русского текста в данных нет (в RU-клиенте не найти). */
  noRu?: boolean
  /** Порог неизбежно заденет столько чужих строк. */
  alsoLines?: number
}

export interface Poe2VendorData {
  props: Record<Poe2VendorKey, Poe2VendorProp>
  classes: Record<Poe2ItemClass, string>
  rarity: Record<Poe2Rarity, string>
  /** Метка строки «Sockets: S S» (дальше — буквы гнёзд). */
  sockets: string
  /** Метка строки «Quality: +20%». */
  quality: string
}

export interface Poe2RegexData {
  meta: { source: string; date: string; patch: string; lang: RegexLang; ee2: string }
  waystone: Poe2WaystoneData
  tablet: Poe2TabletData & { /** EN-названия баз — для запроса trade2 (сайт ищет по-английски) */ tradeType: Record<TabletType, string> }
  vendor: Poe2VendorData
}

/** Запрос «Путевые камни». */
export interface WaystoneQuery {
  /** Тир от / до (0 — неважно). */
  tierMin: number
  tierMax: number
  rarity: Poe2Rarity[]
  corrupted: TriState
  /** only — только неопознанные, exclude — только опознанные. */
  unidentified: TriState
  want: string[]
  avoid: string[]
  wantMode: 'any' | 'all'
  thresholds: Partial<Record<WaystoneLabelKey, number>>
}

/** Запрос «Плитки». */
export interface TabletQuery {
  /** Любой из типов (пусто — любой). */
  types: TabletType[]
  /** Использований осталось ≥ N (0 — неважно). */
  usesMin: number
  rarity: Poe2Rarity[]
  want: string[]
  avoid: string[]
  wantMode: 'any' | 'all'
}

/** Запрос «Торговец» PoE 2. */
export interface Poe2VendorQuery {
  /** Свойство → порог «≥ N» (без порога — 1). */
  mods: Partial<Record<Poe2VendorKey, number>>
  itemClass: Poe2ItemClass | ''
  rarity: Poe2Rarity[]
  /** Гнёзд под руны ≥ N (0 — неважно). */
  sockets: number
  /** Качество ≥ N % (0 — неважно). */
  quality: number
  mode: 'any' | 'all'
}

export type Poe2ProfileKind = 'waystone' | 'tablet'

/** Профиль «что нужно» (как в poe2pricer): набор → строка для тайника и «Цена по профилю» на trade2. */
export interface Poe2Profile {
  id: string
  name: string
  kind: Poe2ProfileKind
  waystone?: WaystoneQuery
  tablet?: TabletQuery
}

export interface Poe2ProfileInput {
  /** нет id — новый профиль */
  id?: string
  name: string
  kind: Poe2ProfileKind
  waystone?: WaystoneQuery
  tablet?: TabletQuery
}

export interface Poe2RegexPrefs {
  page: Poe2RegexPage
  waystone: WaystoneQuery
  tablet: TabletQuery
  vendor: Poe2VendorQuery
}

/** Файл %APPDATA%/POETH/regex-poe2.json: настройки страниц PoE 2 и профили (строки — в общей библиотеке, game 'poe2'). */
export interface Poe2RegexState {
  version: 1
  prefs: Poe2RegexPrefs
  profiles: Poe2Profile[]
}

/** Лот для «Цены по профилю». */
export interface Poe2PriceListing {
  amount: number
  currency: string
  /** Выкуп (Merchant's Tab, плата золотом) — у trade2 это `listing.fee`. */
  instant: boolean
}

export type Poe2PriceResult =
  | { ok: true; total: number; listings: Poe2PriceListing[]; siteUrl: string; league: string }
  | { ok: false; error: { code: string; message?: string } }
