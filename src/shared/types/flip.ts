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

// ---------------------------------------------------------------- S33: флиппинг предметов (уники PoE 1)
// Цены — снимок poe.ninja раз в час (ветка `prices`, собирает CI), поиск — сайт трейда по клику игрока.
// Оценка, не финансовый совет; никаких авто-покупок и поисков по таймеру.

/** Stat-фильтр трейда, которым poe.ninja описывает вариант (у Foulborn — заменённое свойство). */
export interface ItemTradeStat {
  id: string
  min?: number
  max?: number
}

/** Строка снимка цен: один уник в одном варианте и с одними связями. */
export interface ItemLine {
  /** detailsId poe.ninja — уникален в лиге */
  id: string
  /** имя как у poe.ninja (Foulborn — с приставкой) */
  name: string
  base: string
  /** тип item overview poe.ninja ('UniqueArmour'…) */
  type: string
  /** рамка poe.ninja: 3 и 10 — уник, 9 — фольга (реликвия) */
  cls: number
  variant?: string
  links?: 5 | 6
  itemType?: string
  corrupted?: boolean
  /** число имплицитов у оценённого предмета (нет — poe.ninja не прислал) */
  implicits?: number
  trade?: ItemTradeStat[]
  /** цена, chaos */
  chaos: number
  /** наблюдений за ценой */
  count: number
  /** лотов сейчас */
  listings: number
  /** изменение за 7 дней, % */
  change?: number
  spark?: Array<number | null>
}

export interface ItemSnapshot {
  league: string
  /** время снимка (мс) */
  at: number
  source: 'poe.ninja'
  /** chaos за divine по poe.ninja (запасной курс, если нет фида обмена) */
  divine?: number
  lines: ItemLine[]
}

export interface ItemSnapshotIndex {
  at: number
  leagues: Array<{ league: string; file: string; at: number }>
}

/** Тир уника по цене в divine: T0 ≥ 10, T1 ≥ 1, T2 ≥ 0,1, дешевле — low. */
export type UniqueTier = 'T0' | 'T1' | 'T2' | 'low'
/** Как быстро продаётся (оценка по числу наблюдений и лотов poe.ninja). */
export type ItemLiquidity = 'fast' | 'normal' | 'slow'

/** Строка вкладки: цена уника и расчёт. */
export interface ItemRow {
  id: string
  /** английское имя без Foulborn (по нему — запрос и имя на языке игры) */
  name: string
  base: string
  variant?: string
  links?: 5 | 6
  /** без связей, но есть 5L/6L: цена за 0–4 связи */
  unlinked?: boolean
  foulborn: boolean
  type: string
  itemType?: string
  /** цена poe.ninja, chaos и divine */
  chaos: number
  div: number
  tier: UniqueTier
  /** мало данных (наблюдений или лотов): цена и тир неточны */
  thin: boolean
  count: number
  listings: number
  /** изменение за 7 дней, % */
  change?: number
  liquidity: ItemLiquidity
  /** уверенность 0–1 */
  confidence: number
  /** «обычно продаётся за»: цена со скидкой на скорость продажи, chaos */
  sell: number
  /** на трейде вариант не отличить (другие варианты того же уника, а stat-фильтров нет) */
  ambiguous?: boolean
  /** в топе ликвидных */
  top?: boolean
}

/** «6L против без связей»: купить без связей, сделать 6 гнёзд и 6 связей на верстаке, продать 6L. */
export interface SixLinkRow {
  /** id строки 6L */
  id: string
  /** id строки без связей */
  baseId: string
  name: string
  base: string
  variant?: string
  foulborn: boolean
  /** цена без связей (покупка), chaos */
  buy: number
  /** ожидаемая продажа 6L, chaos */
  sell: number
  /** сырьё верстака: штук Fusing и Jeweller's */
  fusing: number
  jewellers: number
  /** стоимость связей и гнёзд, chaos; null — нет цены сфер в фиде */
  cost: number | null
  /** выгода = продажа 6L − покупка − стоимость; null — без цены сфер */
  profit: number | null
  confidence: number
  liquidity: ItemLiquidity
  /** мало данных у 6L или у формы без связей — выгода может быть случайной */
  thin: boolean
}

export interface ItemFlipConfig {
  /** покупать не дороже k × цены poe.ninja */
  k: number
  /** выбранные игроком уники (id строк) */
  picks: string[]
  /** список «Недооценённых»: топ ликвидных или свои */
  list: 'top' | 'mine'
}

export interface ItemFlipState {
  /** PoE 1 и функция включена (флаг) */
  supported: boolean
  league: string | null
  loading: boolean
  /** net — сеть (данные из кэша), missing — в снимке нет этой лиги */
  problem: 'net' | 'missing' | null
  /** время снимка цен (мс) */
  at: number | null
  nextAt: number | null
  /** chaos за divine: фид обмена GGG, иначе курс poe.ninja */
  divine: number
  /** цена сфер для 6L, chaos (фид обмена GGG); null — нет данных */
  fusing: number | null
  jewellers: number | null
  rows: ItemRow[]
  sixLinks: SixLinkRow[]
  config: ItemFlipConfig
}

/**
 * Итог проверки лота: выгодно; выгода мала; приманка (в разы дешевле соседей, лично); старый (> 7 дней);
 * другой вариант / порча / связи / имплициты; продавец в списке price-fixer'ов PoE Hub; цена в непонятной валюте.
 */
export type ItemLotVerdict =
  | 'deal'
  | 'thin'
  | 'bait'
  | 'old'
  | 'variant'
  | 'corrupted'
  | 'links'
  | 'implicits'
  | 'fixer'
  | 'currency'

export interface ItemLot {
  id: string
  kind: 'instant' | 'person'
  /** цена лота как выставлена */
  amount: number | null
  currency: string | null
  /** в chaos; null — валюта без курса */
  chaos: number | null
  /** комиссия мгновенного выкупа, золото */
  fee?: number
  account: string
  online: 'online' | 'afk' | 'offline'
  /** дней с выставления */
  ageDays?: number
  links?: number
  verdict: ItemLotVerdict
  /** прибыль при продаже по ожидаемой цене, chaos */
  profit?: number
  /** в разы дешевле остальных (у мгновенного выкупа — не приманка, но сверьте предмет) */
  tooCheap?: boolean
  confidence?: number
}

export type ItemCheckError = 'no-row' | 'busy' | 'no-league' | 'rate-limited' | 'blocked' | 'net' | 'bad'

export type ItemCheckResult =
  | {
      ok: true
      rowId: string
      at: number
      /** лотов дешевле порога на сайте всего */
      total: number
      /** порог поиска, chaos (k × цена poe.ninja) */
      maxChaos: number
      /** ожидаемая продажа, chaos (с поправкой на «рынок ниже цены poe.ninja») */
      sell: number
      /** ≥ 3 лотов в ±15 % друг от друга дешевле порога: цена, похоже, упала */
      market: { price: number; n: number } | null
      lots: ItemLot[]
      siteUrl: string
    }
  | { ok: false; rowId: string; error: ItemCheckError; retryAfterMs?: number }

export type ItemWatchResult = { ok: true; siteUrl: string; title: string } | { ok: false; error: ItemCheckError; retryAfterMs?: number }
