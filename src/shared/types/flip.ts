// Типы домена «помощник по флиппингу валюты» (S13, S25): почасовой фид обмена GGG → статистика пар → маршруты
// по реалистичным ценам. Оценка по прошлым часам, не live и не финансовый совет; никакой автоматизации ордеров.

export type FlipBase = 'chaos' | 'divine'
/** C→X→C, D→X→D, C→X→D, D→X→C */
export type FlipRouteKind = 'CXC' | 'DXD' | 'CXD' | 'DXC'

/** Целый ордер: отдать `give` штук, получить `get` штук (соотношение делится нацело). */
export interface FlipOrder {
  give: number
  get: number
}

export interface FlipLeg {
  base: FlipBase
  /** цена штуки X в валюте base (покупка — не дороже, продажа — не дешевле) */
  price: number
  /** ордер у Фаустуса: покупка — отдать base, получить X; продажа — отдать X, получить base */
  order: FlipOrder
  /**
   * «В игре, скорее всего» — база за штуку X по последним часам: покупка — от свежего VWAP до цены, по которой
   * покупают сразу; продажа — от цены, по которой продают сразу, до VWAP. Цель `price` — внутри.
   */
  range: { lo: number; hi: number }
}

/** Почему маршрут не прошёл фильтры (для эксперта). */
export type FlipReject = 'liquidity' | 'activity' | 'spread' | 'volatility' | 'depth' | 'trend' | 'profit' | 'budget'

export interface FlipRoute {
  id: string
  kind: FlipRouteKind
  /** короткий id фида ('Scarabs/ScarabHarvest2') */
  item: string
  /** английское имя предмета */
  name: string
  buy: FlipLeg
  sell: FlipLeg
  /** прибыль с одной штуки X, chaos (без золота) */
  profit: number
  /** прибыль / цена покупки */
  roi: number
  /** золото на одну штуку X: покупка X + получение валюты при продаже */
  goldPerUnit: number
  /** из чего оно: золото за купленную штуку X и за каждую единицу базы, полученную при продаже */
  gold: { x: number; base: number }
  /** chaos прибыли на 1000 золота */
  per1000Gold: number
  /** рекомендованный размер: штук X (кратно ордерам) */
  units: number
  /** сколько штук в час реально пройдёт через свой ордер (perHour = прибыль × flow) */
  flow: number
  /** оценка chaos в час */
  perHour: number
  /** уверенность 0–1 */
  confidence: number
  /** худшая нога: ликвидность chaos-экв. в час, активные часы из 24, волатильность, спред, тренд */
  liquidity: number
  activeHours: number
  volatility: number
  spread: number
  trend: number
  /** пустой — прошёл фильтры */
  rejects: FlipReject[]
}

export interface FlipFilters {
  /** ликвидность каждой ноги, div в час */
  minLiquidityDiv: number
  /** часов со сделками из 24 */
  minActiveHours: number
  minSpread: number
  maxSpread: number
  maxVolatility: number
  /** глубина стакана не меньше стольких размеров ордера */
  depthMultiple: number
  /** |vwap 6 ч / vwap 24 ч − 1| */
  maxTrend: number
  /** сколько игрок готов вложить в один флип, div (ордер не больше бюджета) */
  budgetDiv: number
}

/** Курс divine:chaos по часам: сейчас и коридоры за сутки и неделю. */
export interface DivineTrack {
  /** chaos за 1 divine (VWAP за 6 ч, как у учёта богатства) */
  current: number
  /** VWAP последнего часа */
  lastHour: number
  /** час фида (мс) */
  hour: number
  day: { lo: number; hi: number } | null
  week: { lo: number; hi: number } | null
  /** последний час вне коридора недели (мин–макс предыдущих часов) */
  outside: 'above' | 'below' | null
  /** точки для графика: час (мс) и chaos за divine */
  series: Array<{ at: number; rate: number }>
}

export interface FlipState {
  supported: boolean
  league: string | null
  /** часов фида в памяти и до какого часа (мс) */
  hours: number
  lastHour: number | null
  loading: boolean
  /** ошибка загрузки фида (сеть) — показываем данные из кэша */
  problem: 'network' | null
  divine: DivineTrack | null
  /** прошедшие фильтры, лучшие сверху (по уверенности × chaos/ч) */
  routes: FlipRoute[]
  /** не прошедшие (эксперт), с причинами */
  rejected: FlipRoute[]
  filters: FlipFilters
  /** откуда комиссии в золоте и когда собраны */
  feesFrom: string | null
  /** следующее плановое обновление фида (мс) — «обновим в 16:05» */
  nextUpdateAt: number | null
  options: FlipOptions
  /** тост «курс вышел из коридора недели» за текущий час фида уже отправлен (баннер под графиком) */
  alertSent: boolean
}

export interface FlipOptions {
  /** тост в оверлее, если курс divine вышел из коридора недели */
  divineAlert: boolean
}

/** Курс вышел из коридора недели (тост в оверлее, если включено). */
export interface FlipAlert {
  dir: 'above' | 'below'
  /** chaos за divine в последнем часе */
  rate: number
  lo: number
  hi: number
  /** час фида (мс) */
  hour: number
}

// ---------------------------------------------------------------------------
// Стакан «Курс / Кол-во» из игры (S28): Alt над «Рыночным курсом» → хоткей → распознавание на этом ПК
// ---------------------------------------------------------------------------

/**
 * Строка стакана как в игре: курс «Хочу : Имею» и запас («Кол-во» — сколько штук того, что хочу, можно
 * получить по этому курсу).
 */
export interface BookRow {
  want: number
  have: number
  stock: number
  /** «‹ 1 : 318» — всё, что дальше по цене, одной строкой: курс здесь — граница, дальше только хуже */
  beyond?: boolean
}

export type BookCell = 'want' | 'have' | 'stock'

export interface BookDoubt {
  row: number
  cell: BookCell
}

export interface BookReading {
  /** когда считано (мс) */
  at: number
  rows: BookRow[]
  /**
   * ячейки, в которых распознаватель не уверен: подсветить, в расчёт — только после проверки игроком
   * (проверки самих строк — shared/flip/book bookDoubts — считаются отдельно, по числам)
   */
  doubt: BookDoubt[]
  /** 'screen' — с экрана как есть, 'manual' — поправлено или подтверждено игроком */
  source: 'screen' | 'manual'
}

/**
 * Почему не считали: нет окна игры (запасной режим оверлея) или курсор вне игры; таблицы на снимке нет
 * (не зажат Alt, курсор не над «Рыночным курсом»); таблица есть, но цифры не читаются; уже читаем; сбой.
 */
export type BookReadFail = 'no-game' | 'no-table' | 'unreadable' | 'busy' | 'error'

export type BookReadResult =
  | { ok: true; reading: BookReading; ms: number }
  | { ok: false; reason: BookReadFail; at: number }

/** Событие «стакан считан / не удалось» (компаньон — в карточку, оверлей — тост у курсора). */
export interface FlipBookEvent {
  result: BookReadResult
  /** курсор в координатах окна оверлея (CSS px) в момент снимка; null — неизвестно */
  cursor: { x: number; y: number } | null
}
