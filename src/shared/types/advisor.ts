// Типы домена «Советник: что фармить» (S16). Стратегии фарма для новичков приходят данными
// (resources/data/poe1/advisor/strategies.json, канал обновления данных S12), цены — из индекса цен
// учёта богатства (фид обмена GGG + poe.watch). Проверка и разбор — src/shared/advisor/{validate,data}.ts,
// расчёт — estimate.ts / time.ts. Только подсказки: никаких действий в игре.
//
// Модель рассчитана на обмен стратегиями (S17: редактор, код `POETH1:` + base64url(deflate(JSON)), каталог):
// схема с версией, предметы — по стабильным английским именам (refName), цен в стратегии нет (только
// количества), источник и автор — поле, тексты — на одном или двух языках, замер автора — отдельно от оценки.

import type { PriceSourceId, WealthPriceInfo } from './wealth'

/** Версия схемы стратегии и файла (новые поля — новая версия: валидатор строгий). */
export const ADVISOR_SCHEMA = 1

/** Текст автора: хотя бы один язык (второй UI подставит с пометкой «написано на английском»). */
export interface AdvisorText {
  ru?: string
  en?: string
}

/**
 * Вид предмета для цены — как в индексе цен учёта богатства (stackable / map / unique / gem) и
 * карты Таро: стакаются как валюта, но русское имя — из своего пространства имён.
 */
export type AdvisorItemKind = 'stackable' | 'card' | 'map' | 'unique' | 'gem'

/** Предмет в стратегии. */
export interface AdvisorItemRef {
  kind: AdvisorItemKind
  /**
   * Стабильный id предмета — английское имя (= refName данных APT = имя в фиде обмена и poe.watch),
   * одинаковое для RU и EN клиента. Нет — предмет без цены, только подпись.
   */
  ref?: string
  /** ярус карты (kind = map) */
  tier?: number
  /** уровень и качество камня (kind = gem): 1 и 0 по умолчанию */
  level?: number
  quality?: number
  /** подпись вместо имени («карта T14–16») */
  label?: AdvisorText
}

/** Строка «что вложить» или «что получишь» за одну карту (только количество — цены всегда живые). */
export interface AdvisorLine {
  item: AdvisorItemRef
  /** штук за карту; дробное — в среднем (0.3 — примерно раз в три карты) */
  qty: number
  /** вход: свой предмет с прошлых карт, не покупается — в стоимость входа не идёт */
  own?: boolean
  note?: AdvisorText
}

/** 1 — немного, 2 — средне, 3 — много. */
export type AdvisorLevel = 1 | 2 | 3

/** Что нужно билду (коротко). */
export interface AdvisorBuildNeeds {
  damage: AdvisorLevel
  survival: AdvisorLevel
  speed: AdvisorLevel
  note?: AdvisorText
}

/**
 * Откуда стратегия: official — наши данные; community — каталог POETH (S17); imported — игрок вставил код
 * сам; mine — игрок создал в редакторе (S17); wealthy — Wealthy Exile (только если автор сайта разрешит,
 * см. docs/advisor.md). В коде POETH1 вид источника не доверенный: импорт всегда ставит imported.
 */
export type AdvisorSourceKind = 'official' | 'community' | 'imported' | 'mine' | 'wealthy'

export interface AdvisorSource {
  kind: AdvisorSourceKind
  /** ник автора (без аккаунта и персонажа) */
  author?: string
  /** оригинал (https) */
  url?: string
  /** когда составлена или обновлена (YYYY-MM или YYYY-MM-DD) */
  date: string
  /** откуда количества («грубая оценка», «замер 40 карт») */
  note?: AdvisorText
}

/** Замер по трекеру карт (автора или свой — для экспорта): только числа, без аккаунта и персонажа. */
export interface AdvisorMeasured {
  maps: number
  hours: number
  /** chaos в час */
  perHour: number
  /** YYYY-MM-DD */
  date: string
  patch?: string
  league?: string
}

export interface AdvisorStrategy {
  /** латиница, цифры и дефис: метка стратегии у сессии фарма — не переименовывать */
  id: string
  name: AdvisorText
  /** одна строка под названием */
  summary: AdvisorText
  /** «почему это выгодно» простым языком */
  why: AdvisorText
  difficulty: AdvisorLevel
  build: AdvisorBuildNeeds
  /** механики (essence, strongbox, expedition…) */
  tags: string[]
  /** ключи словаря терминов (glossary) — подсказки к словам из шагов */
  terms: string[]
  /** типичное время одной карты с заходом в убежище, минут (если своих замеров нет) */
  minutesPerMap: number
  inputs: AdvisorLine[]
  outputs: AdvisorLine[]
  source: AdvisorSource
  /** замер автора (подтверждение реальными числами, а не оценкой) */
  measured?: AdvisorMeasured
  /** что взять на атласе */
  atlas: AdvisorText[]
  /** ссылка на дерево атласа (только https; открывается в браузере только по клику игрока) */
  atlasTree?: string
  /** что делать в карте, по шагам */
  steps: AdvisorText[]
  warnings: AdvisorText[]
  /** черновик: количества грубые, проверить после обновления лиги */
  draft: boolean
  /** для какой версии игры («3.29») — другая версия = «может устареть» (атлас меняется) */
  patch: string
  /** лига, если важна («Settlers») */
  league?: string
}

export interface AdvisorGlossaryTerm {
  term: AdvisorText
  tip: AdvisorText
}

/** Файл strategies.json после проверки. */
export interface AdvisorData {
  schema: typeof ADVISOR_SCHEMA
  /** версия игры, под которую данные (текущая для «может устареть») */
  patch: string
  updatedAt: string
  draft: boolean
  defaults: { minutesPerMap: number }
  glossary: Record<string, AdvisorGlossaryTerm>
  strategies: AdvisorStrategy[]
}

// ---------------------------------------------------------------------------
// Расчёт по ценам (main)
// ---------------------------------------------------------------------------

/** Строка стратегии с ценой. «Нет цены» — null, не 0. */
export interface AdvisorPricedLine {
  /** chaos за штуку; null — цены нет */
  unit: number | null
  /** unit × qty; у своего предмета — 0; null — цены нет */
  total: number | null
  source?: PriceSourceId
  /** цена по малому числу сделок */
  low?: boolean
}

/** Уверенность оценки: 3 — высокая, 2 — средняя, 1 — низкая (как ●●○ во вкладке «Обмен»). */
export type AdvisorConfidence = 1 | 2 | 3

/**
 * Почему уверенность ниже: low — цены по малому числу сделок; partial — у части добычи нет цены
 * (доход «не меньше»); noPrice — прибыль не посчитать; draft — количества черновые.
 */
export type AdvisorConfidenceReason = 'low' | 'partial' | 'noPrice' | 'draft'

/** Оценка одной карты по ценам. */
export interface AdvisorMapEstimate {
  /** в порядке strategy.inputs / strategy.outputs */
  inputs: AdvisorPricedLine[]
  outputs: AdvisorPricedLine[]
  /** вход за карту, chaos; null — у покупного предмета нет цены */
  cost: number | null
  /** добыча за карту по известным ценам; null — ни у одной строки нет цены */
  income: number | null
  /** часть добычи без цены: доход и прибыль — «не меньше» */
  incomePartial: boolean
  /** income − cost; null — не посчитать */
  profit: number | null
  confidence: AdvisorConfidence
  reasons: AdvisorConfidenceReason[]
}

export interface AdvisorStrategyView {
  strategy: AdvisorStrategy
  estimate: AdvisorMapEstimate
  /** каталог сообщества: когда проверена (YYYY-MM-DD) */
  checked?: string
  /** свои (mine / imported): когда добавлена (YYYY-MM-DD) */
  addedAt?: string
}

export interface AdvisorState {
  /** вкладка включена: features.advisor (релиз) или POETH_ADVISOR=1 (разработка) */
  enabled: boolean
  /** игра с советником (PoE 1) */
  supported: boolean
  league: string | null
  loading: boolean
  /** версия игры, дата и пометка «черновик» данных; null — файл не прочитан */
  data: Pick<AdvisorData, 'patch' | 'updatedAt' | 'draft' | 'defaults' | 'glossary'> | null
  /** наши, каталог сообщества и свои (mine / imported) */
  views: AdvisorStrategyView[]
  /** стратегий отброшено проверкой данных */
  invalid: number
  /** ник автора для «Поделиться» (запоминается); '' — не указан */
  nick: string
  /** откуда цены и когда (тот же индекс, что у учёта богатства) */
  prices: WealthPriceInfo | null
  /** data — файл стратегий не прочитан; prices — цены не загрузились (берём из кэша) */
  problem: 'data' | 'prices' | null
  /** момент расчёта (мс) */
  at: number | null
}

/** «Начать сессию фарма с этой стратегией»: started — новая сессия, tagged — метка на идущую. */
export type AdvisorFarmResult = 'started' | 'tagged' | 'unknown'

// ---------------------------------------------------------------------------
// Свои стратегии, код POETH1, импорт (S17)
// ---------------------------------------------------------------------------

/**
 * Почему код не прочитан: empty — пусто; notcode — не код POETH; newer — код или схема новее приложения;
 * broken — код обрезан или повреждён; toolarge — слишком большой (до или после распаковки);
 * invalid — данные не прошли проверку (detail — что именно, по-русски).
 */
export type AdvisorCodeError = 'empty' | 'notcode' | 'newer' | 'broken' | 'toolarge' | 'invalid'

/** Замечания к импорту (импорт возможен): нет цены у предмета, текст на одном языке, сторонняя ссылка, другая версия игры. */
export type AdvisorImportNote =
  | { kind: 'noPrice'; ref: string }
  | { kind: 'lang'; lang: 'ru' | 'en' }
  | { kind: 'link'; host: string }
  | { kind: 'outdated'; patch: string }

/** new — такой ещё нет; same — уже есть точно такая; conflict — есть с тем же id, но другая. */
export type AdvisorImportMatch = 'new' | 'same' | 'conflict'

export interface AdvisorImportExisting {
  id: string
  kind: AdvisorSourceKind
  name: AdvisorText
}

export type AdvisorImportPreview =
  | {
      ok: true
      /** нормализованный код (без ссылки и пробелов) */
      code: string
      /** как будет в списке: source.kind = imported, оценка по живым ценам */
      view: AdvisorStrategyView
      match: AdvisorImportMatch
      existing: AdvisorImportExisting | null
      notes: AdvisorImportNote[]
    }
  | { ok: false; error: AdvisorCodeError; detail?: string }

/** add — новая; replace — заменить свою с тем же id; copy — добавить копией с новым id. */
export type AdvisorImportMode = 'add' | 'replace' | 'copy'

export type AdvisorImportResult =
  | { ok: true; id: string }
  | { ok: false; error: AdvisorCodeError | 'exists' | 'disabled' }

/** Код и ссылка своей или любой стратегии из списка. */
export interface AdvisorShareInfo {
  code: string
  link: string
}

/** «Отправить в каталог»: opened — форма открыта с кодом; copied — код длинный, форма без кода, код в буфере. */
export type AdvisorSubmitResult = 'opened' | 'copied' | 'error'

export type AdvisorSaveResult = { ok: true; id: string } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Время и свой результат (renderer, по трекеру карт)
// ---------------------------------------------------------------------------

/** Откуда время карты: mine — ваши сессии с этой стратегией, tracker — все ваши сессии, default — из стратегии. */
export type AdvisorTimeSource = 'mine' | 'tracker' | 'default'

export interface AdvisorMapTime {
  /** минут на карту с заходом в убежище (время сессии ÷ карт) */
  minutes: number
  source: AdvisorTimeSource
  /** по скольким картам (0 — из стратегии) */
  maps: number
}

/** «Мой результат» по прошлым (и идущей) сессиям фарма с меткой стратегии. */
export interface AdvisorMyResult {
  sessions: number
  maps: number
  /** время сессий без пауз */
  durationMs: number
  /** сумма прибыли сессий, где она посчитана (учёт тайника); null — нигде */
  profitChaos: number | null
  /** chaos в час по сессиям с прибылью; null — прибыли нет или времени меньше минуты */
  perHour: number | null
  /** минут на карту (время ÷ карт); null — карт нет */
  mapMinutes: number | null
  /** идущая сессия с этой стратегией */
  live: boolean
}
