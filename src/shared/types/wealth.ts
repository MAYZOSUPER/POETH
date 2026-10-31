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
  /** «только изъятие» — по умолчанию не считается */
  removeOnly?: boolean
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

/**
 * Откуда цена: PoE 1 — фид обмена GGG и poe.watch; PoE 2 (S70) — фид обмена GGG poe2 («у Ange»), снимок poe.ninja
 * PoE 2 и окно цены (ценные предметы по Ctrl+D).
 */
export type PriceSourceId = 'exchange' | 'poewatch' | 'ange' | 'ninja' | 'pricecheck'

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
  /**
   * PoE 2 (S70): суммы и цены — в exalted (поля chaos/unit/total — в базовой валюте игры), divineRate — exalted за
   * divine. Нет поля — chaos (PoE 1).
   */
  base?: 'exalted'
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
  /** цена штуки и источник (из снимка «после», для пропавшего — «до») */
  unit?: number
  source?: PriceSourceId
  low?: boolean
  reason?: UnpricedReason
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
  /** изменение за сутки (или с первого снимка, если истории меньше суток) */
  delta?: WealthDelta
  /** изменение за сутки по вкладкам (id → chaos) */
  tabDelta?: Record<string, number>
  /** «Обновить» снова доступно с этого момента (не чаще раза в минуту) */
  refreshAt?: number
}

export interface WealthDelta {
  chaos: number
  /** в процентах от стоимости в начале; null — начало было 0 */
  pct: number | null
  /** от какого момента считали */
  fromAt: number
}

export type WealthResult = { ok: true } | { ok: false; error: WealthError }

export type WealthAccountResult = 'ok' | 'bad-format'

// ------------------------------------------------------------------ «Богатство PoE 2» (S70)
// У GGG нет API тайника для PoE 2. Три источника — ручной ввод валюты, ценные предметы из окна цены (Ctrl+D) и
// снимок особой вкладки с экрана (модуль S68) — складываются в обычный WealthSnapshot (база — exalted): история,
// разница и прибыль сессии считаются тем же кодом, что у PoE 1 (buildSnapshot / diffSnapshots / qtyProfit).

/** Валюта для ручного ввода (resources/data/poe2/wealth/currency.json): английское имя и tradeTag (иконка). */
export interface Poe2CurrencyRef {
  name: string
  tag?: string
}

/** Чем оценён ценный предмет в окне цены. */
export type Poe2ValuableSource = 'ange' | 'trade' | 'ninja' | 'manual'

export type Poe2ValuableKind = 'unique' | 'rare' | 'magic' | 'normal' | 'currency' | 'gem' | 'other'

/** Ценный предмет из окна цены PoE 2 (Ctrl+D → «Добавить в богатство»): цена — та, что показало окно. */
export interface Poe2Valuable {
  id: string
  /** английское имя: у уника — его имя, иначе база */
  name: string
  base?: string
  kind?: Poe2ValuableKind
  qty: number
  /** exalted за штуку */
  unit: number
  source: Poe2ValuableSource
  /** мало лотов / сделок — цена примерная */
  low?: boolean
  at: number
  /** «К забегу»: находка забега трекера карт (id забега, S69) */
  runId?: string
}

/** Что присылает окно цены; id и время ставит main. */
export interface Poe2ValuableInput {
  name: string
  base?: string
  kind?: Poe2ValuableKind
  qty?: number
  unit: number
  source: Poe2ValuableSource
  low?: boolean
  /** «К забегу» (окно цены во время сессии фарма): ещё и находка текущего забега */
  toRun?: boolean
}

/** Предмет вкладки, принятой из снимка экрана. */
export interface Poe2ScreenItem {
  name: string
  qty: number
  /** число прочитано уверенно или поправлено игроком */
  sure: boolean
}

/** Вкладка тайника, прочитанная с экрана и принятая игроком. */
export interface Poe2ScreenTab {
  /** screen:poe2:<окно>:<раскладка> — у повторного снимка той же вкладки тот же ключ */
  id: string
  /** раскладка особой вкладки ('orbs', 'essence', …); null — без раскладки */
  layout: string | null
  at: number
  items: Poe2ScreenItem[]
}

/** Источники богатства PoE 2 (userData/wealth-poe2/sources.json). */
export interface Poe2Sources {
  /** ручной ввод: английское имя → штук */
  manual: Record<string, number>
  manualAt: number | null
  /**
   * когда правили строку (имя → мс): предмет считается один раз — из ручного ввода или из принятой вкладки,
   * что новее (макет «Богатство PoE 2»)
   */
  manualTimes: Record<string, number>
  /** золото — только вручную, в итог в exalted не входит (цены у золота нет) */
  gold: number
  goldAt: number | null
  valuables: Poe2Valuable[]
  screen: Poe2ScreenTab[]
}

/** Строка карточки снимка вкладки. */
export interface Poe2ScreenLine {
  /** номер ячейки раскладки (или порядковый) — ключ правки */
  key: string
  /** английское имя */
  name: string
  /** тот же рисунок у других предметов (без раскладки — уровни Greater/Perfect): выбирает игрок */
  alt?: string[]
  /** число в стопке; null — не прочитано */
  qty: number | null
  /** число прочитано уверенно */
  sure: boolean
  /** число поправлено или подтверждено игроком («верно») — неуверенное без этого в снимок не идёт */
  edited?: boolean
  /** exalted за штуку */
  unit?: number
  low?: boolean
}

export interface Poe2ScreenCardTab {
  id: string
  layout: string | null
  at: number
  lines: Poe2ScreenLine[]
  /** ячеек с предметом, который не узнан (в итог не идут) */
  unknown: number
}

/** Почему вкладку не прочитать (как ScreenFail модуля S68). */
export type Poe2ScreenFail = 'no-game' | 'not-found' | 'no-icons' | 'error' | 'unsupported'

/** «Сеанс снимка»: вкладки, прочитанные по клавише и ещё не принятые (карточка в компаньоне). */
export interface Poe2ScreenSession {
  startedAt: number
  tabs: Poe2ScreenCardTab[]
  /** клавишу нажали — идёт чтение */
  busy?: boolean
  /** последнее чтение не удалось */
  fail?: Poe2ScreenFail
}

/** Правка строки карточки игроком. */
export interface Poe2ScreenEdit {
  qty?: number
  /** выбор из alt */
  name?: string
}

/** Итог источника для шапки «Богатства». */
export interface Poe2SourceTotal {
  /** exalted */
  ex: number
  /** когда источник обновляли последний раз; null — пусто */
  at: number | null
  /** старше суток — серым */
  stale: boolean
  /** предметов без цены */
  unpriced: number
}

/** Строка ручного ввода валюты. */
export interface Poe2ManualRow {
  name: string
  tag?: string
  /** main — div/ex/chaos, common — ходовая из данных, extra — введена раньше, но в списке её уже нет */
  group: 'main' | 'common' | 'extra'
  qty: number
  /** exalted за штуку */
  unit?: number
  source?: PriceSourceId
  low?: boolean
  /** столько штук есть в принятых вкладках снимка */
  inScreen: number
  /** когда правили строку */
  at?: number
  /** строку перекрывает более новая вкладка снимка — в итог она не входит («учтено в снимке …») */
  covered?: { layout: string | null; at: number }
}

export interface Poe2ScreenTabView {
  id: string
  layout: string | null
  at: number
  /** штук предметов */
  items: number
  ex: number
  stale: boolean
}

/** Прибыль сессии фарма PoE 2: снимок (ввод) в начале и в конце. */
export interface Poe2WealthSession {
  startedAt: number
  startId: string
  startEx: number
  stoppedAt?: number
  /** последний снимок сессии (после «Стоп» — снимок конца) */
  endId?: string
  endEx?: number
  /** прибыль по штукам (qtyProfit), exalted */
  profitEx?: number
  low?: boolean
  /** «Стоп» нажат, а снимка или ввода после него ещё не было */
  awaitingEnd?: boolean
}

export interface Poe2WealthPrices {
  /** последний час фида обмена GGG poe2, мс */
  feedHour?: number
  /** когда CI снял цены poe.ninja PoE 2, мс */
  ninjaAt?: number
  /** лига снимка poe.ninja, если не лига игрока */
  ninjaLeague?: string
  /** фид недоступен (сеть) — цены из кэша или снимка */
  problem?: boolean
  /** цены ещё грузятся */
  loading?: boolean
}

export interface Poe2WealthState {
  supported: boolean
  league: string | null
  /** exalted за divine; null — курса нет */
  exPerDivine: number | null
  prices: Poe2WealthPrices
  /** итог сейчас — текущие источники по текущим ценам, exalted */
  total: { ex: number; unpriced: number; approx: boolean; at: number | null }
  gold: { qty: number; at: number | null; stale: boolean }
  sources: {
    screen: Poe2SourceTotal & { tabs: number }
    manual: Poe2SourceTotal
    valuables: Poe2SourceTotal & { count: number }
  }
  manual: Poe2ManualRow[]
  valuables: Array<Poe2Valuable & { stale: boolean }>
  screenTabs: Poe2ScreenTabView[]
  /** карточка «сеанса снимка»; null — сеанса нет */
  screen: Poe2ScreenSession | null
  /** когда игрок последний раз нажал «Записать в богатство» в панели Alt+F — компаньон открывает карточку */
  screenOpenAt?: number
  /** изменение итога за сутки (или с первой записи), exalted */
  delta?: { ex: number; fromAt: number }
  history: WealthPoint[]
  latest: WealthSummary | null
  session: Poe2WealthSession | null
  /** сессией фарма управляет трекер карт (FarmPanel) */
  farmLinked: boolean
}
