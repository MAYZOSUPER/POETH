// Live search (этап S6 — PoE1, S63 — PoE2): поиски, состояния подключения, находки.
// Подключение и cookies живут только в main; в renderer — состояние и находки.
// Поиски у каждой игры свои (live.json хранит игру поиска); работают поиски запущенной игры.

import type { GameId } from '../games'

export interface LiveSettings {
  /** максимум одновременных live-поисков (по умолчанию 10, допустимо 1..20) */
  maxSearches: number
}

/** Состояние подключения поиска. */
export type LiveConnKind =
  /** выключен (или выключен весь live) */
  | 'idle'
  /** ждёт своей очереди на подключение или подключается */
  | 'connecting'
  /** подключено, ждём находок */
  | 'open'
  /** обрыв — переподключение через 3 с + jitter */
  | 'backoff'
  /** сайт не пускает без входа (401) — ждём входа */
  | 'auth'
  /** поиска больше нет на сайте (404) */
  | 'invalid'
  /** 429 — пауза от 30 с до 10 мин */
  | 'ratelimited'

/** Почему переподключаемся. */
export type LiveBackoffReason = 'network' | 'closed' | 'server' | 'blocked'

export interface LiveSearchView {
  id: string
  title: string
  league: string
  /** id поиска на сайте (из ссылки /trade/search/<league>/<slug>) */
  slug: string
  enabled: boolean
  /** звук находок этого поиска */
  sound: boolean
  /** тосты/уведомления о находках (у поисков избранного — флаг «уведомлять» трейд-окна) */
  notify: boolean
  state: LiveConnKind
  reason?: LiveBackoffReason
  /** backoff / ratelimited: когда следующая попытка (ms epoch) */
  retryAt?: number
  /** находок с запуска приложения */
  hits: number
  lastHitAt?: number
  /** страница поиска на сайте */
  siteUrl: string
  /** добавлен вручную или пришёл из избранного трейд-окна (S5) */
  source: 'manual' | 'favorite'
}

export interface LiveOptions {
  /** главный выключатель live search */
  enabled: boolean
  /** звук находок (вместе с настройкой sound.enabled приложения) */
  sound: boolean
  /** уведомление Windows, когда игра не в фокусе */
  notifyWindows: boolean
  /**
   * Предел одновременных live-поисков PoE2 (trade2), 1..20. Сайт без входа заголовков предела соединений
   * не отдаёт (проверено 31.10.2026: рукопожатие — 401 без x-rate-limit), поэтому безопасное значение —
   * 5; у PoE1 предел — settings.live.maxSearches. В live.json поле есть всегда (нормализация store.ts).
   */
  poe2Max?: number
}

export type LiveRarity = 'normal' | 'magic' | 'rare' | 'unique' | 'gem' | 'currency' | 'divination' | 'other'

/** Состояние продавца для in-person лота. */
export type LiveSellerState = 'online' | 'afk' | 'offline'

export interface LiveHit {
  /** `${searchId}:${itemId}` */
  key: string
  itemId: string
  searchId: string
  searchTitle: string
  /** лига поиска — для «Открыть лот» в трейд-окне S5 (openTradeWindow({lot, league})) */
  league: string
  at: number
  name: string
  typeLine: string
  /** база предмета (у магических typeLine с аффиксами) — для «Открыть лот» (запрос сайта по базе) */
  baseType?: string
  rarity: LiveRarity
  ilvl?: number
  corrupted?: boolean
  /** текст предмета (item.extended.text, base64 → строка) — для парсера S2 в оверлее */
  text?: string
  /** явные моды как их отдал сайт (язык сайта) — запасной вариант, если парсер не справился */
  mods: string[]
  price?: { amount: number; currency: string }
  /** аккаунт продавца (публичное имя на сайте трейда) */
  account?: string
  seller?: LiveSellerState
  /** готовое сообщение продавцу (только in-person) — вставляется в чат, НЕ отправляется */
  whisper?: string
  /** лот торговца (асинхронный трейд): покупка на сайте, комиссия в золоте */
  merchant: boolean
  /** комиссия торговца в золоте */
  fee?: number
  /** страница поиска на сайте (до S5 — «Открыть лот» в браузере) */
  siteUrl: string
  /** находка поиска PoE2 (у PoE1 поля нет): имена переводятся по данным PoE2, текста предмета нет */
  game?: 'poe2'
}

export interface LiveHitEvent {
  hit: LiveHit
  /** показать тост (антиспам: не больше N тостов в минуту на поиск) */
  toast: boolean
  /** сыграть звук; громкость 0..1 */
  sound: boolean
  volume: number
}

export interface LiveSnapshot {
  /** игра, поиски которой показаны (запущенная); нет поля — PoE1 */
  game?: GameId
  options: LiveOptions
  searches: LiveSearchView[]
  /** включённых поисков (не idle/invalid) */
  active: number
  /** предел поисков игры: PoE1 — settings.live.maxSearches, PoE2 — options.poe2Max */
  max: number
  loggedIn: boolean
  /** последние находки, свежие первыми */
  recent: LiveHit[]
}

export type LiveAddError =
  /** не ссылка на поиск запущенной игры и не id поиска */
  | 'bad-url'
  /** в режиме PoE1 — ссылка на трейд PoE 2 (live PoE 2 работает в режиме PoE 2) */
  | 'poe2'
  /** bulk-обмен: у сайта нет live для обмена */
  | 'exchange'
  | 'duplicate'

export type LiveAddResult = { ok: true; search: LiveSearchView } | { ok: false; error: LiveAddError }

/** Результат «Написать»: текст вставлен в чат (Enter жмёт игрок) или почему нет. */
export type LiveWhisperResult = 'ok' | 'no-game' | 'no-input' | 'busy' | 'no-whisper'
