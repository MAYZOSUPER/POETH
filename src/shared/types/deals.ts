// Менеджер входящих/исходящих сделок + подсветка ячейки стэша (этап S8).
// Чистые типы: разбор строк Client.txt — src/shared/deals/whisperParse.ts, история —
// src/shared/deals/history.ts, геометрия стэша — src/shared/deals/stashGrid.ts.

/** Язык текста сообщения (не клиента игры: RU-клиент получает и EN-whisper'ы с сайта). */
export type DealLang = 'en' | 'ru'

/** in — нам пишут купить (мы продаём), out — мы пишем продавцу. */
export type DealDir = 'in' | 'out'

/**
 * new — пришло/отправлено, invited — пригласили в группу, traded — обмен завершён
 * («Trade accepted»), sold — пользователь отметил «продано» (предмет уходит в игнор),
 * ignored — не отвечать / сообщение о уже проданном предмете.
 */
export type DealStatus = 'new' | 'invited' | 'traded' | 'sold' | 'ignored'

/** Позиция в стэше из сообщения: left — столбец, top — ряд, с 1 (как в игре). */
export interface StashPos {
  left: number
  top: number
}

export interface DealPrice {
  /** NaN не бывает: без числа цены нет (только raw) */
  amount: number
  /** «chaos», «divine», «Chaos Orb»… — как в сообщении */
  currency: string
}

export interface DealGem {
  level: number
  quality: number
}

/** Совпадение с чёрным списком PoE Hub. */
export interface BlacklistHit {
  /** имя аккаунта из списка */
  account: string
  /** причина из списка (EN, как в CSV) */
  reason: string
  /** дата из списка, «ДД/ММ/ГГГГ» */
  since: string
  /**
   * account — совпало имя аккаунта (точно);
   * character — имя персонажа совпало с именем аккаунта из списка (вероятно, но не наверняка)
   */
  matchedBy: 'account' | 'character'
}

/** Сделка в истории (deals.json). */
export interface Deal {
  id: string
  dir: DealDir
  /** имя персонажа собеседника */
  player: string
  /** тег гильдии из лога (<TAG>), если был */
  guild?: string
  /** имя аккаунта собеседника, если известно (исходящие из прайс-чека/live — S4/S6) */
  account?: string
  /** предмет как в сообщении (для bulk — без количества) */
  item: string
  /** количество для bulk */
  itemAmount?: number
  gem?: DealGem
  /** цена текстом как в сообщении («5 chaos»); '' — без цены */
  price: string
  priceValue?: DealPrice
  league: string
  /** имя вкладки стэша; '' — вкладка без имени */
  tab?: string
  pos?: StashPos
  /** приписка покупателя после координат («offer 4c?») */
  message?: string
  /** bulk-обмен (валюта, карты…) */
  bulk: boolean
  lang: DealLang
  /** время из строки лога (мс, локальное время ПК) */
  ts: number
  status: DealStatus
  /** время последней смены статуса */
  updatedAt?: number
  /** исходный текст сообщения (для экспертного режима) */
  raw?: string
  blacklist?: BlacklistHit
  /** пример для знакомства с вкладкой (кнопка «Показать пример») */
  demo?: boolean
  /** карточка поверх игры закрыта (✕, «Кик», после «Продано») — сделка остаётся в истории */
  cardHidden?: boolean
}

/** Шаблоны ответов одного языка. Подстановки: {player} {item} {price} {league}. */
export interface ReplyTemplates {
  thanks: string
  sold: string
  still: string
  wait: string
}

export type ReplyKind = keyof ReplyTemplates

/** Настройки менеджера сделок, которых нет в Settings v2 (хранятся в deals.json). */
export interface DealsConfig {
  /** звук при входящей сделке (громкость — общая Settings.sound) */
  sound: boolean
  /** скрывать карточку после «Продано» */
  hideAfterSold: boolean
  /** проверять собеседников по чёрному списку PoE Hub */
  checkBlacklist: boolean
  /** подсвечивать ячейку стэша */
  highlightStash: boolean
  /** показывать карточки исходящих сделок */
  showOutgoing: boolean
  /** вкладка продаж лежит в папке стэша (сетка ниже на строку папок) */
  stashInFolder: boolean
  /** сколько сделок хранить в истории */
  historyLimit: number
  /** язык ответов: auto — язык сообщения собеседника */
  replyLang: 'auto' | DealLang
  templates: Record<DealLang, ReplyTemplates>
  /**
   * Client.txt PoE1, выбранный вручную; null — автопоиск по GameDef.logSubdirs.
   * Свой, а не Settings.logPath: тот путь — лог PoE2 для кампании.
   */
  logPath: string | null
}

export type DealsConfigPatch = Partial<Omit<DealsConfig, 'templates'>> & {
  templates?: Partial<Record<DealLang, Partial<ReplyTemplates>>>
}

/** Предмет, по которому больше не показываем карточки (продан). */
export interface IgnoredItem {
  /** ключ: предмет + вкладка + позиция (см. history.ignoreKey) */
  key: string
  item: string
  ts: number
}

/** Состояние домена для renderer. */
export interface DealsState {
  deals: Deal[]
  config: DealsConfig
  /** сколько проданных предметов сейчас в игноре */
  ignoredCount: number
  /** вкладки, которые встречались как quad 24×24 (нижний регистр) */
  quadTabs: string[]
}

export type DealsFilter = 'all' | 'in' | 'out' | 'sold'

/** Состояние кэша чёрного списка PoE Hub. */
export interface BlacklistStatus {
  /** записей в списке (0 — ещё не загружен) */
  count: number
  /** когда скачан (мс) */
  fetchedAt: number | null
  /** идёт загрузка */
  loading: boolean
  /** последняя ошибка загрузки (кэш при этом остаётся) */
  error: string | null
}

/** Результат «Экспорт истории». */
export interface DealsExportResult {
  status: 'saved' | 'canceled' | 'error'
  path?: string
}

/** Client.txt для менеджера сделок (общий тейлер процесса, services/gameLog.ts). */
export interface DealsLogStatus {
  /** читаем лог прямо сейчас (файл найден) */
  connected: boolean
  /** файл найден/выбран */
  logPath: string | null
  /** путь выбран вручную (иначе — автопоиск) */
  custom: boolean
}

/** Кнопка карточки сделки → одна команда в чат (см. @shared/deals/commands). */
export type DealCardAction =
  | 'invite'
  | 'trade'
  | 'kick'
  | 'whois'
  | 'hideout'
  | 'thanks'
  | 'sold'
  | 'still'
  | 'wait'

/** Результат кнопки карточки: что ответил ввод в игру и новое состояние. */
export interface DealActionResult {
  /** ok — команда напечатана в чат; no-deal — сделки нет (карточка устарела) */
  result: 'ok' | 'no-game' | 'no-input' | 'busy' | 'no-deal'
  /** напечатанная команда (для подсказки) */
  command?: string
  state: DealsState
}

/** Запуск калибровки поверх игры. */
export type DealsCalibrateResult = 'ok' | 'no-game'

// ---------------------------------------------------------------------------
// Settings.deals (Settings v2, раздел домена)
// ---------------------------------------------------------------------------

/**
 * Сетка стэша для подсветки: 'auto' — по позиции из сообщения (столбец или ряд > 12 → quad),
 * 'normal' — всегда 12×12, 'quad' — всегда 24×24.
 */
export type StashGridMode = 'auto' | 'normal' | 'quad'

/**
 * Ручная калибровка сетки стэша: прямоугольник всей сетки в пикселях клиентской области
 * окна игры (левый-верхний угол первой ячейки → правый-нижний угол последней).
 * refWidth/refHeight — размер окна игры при калибровке: при другом размере прямоугольник
 * масштабируется по высоте (интерфейс PoE масштабируется по высоте окна).
 */
export interface StashCalibration {
  left: number
  top: number
  width: number
  height: number
  refWidth?: number
  refHeight?: number
}

export interface DealsSettings {
  /** менеджер сделок включён */
  enabled: boolean
  stashGrid: StashGridMode
  /** null = калибровка не задана (позиция считается по высоте окна игры) */
  calibration: StashCalibration | null
}
