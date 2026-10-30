// Избранные поиски + трейд-окно (этап S5).
// Хранилище — %APPDATA%/POETH/favorites.json (main, атомарная запись); логика правок —
// чистые функции @shared/favorites/model.

import type { GameId, TradeSiteKind } from '../games'
import type { RailPref } from '../rail'

export interface FavFolder {
  id: string
  title: string
  game: GameId
  /** иконка Better Trading (icn), сохраняется туда-обратно */
  icon?: string
  /** порядок среди папок игры (0…) */
  order: number
  /** ms — папка в архиве */
  archivedAt?: number
}

export interface FavLiveFlags {
  /** пользователь включил live search для этого поиска (намерение; соединение — S6) */
  enabled: boolean
  /** уведомлять о находках */
  notify: boolean
}

export interface FavSearch {
  id: string
  folderId: string
  title: string
  game: GameId
  type: TradeSiteKind
  /** id поиска на сайте: /trade/search/<league>/<slug> */
  slug: string
  /** нет — «текущая лига» (poe1.league / poe2.league из настроек) */
  league?: string
  notes?: string
  /** порядок внутри папки (0…) */
  order: number
  /** ms — поиск в архиве */
  archivedAt?: number
  live?: FavLiveFlags
}

export interface FavData {
  version: 1
  folders: FavFolder[]
  searches: FavSearch[]
}

/** Разобранный URL сайта трейда. */
export interface TradeUrlInfo {
  host: string
  game: GameId
  type: TradeSiteKind
  league: string
  /** пусто — страница без сохранённого поиска (/trade/search/<league>) */
  slug: string | null
}

// ---------------------------------------------------------------------------
// IPC: входные данные
// ---------------------------------------------------------------------------

export interface FavFolderInput {
  /** нет id — новая папка */
  id?: string
  title: string
  game: GameId
  icon?: string
}

export interface FavSearchInput {
  /** нет id — новый поиск */
  id?: string
  /** нет папки — «Без папки» (создаётся при необходимости) */
  folderId?: string
  title: string
  game?: GameId
  type: TradeSiteKind
  slug: string
  league?: string
  notes?: string
}

/** Лот, который надо показать игроку на сайте (live S6, прайс-чек S4): продавец + предмет. */
export interface TradeLot {
  /** аккаунт продавца (публичное имя на сайте трейда) */
  account?: string
  /** имя предмета (уники, редкие); у магических/обычных — нет. В запрос не идёт: имя редкого сайт не знает */
  name?: string
  /** база предмета («Leather Boots») — на языке сайта, с которого пришёл лот */
  typeLine: string
  ilvl?: number
  /** S21: редкость лота — фильтр редкости в запросе (без него — только продавец, база и ilvl) */
  rarity?: 'normal' | 'magic' | 'rare' | 'unique'
}

/**
 * Что открыть в трейд-окне (по приоритету): лот или запрос трейда (адрес …/search/<лига>/<состояние>,
 * состояние — сжатый запрос, как у самого сайта); адрес сайта (и запасной путь, если лот не сузить);
 * поиск (slug + тип). Лот вместе с запросом — исходный поиск окна цены, суженный до продавца.
 */
export interface TradeWindowTarget {
  url?: string
  /** запрос сайта трейда — тело POST /api/trade/search ({query, sort}) или сам query */
  query?: Record<string, unknown>
  lot?: TradeLot
  slug?: string
  type?: TradeSiteKind
  league?: string
  game?: GameId
}

/** Текущий поиск на странице сайта для «Сохранить текущий поиск». */
export type CurrentSearchResult =
  | { ok: true; info: TradeUrlInfo; title: string; currentLeague: string }
  | { ok: false; reason: 'no-window' | 'not-search' | 'no-slug' }

export interface FavImportResult {
  ok: boolean
  folders: number
  searches: number
  /** строки, которые не удалось разобрать */
  invalid: number
}

/** Состояние сайта в трейд-окне (адресная строка сайдбара). */
export interface TradeSiteState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  pinned: boolean
  /** открыт ли поиск избранного (по slug) */
  activeSearchId: string | null
  /** окно открыто поверх игры: шапка — адресная строка (перетаскивание, ×, Esc); иначе своя шапка окна (S58) */
  overGame: boolean
  /** колонка избранного свёрнута */
  sidebarCollapsed: boolean
  /** обычное окно развёрнуто на весь экран (кнопка «Развернуть / Восстановить» в шапке, S58) */
  maximized: boolean
  /** рельс вкладок сайтов (S58) */
  rail: TradeRailState
}

/** Рельс вкладок сайтов трейд-окна: что выбрал игрок и как рельс стоит сейчас (считает main — от него разметка вью сайта). */
export interface TradeRailState {
  /** выбор «развёрнут / свёрнут» (запоминается в trade-window.json); null — не выбирал: по режиму, как рельс компаньона */
  pref: RailPref | null
  /** развёрнут рядом с сайтом (названия видны, сайт сдвинут) */
  wide: boolean
  /** окну хватает ширины, чтобы развёрнутый рельс стоял рядом; не хватает — он открывается поверх, шторкой */
  room: boolean
}

/**
 * Состояние live search одного поиска (присылает адаптер S6): off — выключен; connecting — подключение
 * или переподключение; on — подключено; paused — пауза (лимит 429); auth — нужен вход (подключится сам
 * после входа); error — поиска больше нет на сайте и т. п.
 */
export type FavLiveState = 'off' | 'connecting' | 'on' | 'paused' | 'auth' | 'error'

export interface FavLiveSnapshot {
  /** адаптер S6 подключён */
  available: boolean
  states: Record<string, FavLiveState>
  used: number
  max: number
}
