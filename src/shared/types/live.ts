// Live search PoE1 (этап S6): поиски, состояния подключения, находки.
// Подключение и cookies живут только в main; в renderer — состояние и находки.

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
  at: number
  name: string
  typeLine: string
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
  options: LiveOptions
  searches: LiveSearchView[]
  /** включённых поисков (не idle/invalid) */
  active: number
  /** лимит из settings.live.maxSearches */
  max: number
  loggedIn: boolean
  /** последние находки, свежие первыми */
  recent: LiveHit[]
}

export type LiveAddError =
  /** не ссылка на поиск PoE1 и не id поиска */
  | 'bad-url'
  /** ссылка на трейд PoE 2 — live для PoE 2 вне v0.1 */
  | 'poe2'
  /** bulk-обмен: у сайта нет live для обмена */
  | 'exchange'
  | 'duplicate'

export type LiveAddResult = { ok: true; search: LiveSearchView } | { ok: false; error: LiveAddError }

/** Результат «Написать»: текст вставлен в чат (Enter жмёт игрок) или почему нет. */
export type LiveWhisperResult = 'ok' | 'no-game' | 'no-input' | 'busy' | 'no-whisper'
