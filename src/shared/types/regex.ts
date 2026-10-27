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
  /** Скорость передвижения ≥ N % (0 — неважно). */
  movementSpeed: number
  /** Качество ≥ N % (0 — неважно). */
  quality: number
  /** Моды «+# к уровню камней» (прокачка). */
  plusGemLevel: boolean
  /** Камни уровня ≥ N (0 — неважно); всегда отдельным условием «И». */
  gemLevel: number
  mode: 'any' | 'all'
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

export type RegexPage = 'maps' | 'vendor' | 'library'

export interface RegexPrefs {
  /** Язык клиента игры: 'auto' = как язык интерфейса. */
  gameLang: 'auto' | RegexLang
  page: RegexPage
  maps: MapQuery
  vendor: VendorQuery
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
