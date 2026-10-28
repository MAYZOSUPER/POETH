// Типы домена «учёт богатства» (S11a): сумма стэша, снапшоты, фарм в час.
// Значения cookies и имя аккаунта в логи не попадают; имя аккаунта хранится только локально.

/** Вкладка стэша (legacy-эндпоинт сайта). */
export interface WealthTab {
  /** id вкладки с сайта — стабилен при перестановке вкладок */
  id: string
  /** позиция вкладки (tabIndex запроса) на момент последнего списка */
  index: number
  name: string
  /** тип с сайта: PremiumStash, QuadStash, CurrencyStash, … */
  type: string
  /** цвет вкладки 'r,g,b' */
  colour?: string
  /** содержимое сайт через legacy-эндпоинт не отдаёт (MapStash, UniqueStash, папка) */
  unsupported?: boolean
  selected: boolean
}

export type WealthErrorCode =
  | 'auth'
  | 'no-account'
  /** вошли, но сайт не отдал стэш этого аккаунта (имя не совпадает с вошедшим) */
  | 'forbidden'
  | 'blocked'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'not-found'
  | 'bad-response'
  | 'no-tabs'
  | 'unsupported-game'

export interface WealthError {
  code: WealthErrorCode
  /** для rate-limited — когда можно снова (мс epoch) */
  retryAt?: number
}

export type WealthPhase = 'idle' | 'tabs' | 'snapshot'

export interface WealthStatus {
  phase: WealthPhase
  /** прогресс снимка: вкладок загружено / всего */
  progress?: { done: number; total: number }
  /** ждём место в лимите сайта до этого момента */
  waitUntil?: number
  error?: WealthError
}

export interface WealthOptions {
  /** авто-снимки по таймеру */
  autoEnabled: boolean
  /** желаемый интервал авто-снимка, мин (15–60); фактический не меньше лимита сайта */
  autoIntervalMin: number
  /** цены уников, камней и карт с poe.watch */
  poeWatch: boolean
}

export type PriceSourceId = 'exchange' | 'poewatch'

/** Почему предмет без оценки. */
export type UnpricedReason = 'rare' | 'no-price' | 'ambiguous' | 'no-source'

/** Пространство имён предмета — для перевода названия данными APT в renderer. */
export type WealthItemNs = 'ITEM' | 'UNIQUE' | 'GEM' | 'DIVINATION_CARD'

/** Строка снимка: одинаковые предметы со всех выбранных вкладок, сложенные вместе. */
export interface WealthLine {
  /** ключ сопоставления между снимками (имя + свойства, влияющие на цену) */
  key: string
  /** английское имя (как отдаёт www.pathofexile.com) */
  name: string
  ns: WealthItemNs
  links?: number
  gemLevel?: number
  gemQuality?: number
  mapTier?: number
  corrupted?: boolean
  qty: number
  /** chaos за штуку */
  unit?: number
  /** chaos за все штуки (0 — без оценки) */
  total: number
  source?: PriceSourceId
  /** мало сделок / «low confidence» источника */
  low?: boolean
  reason?: UnpricedReason
}

export interface WealthTabTotal {
  id: string
  name: string
  chaos: number
  /** штук предметов (стопки — по размеру) */
  items: number
  unpriced: number
}

/** Итог снимка (хранится всегда). */
export interface WealthSummary {
  id: string
  at: number
  league: string
  chaos: number
  /** chaos за 1 divine в момент снимка (0 — курс неизвестен) */
  divineRate: number
  tabs: WealthTabTotal[]
  /** строк с оценкой / без оценки */
  priced: number
  unpriced: number
  /** снимок сделан кнопкой (не по таймеру) */
  manual?: boolean
}

/** Полный снимок (хранятся только последние ~10). */
export interface WealthSnapshot {
  summary: WealthSummary
  lines: WealthLine[]
}

/** Точка графика. */
export interface WealthPoint {
  at: number
  chaos: number
  divineRate: number
}

/** Сессия фарма: «Начать» → снимок, «Стоп» → снимок. */
export interface WealthFarmSession {
  league: string
  startedAt: number
  startId: string
  startChaos: number
  stoppedAt?: number
  endId?: string
  endChaos?: number
}

export interface WealthFarmView {
  session: WealthFarmSession | null
  /** прибыль сессии, chaos (по последнему снимку сессии) */
  gain?: number
  /** доход в час за сессию, chaos/ч */
  perHour?: number
  /** прибыль за последний час (по снимкам), chaos; null — снимков мало */
  lastHour?: number | null
  /** снимков за сессию */
  snapshots: number
}

/** Строка «что прибавилось» между двумя снимками. */
export interface WealthDiffLine {
  key: string
  name: string
  ns: WealthItemNs
  links?: number
  gemLevel?: number
  gemQuality?: number
  mapTier?: number
  corrupted?: boolean
  qtyDelta: number
  chaosDelta: number
}

export interface WealthDiff {
  fromId: string
  toId: string
  fromAt: number
  toAt: number
  chaosDelta: number
  lines: WealthDiffLine[]
}

export interface WealthPriceInfo {
  /** время последнего часа фида обмена GGG, мс */
  exchangeHour?: number
  exchangeItems: number
  /** когда обновлены цены poe.watch, мс */
  poeWatchAt?: number
  poeWatchItems: number
  /** chaos за 1 divine по фиду */
  divineRate?: number
  /** последняя ошибка источника цен (сеть и т.п.) — снимок всё равно делается */
  problem?: 'exchange' | 'poewatch' | null
}

export interface WealthBudget {
  /** запросов к сайту на один снимок (= выбранных вкладок) */
  requests: number
  /** минимальный интервал авто-снимка при таком числе вкладок (лимит сайта), мин */
  minIntervalMin: number
  /** фактический интервал авто-снимка, мин */
  intervalMin: number
}

export type WealthAccountSource = 'manual' | 'session' | null

export interface WealthState {
  /** учёт богатства есть только у PoE 1 */
  supported: boolean
  league: string | null
  loggedIn: boolean
  account: { name: string | null; source: WealthAccountSource }
  status: WealthStatus
  tabs: WealthTab[]
  tabsAt?: number
  /** рекомендованный предел выбранных вкладок */
  maxTabs: number
  options: WealthOptions
  budget: WealthBudget
  latest: WealthSummary | null
  /** id последних снимков с деталями (новые в конце) */
  detailed: string[]
  history: WealthPoint[]
  farm: WealthFarmView
  prices: WealthPriceInfo
  /** когда следующий авто-снимок (мс epoch) */
  nextAutoAt?: number
  /** сессией фарма управляет трекер карт S11b (свои кнопки «Начать/Стоп» не показываем) */
  farmLinked?: boolean
}

export type WealthResult = { ok: true } | { ok: false; error: WealthError }

export type WealthAccountResult = 'ok' | 'bad-format'
