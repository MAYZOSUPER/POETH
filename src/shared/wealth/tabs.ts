// Выбор вкладок, имя аккаунта и бюджет запросов стэша (чистый модуль; tests/wealth/tabs.test.ts).

import type { StashTabInfo } from './stash'

/** Рекомендованный предел выбранных вкладок (снимок = столько запросов к сайту). */
export const DEFAULT_MAX_TABS = 25
/** Жёсткий предел: больше вкладок за снимок не берём. */
export const HARD_MAX_TABS = 40

/** Вкладки, где обычно лежит ценное, — в выбор по умолчанию первыми. */
const PRIORITY_TYPES = [
  'CurrencyStash',
  'FragmentStash',
  'DivinationCardStash',
  'EssenceStash',
  'DelveStash',
  'BlightStash',
  'DeliriumStash',
  'UltimatumStash',
  'MetamorphStash',
  'FlaskStash',
  'GemStash'
]

/**
 * Выбор по умолчанию: особые вкладки (валюта, фрагменты, карты…) первыми, затем обычные
 * по порядку; без вкладок, которые сайт не отдаёт; не больше max.
 */
export function defaultTabSelection(tabs: readonly StashTabInfo[], max = DEFAULT_MAX_TABS): string[] {
  const ok = tabs.filter((t) => !t.unsupported && !t.removeOnly)
  const rank = (t: StashTabInfo): number => {
    const i = PRIORITY_TYPES.indexOf(t.type)
    return i < 0 ? PRIORITY_TYPES.length : i
  }
  return [...ok]
    .sort((a, b) => rank(a) - rank(b) || a.index - b.index)
    .slice(0, max)
    .map((t) => t.id)
}

/**
 * Сохранённый выбор (id вкладок) → актуальный: исчезнувшие и неподдерживаемые вкладки
 * выпадают, порядок — как на сайте, не больше HARD_MAX_TABS. null — выбора ещё не было.
 */
export function reconcileSelection(tabs: readonly StashTabInfo[], saved: readonly string[] | null): string[] {
  if (saved === null) return defaultTabSelection(tabs)
  const want = new Set(saved)
  return tabs
    .filter((t) => want.has(t.id) && !t.unsupported)
    .sort((a, b) => a.index - b.index)
    .slice(0, HARD_MAX_TABS)
    .map((t) => t.id)
}

/**
 * Новый список вкладок + прежний выбор: исчезнувшие выпадают, появившиеся вкладки включаются
 * (кроме «только изъятие» и тех, что сайт не отдаёт) — так по макету «новые вкладки включены».
 * Выбора ещё не было — выбор по умолчанию.
 */
export function mergeTabSelection(
  prev: readonly StashTabInfo[] | null,
  next: readonly StashTabInfo[],
  saved: readonly string[] | null
): string[] {
  if (saved === null) return defaultTabSelection(next)
  const want = new Set(saved)
  if (prev) {
    const known = new Set(prev.map((t) => t.id))
    for (const t of next) if (!known.has(t.id) && !t.unsupported && !t.removeOnly) want.add(t.id)
  }
  return reconcileSelection(next, [...want])
}

// ---------------------------------------------------------------- имя аккаунта

const ACCOUNT_RE = /^[^\s#<>"'/\\]{3,40}#\d{4}$/
const LEGACY_ACCOUNT_RE = /^[A-Za-z0-9_]{3,40}$/

/**
 * Имя аккаунта для запроса стэша: 'Name#1234' (как в профиле сайта); из ссылки на профиль
 * приходит 'Name-1234' — приводим. Старые имена без номера допускаются. null — не похоже на имя.
 */
export function normalizeAccountName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  if (!s.includes('#')) {
    const m = /^(.+)-(\d{4})$/.exec(s)
    if (m) s = `${m[1]}#${m[2]}`
  }
  if (ACCOUNT_RE.test(s) || LEGACY_ACCOUNT_RE.test(s)) return s
  return null
}

// ---------------------------------------------------------------- бюджет лимитов

/** Окно лимита сайта: hits запросов за periodSec. */
export interface BudgetWindow {
  hits: number
  periodSec: number
}

/** Проверенные IP-лимиты политики backend-item-request-limit (без входа, 10.2026). */
export const STASH_DEFAULT_WINDOWS: readonly BudgetWindow[] = [
  { hits: 30, periodSec: 60 },
  { hits: 90, periodSec: 1800 },
  { hits: 180, periodSec: 7200 }
]

/** Доля окна, которую фон оставляет свободной (сайт в браузере, другие инструменты). */
export const STASH_RESERVE = 0.25
export const MIN_AUTO_INTERVAL_MIN = 15
export const MAX_AUTO_INTERVAL_MIN = 60
/** по макету: «раз в 15 минут, пока открыт POETH» (фактически — не чаще лимита сайта) */
export const DEFAULT_AUTO_INTERVAL_MIN = 15

/**
 * Минимальный интервал авто-снимков (мин), чтобы `requests` запросов на снимок укладывались
 * в длинные окна лимита с резервом: за период окна снимков ≤ period / interval, значит
 * interval ≥ requests · period / capacity. Короткие окна (меньше интервала) снимок просто
 * растягивают — их учитывает очередь шлюза.
 */
export function minAutoIntervalMin(requests: number, windows: readonly BudgetWindow[] = STASH_DEFAULT_WINDOWS): number {
  let min = MIN_AUTO_INTERVAL_MIN
  if (requests <= 0) return min
  for (const w of windows) {
    const cap = Math.floor(w.hits * (1 - STASH_RESERVE))
    if (cap <= 0) continue
    const periodMin = w.periodSec / 60
    if (periodMin <= MIN_AUTO_INTERVAL_MIN) continue
    min = Math.max(min, Math.ceil((requests * periodMin) / cap))
  }
  return min
}

/** Не чаще раза в минуту (кнопка «Обновить», границы карт). */
export const MIN_SNAPSHOT_SPACING_MS = 60_000

/**
 * Минимальный промежуток между снимками (мс), чтобы `requests` запросов на снимок выдерживали
 * все окна лимита с резервом: requests · period / capacity. Для снимков на границах карт (S11b) —
 * без пола авто-снимков: 5 вкладок ≈ 4,5 мин, 25 ≈ 22 мин.
 */
export function minSnapshotSpacingMs(requests: number, windows: readonly BudgetWindow[] = STASH_DEFAULT_WINDOWS): number {
  let ms = MIN_SNAPSHOT_SPACING_MS
  for (const w of windows) {
    const cap = Math.floor(w.hits * (1 - STASH_RESERVE))
    if (cap <= 0 || requests <= 0) continue
    ms = Math.max(ms, Math.ceil((requests * w.periodSec * 1000) / cap))
  }
  return ms
}

/** Фактический интервал: желаемый пользователем, но не меньше лимита сайта и в пределах 15–60 мин. */
export function effectiveAutoIntervalMin(wanted: number, requests: number, windows?: readonly BudgetWindow[]): number {
  const w = Number.isFinite(wanted) ? Math.round(wanted) : DEFAULT_AUTO_INTERVAL_MIN
  const clamped = Math.min(MAX_AUTO_INTERVAL_MIN, Math.max(MIN_AUTO_INTERVAL_MIN, w))
  return Math.max(clamped, minAutoIntervalMin(requests, windows))
}
