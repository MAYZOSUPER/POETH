// Таблица поддерживаемых игр — единый источник правды для всего, что отличается
// между Path of Exile 1 и 2: заголовок окна, сегмент трейда в URL, логи, данные,
// доступные функции. ЗАМОРОЖЕН после S0: менять только через лида.
//
// Игра выбирается в настройках (`Settings.game`); смена = перезапуск приложения
// (electron-overlay-window цепляется к окну игры один раз).

export type GameId = 'poe1' | 'poe2'

/** Хост официального сайта. Cookies сессии привязаны к хосту → это настройка. */
export type SiteHost = 'www.pathofexile.com' | 'ru.pathofexile.com'

export const SITE_HOSTS: readonly SiteHost[] = ['www.pathofexile.com', 'ru.pathofexile.com']

export interface GameFeatures {
  /** трекер кампании (компас) */
  campaign: boolean
  priceCheck: boolean
  live: boolean
  regex: boolean
  deals: boolean
}

export interface GameDef {
  id: GameId
  /** короткое имя для UI */
  label: string
  /** точный заголовок окна игры (для OverlayController.attachByTitle) */
  windowTitle: 'Path of Exile' | 'Path of Exile 2'
  /** сегмент трейда в путях сайта и API */
  tradeSeg: 'trade' | 'trade2'
  /** realm-сегмент в URL сайта (только PoE2: /trade2/search/poe2/...). В API realm не шлём. */
  siteRealm: string | null
  /** папки логов относительно корней установки (steamapps/common, Grinding Gear Games, Epic Games) */
  logSubdirs: string[]
  /** подпапка в resources/data и userData/data (poeth://data/<dataDir>/<lang>/<file>) */
  dataDir: GameId
  features: GameFeatures
}

export const GAMES: Record<GameId, GameDef> = {
  poe1: {
    id: 'poe1',
    label: 'PoE 1',
    windowTitle: 'Path of Exile',
    tradeSeg: 'trade',
    siteRealm: null,
    logSubdirs: ['Path of Exile/logs', 'PathOfExile/logs'],
    dataDir: 'poe1',
    features: { campaign: false, priceCheck: true, live: true, regex: true, deals: true }
  },
  poe2: {
    id: 'poe2',
    label: 'PoE 2',
    windowTitle: 'Path of Exile 2',
    tradeSeg: 'trade2',
    siteRealm: 'poe2',
    logSubdirs: ['Path of Exile 2/logs', 'PathOfExile2/logs'],
    dataDir: 'poe2',
    features: { campaign: true, priceCheck: true, live: false, regex: false, deals: false }
  }
}

export const GAME_IDS: readonly GameId[] = ['poe1', 'poe2']

export function isGameId(v: unknown): v is GameId {
  return v === 'poe1' || v === 'poe2'
}

export function isSiteHost(v: unknown): v is SiteHost {
  return v === 'www.pathofexile.com' || v === 'ru.pathofexile.com'
}

export function getGameDef(id: GameId): GameDef {
  return GAMES[id]
}

/** Какая страница сайта трейда: обычный поиск или bulk-обмен. */
export type TradeSiteKind = 'search' | 'exchange'

const enc = encodeURIComponent

/**
 * URL поиска на сайте (для кнопки «открыть в трейд-окне/браузере»).
 * PoE1: https://<host>/trade/search/<league>/<slug>
 * PoE2: https://<host>/trade2/search/poe2/<league>/<slug>
 */
export function siteUrl(
  def: GameDef,
  host: SiteHost,
  league: string,
  slug?: string,
  kind: TradeSiteKind = 'search'
): string {
  const parts: string[] = [def.tradeSeg, kind]
  if (def.siteRealm) parts.push(def.siteRealm)
  parts.push(enc(league))
  if (slug) parts.push(enc(slug))
  return `https://${host}/${parts.join('/')}`
}

/**
 * URL API трейда. `endpoint` — путь после сегмента трейда без слэшей по краям
 * ('search', 'fetch', 'exchange', 'data/leagues', 'data/stats', …), `rest` —
 * уже закодированный хвост (лига, id через запятую, query-строка).
 * PoE1: https://<host>/api/trade/<endpoint>/<rest>
 * PoE2: https://<host>/api/trade2/<endpoint>/<rest>   (без realm — сегмент trade2 уже = PoE2)
 */
export function apiUrl(def: GameDef, host: SiteHost, endpoint: string, rest?: string): string {
  const base = `https://${host}/api/${def.tradeSeg}/${endpoint.replace(/^\/+|\/+$/g, '')}`
  if (!rest) return base
  return rest.startsWith('?') ? base + rest : `${base}/${rest.replace(/^\/+/, '')}`
}

/**
 * WebSocket live search.
 * PoE1: wss://<host>/api/trade/live/<league>/<slug>
 * PoE2: wss://<host>/api/trade2/live/poe2/<league>/<slug> — НЕ проверено (live для PoE2 вне v0.1).
 */
export function liveUrl(def: GameDef, host: SiteHost, league: string, slug: string): string {
  const parts = ['api', def.tradeSeg, 'live']
  if (def.siteRealm) parts.push(def.siteRealm)
  parts.push(enc(league), enc(slug))
  return `wss://${host}/${parts.join('/')}`
}
