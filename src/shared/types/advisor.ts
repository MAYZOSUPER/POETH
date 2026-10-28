// Типы домена «Советник: что фармить» (S16). Стратегии фарма для новичков приходят данными
// (resources/data/poe1/advisor/strategies.json, канал обновления данных S12), цены — из индекса цен
// учёта богатства (фид обмена GGG + poe.watch). Разбор данных и расчёт — src/shared/advisor/*.
// Только подсказки: никаких действий в игре.

import type { PriceSourceId, WealthPriceInfo } from './wealth'

/** Текст на обоих языках интерфейса. */
export interface AdvisorText {
  ru: string
  en: string
}

/**
 * Вид предмета для цены — как в индексе цен учёта богатства (stackable / map / unique / gem) и
 * карты Таро: стакаются как валюта, но русское имя — из своего пространства имён.
 */
export type AdvisorItemKind = 'stackable' | 'card' | 'map' | 'unique' | 'gem'

/** Предмет в стратегии. */
export interface AdvisorItemRef {
  kind: AdvisorItemKind
  /** английское имя (фид обмена GGG / poe.watch); нет — предмет без цены, только подпись */
  name?: string
  /** ярус карты (kind = map) */
  tier?: number
  /** уровень и качество камня (kind = gem): 1 и 0 по умолчанию */
  level?: number
  quality?: number
  /** подпись вместо имени («карта T14–16») */
  label?: AdvisorText
}

/** Строка «что вложить» или «что получишь» за одну карту. */
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

export interface AdvisorStrategy {
  /** латиница, цифры и дефис: метка стратегии у сессии фарма */
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
  /** откуда количества «что получишь»: текст и дата (YYYY-MM или YYYY-MM-DD) */
  source: { text: AdvisorText; date: string }
  /** что взять на атласе */
  atlas: AdvisorText[]
  /** что делать в карте, по шагам */
  steps: AdvisorText[]
  warnings: AdvisorText[]
  /** черновик: количества грубые, проверить после обновления лиги */
  draft: boolean
  /** для какой версии игры («3.29») */
  patch: string
}

export interface AdvisorGlossaryTerm {
  term: AdvisorText
  tip: AdvisorText
}

/** Файл strategies.json после проверки. */
export interface AdvisorData {
  version: 1
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
  views: AdvisorStrategyView[]
  /** стратегий отброшено проверкой данных */
  invalid: number
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
