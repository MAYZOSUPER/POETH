// Трекер карт и сессии фарма по Client.txt (этап S11b; PoE 2 — S69). Чистые типы: разбор строк —
// src/shared/farm/zones.ts (PoE 2 — zonesPoe2.ts), забеги и сессия — src/shared/farm/tracker.ts.

import type { GameId } from '../games'

/**
 * Что за зона (по id из `Generating level N area "<id>"`, язык-независимо):
 * hideout — хайдаут; town — город или хаб (Rogue Harbour, лобби лабиринта…);
 * campaign — зона кампании; map — карта атласа (в т.ч. уникальная, память); other — прочий
 * контент с устройства/из хаба (ограбление, лабиринт, Мэйвен, Легион…);
 * sub — подобласть забега (только PoE 2: Abyssal Depths, пещеры Экспедиции): входит в открытый
 * забег, даже если вернулись в неё через убежище; без открытого забега — забег вида other.
 */
export type FarmAreaKind = 'hideout' | 'town' | 'campaign' | 'map' | 'other' | 'sub'

/** Забег бывает только в карте или прочем контенте. */
export type FarmRunKind = 'map' | 'other'

/**
 * Прибыль забега — сообщает S11a по снимкам тайника (setRunProfit): Σ(штук после − штук до) × цена
 * из снимка «после». Если лимит сайта не дал снять снимок между картами, прибыль приходит одной
 * суммой на `runs` забегов подряд и ставится на последний из них; предыдущие runs − 1 — «в группе».
 */
export interface FarmProfit {
  /** в хаосах-эквиваленте; может быть отрицательной (вложения дороже лута) */
  chaos: number
  /** за сколько забегов подряд, последний — этот (обычно 1) */
  runs: number
  /** курс div → chaos на момент снимка */
  divineRate?: number
  /** часть суммы — по ценам «мало сделок» */
  low?: boolean
}

/**
 * Забег: от входа в карту из хайдаута/города до входа в ДРУГУЮ карту (или «Стоп» сессии).
 * Порталы туда-обратно и перезаход после смерти — тот же забег: экземпляр зоны узнаём по
 * areaId + seed. Побочные зоны, в которые вошли прямо из карты, — тоже часть забега.
 */
export interface FarmRun {
  id: string
  /** id зоны первого входа ('MapWorldsLair') */
  areaId: string
  /** имя зоны на языке клиента (`[SCENE] Set Source`, «You have entered» / «Вы вошли в область») */
  areaName: string | null
  kind: FarmRunKind
  /** уровень области */
  areaLevel: number
  /** ярус карты (PoE 1: уровень области − 67 для 68…84; PoE 2: − 64 для 65…80), для прочего контента — null */
  tier: number | null
  /** seed экземпляра из строки входа */
  seed: string
  /** первый вход (мс, локальное время ПК из строки лога) */
  startTs: number
  /** последний выход; null — забег открыт */
  endTs: number | null
  /** время внутри зон забега без пауз сессии (мс) */
  activeMs: number
  /** входов в карту (первый + каждый портал/перезаход) */
  entries: number
  /** смерти в зонах забега (`has been slain` / `был повержен`; в группе — все в зоне) */
  deaths: number
  /** сессия, в которой начат (или к которой присоединён) забег */
  sessionId: string | null
  /** прибыль от S11a, если посчитана */
  profit?: FarmProfit
  /** PoE 2: «+ находка» — ценное из забега (Ctrl+D в окне цены или вручную), свежие в конце */
  finds?: FarmFind[]
}

/**
 * Находка забега (PoE 2, API для окна цены и «Богатства» S70): у PoE 2 нет API тайника, поэтому
 * прибыль карты — только то, что игрок отметил сам.
 */
export interface FarmFind {
  id: string
  /** английское имя предмета или `Metadata/…` — ключ цены */
  ref: string
  /** имя на языке клиента для строки в списке; нет — показываем ref */
  name?: string
  /** штук (≥ 1) */
  qty: number
  /** цена всей находки (за qty штук) в exalted; null — цена неизвестна */
  valueEx: number | null
  /** когда добавлена (мс) */
  at: number
  /** откуда: окно цены по Ctrl+D или ручной ввод */
  source: 'ctrlD' | 'manual'
}

/** Что присылают окно цены и ручной ввод: забег — текущий, если `runId` не указан. */
export interface FarmFindInput {
  ref: string
  name?: string
  /** по умолчанию 1 */
  qty?: number
  valueEx: number | null
  source?: FarmFind['source']
  runId?: string
}

/**
 * Итог «+ находка»: noRun — нет ни открытого забега, ни забега идущей сессии (игрок ещё не
 * заходил в карту); invalid — пустой ref или неверные числа; full — у забега уже 200 находок.
 */
export type FarmFindResult =
  | { ok: true; runId: string; find: FarmFind }
  | { ok: false; reason: 'noRun' | 'invalid' | 'full' }

/**
 * Прибыль сессии PoE 2 — считает «Богатство» (S70): снимок вкладок или ввод валюты в начале и в
 * конце сессии, разница по ценам. Трекер только хранит и показывает.
 */
export interface FarmSessionProfit {
  /** в exalted; может быть < 0 */
  ex: number
  /** курс: exalted за 1 divine на момент расчёта (показать в div) */
  exPerDiv?: number
  /** снимок вкладок (S68) или ручной ввод */
  source: 'snapshot' | 'manual'
  /** когда посчитана (мс) */
  at: number
}

export interface FarmSession {
  id: string
  startedAt: number
  /** null — идёт */
  endedAt: number | null
  /** с какого момента на паузе; null — не на паузе */
  pausedAt: number | null
  /** сумма завершённых пауз (мс) */
  pausedMs: number
  /** метка стратегии советника «что фармить» (S16) — id из strategies.json */
  strategy?: string
  /** PoE 2: прибыль сессии от «Богатства» (S70) — setSessionProfit */
  profit?: FarmSessionProfit
}

/** Статистика сессии на момент `FarmState.at` (или на момент «Стоп»). */
export interface FarmStats {
  /** время сессии без пауз (мс) */
  durationMs: number
  /** карт за сессию (с текущей) */
  maps: number
  /** забегов любого вида (с текущим) */
  runs: number
  /** карт в час; null — сессия короче минуты */
  mapsPerHour: number | null
  /** среднее время в карте по завершённым картам; null — завершённых нет */
  avgMapMs: number | null
  /** самая быстрая завершённая карта; null — завершённых нет */
  fastestMapMs: number | null
  deaths: number
  /** в скольких картах сессии (с текущей) были смерти */
  mapsWithDeaths: number
  /** сумма прибыли забегов (S11a); null — ни у одного забега нет прибыли */
  profitChaos: number | null
  /** прибыль в час; null — нет прибыли или сессия короче минуты */
  profitPerHour: number | null
  // ниже — только PoE 2 (у PoE 1 полей нет)
  /** находок в забегах сессии */
  finds?: number
  /** Σ цен находок в exalted; null — ни одной с ценой */
  findsEx?: number | null
  /** прибыль сессии от «Богатства» (S70) в exalted; null — не посчитана */
  profitEx?: number | null
  /** доход в час в exalted: по прибыли сессии, без неё — по находкам; null — нечего считать или сессия короче минуты */
  exPerHour?: number | null
}

/** Завершённая сессия в истории. */
export interface FarmSessionSummary extends FarmSession {
  endedAt: number
  stats: FarmStats
}

/** Где игрок сейчас (последний вход в зону). */
export interface FarmLocation {
  kind: FarmAreaKind
  areaId: string
  areaName: string | null
  level: number
  /** вход в зону (мс) */
  since: number
}

/** Позиция виджета поверх игры: центр полосы по x и верх по y — доли окна игры (0…1). */
export interface FarmWidgetPos {
  x: number
  y: number
}

/** Настройки трекера (userData/farm.json, не Settings v2). */
export interface FarmConfig {
  /** маленький виджет поверх игры во время сессии: таймер карты, карт за сессию, доход в час */
  overlayWidget: boolean
  /** куда виджет перетащили; null — сверху по центру */
  widgetPos: FarmWidgetPos | null
}

export type FarmConfigPatch = Partial<FarmConfig>

/** Состояние для renderer и S11a. Время «тикает» от `at`, если `ticking` / сессия идёт. */
export interface FarmState {
  /** игра трекера: у PoE 1 и PoE 2 своя история (farm.json / farm.poe2.json); трекер ставит всегда, нет — PoE 1 */
  game?: GameId
  /** момент снимка (мс) */
  at: number
  /** открытый забег (activeMs — на момент `at`) */
  current: FarmRun | null
  /** игрок в зоне текущего забега */
  inside: boolean
  /** время текущего забега идёт (внутри и сессия не на паузе) */
  ticking: boolean
  location: FarmLocation | null
  /** идущая сессия (в т.ч. на паузе); null — не начата */
  session: FarmSession | null
  stats: FarmStats | null
  /** завершённые забеги, свежие сверху */
  runs: FarmRun[]
  /** завершённые сессии, свежие сверху */
  sessions: FarmSessionSummary[]
  config: FarmConfig
}

/**
 * События для S11a (main, в процессе: farmSession.onFarmEvent). На переходе карта A → карта B —
 * синхронно подряд runEnd(A), затем runStart(B): один снапшот стэша годится как «после A» и
 * как «до B». runEnd.run.endTs — последний выход из карты (может быть раньше события).
 */
export type FarmEvent =
  | { type: 'runStart'; run: FarmRun; at: number }
  | { type: 'runEnd'; run: FarmRun; at: number }
  | { type: 'session'; state: 'start' | 'stop' | 'pause' | 'resume'; session: FarmSession; at: number }

/** Состояние Client.txt для трекера (общий тейлер процесса, services/gameLog.ts). */
export interface FarmLogStatus {
  /** читаем лог прямо сейчас */
  connected: boolean
  logPath: string | null
  /** игра поддерживает трекер (PoE 1 и PoE 2) */
  supported: boolean
}
