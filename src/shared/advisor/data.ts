// Разбор resources/data/poe1/advisor/strategies.json (чистый модуль; tests/advisor/data.test.ts).
// Файл приходит и через канал обновления данных (S12): каждую стратегию проверяет строгий валидатор
// (validate.ts), битая отбрасывается одна (в UI — «Пропущено стратегий»), остальные работают.
// Формат — docs/advisor.md.

import { ADVISOR_SCHEMA, type AdvisorData, type AdvisorGlossaryTerm, type AdvisorStrategy, type AdvisorText } from '../types/advisor'
import { STRATEGY_ID, validateStrategy, validateTerm } from './validate'

/** Путь файла внутри данных игры (resources/data/poe1, userData/data/poe1). */
export const ADVISOR_DATA_FILE = 'advisor/strategies.json'
/** Время карты по умолчанию, если в данных нет. */
export const DEFAULT_MINUTES_PER_MAP = 5

const FILE_FIELDS = ['schema', 'patch', 'updatedAt', 'draft', 'defaults', 'glossary', 'strategies']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PATCH = /^\d{1,2}\.\d{1,2}(\.\d{1,2})?$/

export interface AdvisorParseResult {
  /** null — не наш формат или схема новее (ждём обновления приложения) */
  data: AdvisorData | null
  /** стратегий отброшено */
  invalid: number
  /** что не так (для лога, по-русски) */
  errors: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** JSON файла → проверенные данные; битые стратегии и термины отбрасываются по одной. */
export function parseAdvisorData(raw: unknown): AdvisorParseResult {
  const errors: string[] = []
  if (!isObj(raw) || raw.schema !== ADVISOR_SCHEMA || !Array.isArray(raw.strategies)) {
    return { data: null, invalid: 0, errors: ['не файл стратегий или схема новее приложения'] }
  }
  const extra = Object.keys(raw).filter((k) => !FILE_FIELDS.includes(k))
  if (extra.length) errors.push(`файл: неизвестные поля ${extra.join(', ')} (пропущены)`)
  if (typeof raw.patch !== 'string' || !PATCH.test(raw.patch)) {
    return { data: null, invalid: 0, errors: [...errors, 'файл: нет версии игры (patch)'] }
  }
  const draft = raw.draft === true
  const minutes = isObj(raw.defaults) ? raw.defaults.minutesPerMap : undefined
  const defaults = {
    minutesPerMap: typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES_PER_MAP
  }
  const glossary: Record<string, AdvisorGlossaryTerm> = {}
  if (isObj(raw.glossary)) {
    for (const [k, v] of Object.entries(raw.glossary)) {
      const term = STRATEGY_ID.test(k) ? validateTerm(v) : null
      if (term) glossary[k] = term
      else errors.push(`термин «${k}»: ошибка формата`)
    }
  }
  const data: AdvisorData = {
    schema: ADVISOR_SCHEMA,
    patch: raw.patch,
    updatedAt: typeof raw.updatedAt === 'string' && DATE.test(raw.updatedAt) ? raw.updatedAt : '',
    draft,
    defaults,
    glossary,
    strategies: []
  }
  let invalid = 0
  const seen = new Set<string>()
  raw.strategies.forEach((s, i) => {
    const id = isObj(s) && typeof s.id === 'string' ? s.id : `#${i}`
    const res = validateStrategy(s, { ...defaults, draft, patch: data.patch })
    if (res.ok && seen.has(res.strategy.id)) {
      invalid++
      errors.push(`стратегия «${id}»: id повторяется`)
    } else if (res.ok) {
      seen.add(res.strategy.id)
      data.strategies.push(res.strategy)
    } else {
      invalid++
      errors.push(`стратегия «${id}»: ${res.error}`)
    }
  })
  return { data, invalid, errors }
}

/** Текст на языке интерфейса; нет его — на другом (UI помечает «написано на английском»). */
export function tx(t: AdvisorText, lang: string): string {
  const own = lang === 'ru' ? t.ru : t.en
  return own ?? t.ru ?? t.en ?? ''
}

/** Все тексты стратегии (для проверки языка). */
export function strategyTexts(s: AdvisorStrategy): AdvisorText[] {
  const out: AdvisorText[] = [s.name, s.summary, s.why, ...s.atlas, ...s.steps, ...s.warnings]
  if (s.build.note) out.push(s.build.note)
  if (s.source.note) out.push(s.source.note)
  for (const l of [...s.inputs, ...s.outputs]) {
    if (l.item.label) out.push(l.item.label)
    if (l.note) out.push(l.note)
  }
  return out
}

/**
 * На каком языке стратегия написана, если не на языке интерфейса: 'en' / 'ru' — хотя бы один текст
 * только на этом языке; null — всё есть на языке интерфейса.
 */
export function foreignLang(s: AdvisorStrategy, lang: string): 'ru' | 'en' | null {
  const ui = lang === 'ru' ? 'ru' : 'en'
  const other = ui === 'ru' ? 'en' : 'ru'
  return strategyTexts(s).some((t) => !t[ui]) ? other : null
}

/** Стратегия для другой версии игры (атлас меняется) — «может устареть». */
export function isOutdated(s: AdvisorStrategy, currentPatch: string | null | undefined): boolean {
  return !!currentPatch && s.patch !== currentPatch
}
