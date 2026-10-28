// Разбор и проверка resources/data/poe1/advisor/strategies.json (чистый модуль; tests/advisor/data.test.ts).
// Файл приходит и через канал обновления данных (S12), поэтому всё проверяем: битая стратегия
// отбрасывается целиком (и считается в invalid), остальные работают. Формат — docs/advisor.md.

import type {
  AdvisorBuildNeeds,
  AdvisorData,
  AdvisorGlossaryTerm,
  AdvisorItemKind,
  AdvisorItemRef,
  AdvisorLevel,
  AdvisorLine,
  AdvisorStrategy,
  AdvisorText
} from '../types/advisor'

export const ADVISOR_DATA_VERSION = 1
/** Путь файла внутри данных игры (resources/data/poe1, userData/data/poe1). */
export const ADVISOR_DATA_FILE = 'advisor/strategies.json'
/** Время карты по умолчанию, если в данных нет. */
export const DEFAULT_MINUTES_PER_MAP = 5

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const DATE = /^\d{4}-\d{2}(-\d{2})?$/
const KINDS: readonly AdvisorItemKind[] = ['stackable', 'card', 'map', 'unique', 'gem']
const MAX_TEXT = 600
const MAX_LIST = 24

export interface AdvisorParseResult {
  /** null — не наш формат или версия новее (ждём обновления приложения) */
  data: AdvisorData | null
  /** стратегий отброшено */
  invalid: number
  /** что не так (для лога, по-русски) */
  errors: string[]
}

class Bad extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function str(v: unknown, what: string, max = MAX_TEXT): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Bad(what)
  return v.trim()
}

function text(v: unknown, what: string): AdvisorText {
  if (!isObj(v)) throw new Bad(what)
  return { ru: str(v.ru, `${what}.ru`), en: str(v.en, `${what}.en`) }
}

function optText(v: unknown, what: string): AdvisorText | undefined {
  return v === undefined ? undefined : text(v, what)
}

function texts(v: unknown, what: string, min = 0): AdvisorText[] {
  if (v === undefined && min === 0) return []
  if (!Array.isArray(v) || v.length < min || v.length > MAX_LIST) throw new Bad(what)
  return v.map((x, i) => text(x, `${what}[${i}]`))
}

function level(v: unknown, what: string): AdvisorLevel {
  if (v !== 1 && v !== 2 && v !== 3) throw new Bad(what)
  return v
}

function posNum(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Bad(what)
  return v
}

function optInt(v: unknown, what: string, min: number, max: number): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Bad(what)
  return v
}

function item(v: unknown, what: string): AdvisorItemRef {
  if (!isObj(v)) throw new Bad(what)
  const kind = v.kind === undefined ? 'stackable' : v.kind
  if (!KINDS.includes(kind as AdvisorItemKind)) throw new Bad(`${what}.kind`)
  const out: AdvisorItemRef = { kind: kind as AdvisorItemKind }
  if (v.name !== undefined) out.name = str(v.name, `${what}.name`, 120)
  const label = optText(v.label, `${what}.label`)
  if (label) out.label = label
  if (!out.name && !out.label) throw new Bad(`${what}: нужно name или label`)
  const tier = optInt(v.tier, `${what}.tier`, 1, 17)
  if (tier !== undefined) out.tier = tier
  const lvl = optInt(v.level, `${what}.level`, 1, 21)
  if (lvl !== undefined) out.level = lvl
  const q = optInt(v.quality, `${what}.quality`, 0, 23)
  if (q !== undefined) out.quality = q
  return out
}

function lines(v: unknown, what: string, min: number): AdvisorLine[] {
  if (!Array.isArray(v) || v.length < min || v.length > MAX_LIST) throw new Bad(what)
  return v.map((x, i) => {
    const w = `${what}[${i}]`
    if (!isObj(x)) throw new Bad(w)
    const line: AdvisorLine = { item: item(x.item, `${w}.item`), qty: posNum(x.qty, `${w}.qty`) }
    if (x.own === true) line.own = true
    const note = optText(x.note, `${w}.note`)
    if (note) line.note = note
    return line
  })
}

function build(v: unknown, what: string): AdvisorBuildNeeds {
  if (!isObj(v)) throw new Bad(what)
  const out: AdvisorBuildNeeds = {
    damage: level(v.damage, `${what}.damage`),
    survival: level(v.survival, `${what}.survival`),
    speed: level(v.speed, `${what}.speed`)
  }
  const note = optText(v.note, `${what}.note`)
  if (note) out.note = note
  return out
}

function keys(v: unknown, what: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > MAX_LIST) throw new Bad(what)
  return v.map((k, i) => {
    if (typeof k !== 'string' || !ID.test(k)) throw new Bad(`${what}[${i}]`)
    return k
  })
}

function strategy(v: unknown, defaults: { minutesPerMap: number; draft: boolean; patch: string }): AdvisorStrategy {
  if (!isObj(v)) throw new Bad('не объект')
  if (typeof v.id !== 'string' || !ID.test(v.id)) throw new Bad('id')
  const source = isObj(v.source) ? v.source : null
  if (!source || typeof source.date !== 'string' || !DATE.test(source.date)) throw new Bad('source.date')
  const minutes = v.minutesPerMap === undefined ? defaults.minutesPerMap : posNum(v.minutesPerMap, 'minutesPerMap')
  return {
    id: v.id,
    name: text(v.name, 'name'),
    summary: text(v.summary, 'summary'),
    why: text(v.why, 'why'),
    difficulty: level(v.difficulty, 'difficulty'),
    build: build(v.build, 'build'),
    tags: keys(v.tags, 'tags'),
    terms: keys(v.terms, 'terms'),
    minutesPerMap: minutes,
    inputs: lines(v.inputs, 'inputs', 0),
    outputs: lines(v.outputs, 'outputs', 1),
    source: { text: text(source.text, 'source.text'), date: source.date },
    atlas: texts(v.atlas, 'atlas'),
    steps: texts(v.steps, 'steps', 1),
    warnings: texts(v.warnings, 'warnings'),
    draft: v.draft === undefined ? defaults.draft : v.draft === true,
    patch: v.patch === undefined ? defaults.patch : str(v.patch, 'patch', 16)
  }
}

function glossary(v: unknown, errors: string[]): Record<string, AdvisorGlossaryTerm> {
  const out: Record<string, AdvisorGlossaryTerm> = {}
  if (!isObj(v)) return out
  for (const [k, x] of Object.entries(v)) {
    try {
      if (!ID.test(k) || !isObj(x)) throw new Bad('формат')
      out[k] = { term: text(x.term, 'term'), tip: text(x.tip, 'tip') }
    } catch (e) {
      errors.push(`термин «${k}»: ${e instanceof Bad ? e.message : 'ошибка'}`)
    }
  }
  return out
}

/** JSON файла → проверенные данные; битые стратегии и термины отбрасываются по одной. */
export function parseAdvisorData(raw: unknown): AdvisorParseResult {
  const errors: string[] = []
  if (!isObj(raw) || raw.version !== ADVISOR_DATA_VERSION || !Array.isArray(raw.strategies)) {
    return { data: null, invalid: 0, errors: ['не файл стратегий или версия новее приложения'] }
  }
  const draft = raw.draft === true
  const patch = typeof raw.patch === 'string' && raw.patch.trim() ? raw.patch.trim().slice(0, 16) : '?'
  const minutes = isObj(raw.defaults) ? raw.defaults.minutesPerMap : undefined
  const defaults = {
    minutesPerMap: typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES_PER_MAP
  }
  const data: AdvisorData = {
    version: ADVISOR_DATA_VERSION,
    patch,
    updatedAt: typeof raw.updatedAt === 'string' && DATE.test(raw.updatedAt) ? raw.updatedAt : '',
    draft,
    defaults,
    glossary: glossary(raw.glossary, errors),
    strategies: []
  }
  let invalid = 0
  const seen = new Set<string>()
  raw.strategies.forEach((s, i) => {
    const id = isObj(s) && typeof s.id === 'string' ? s.id : `#${i}`
    try {
      const st = strategy(s, { ...defaults, draft, patch })
      if (seen.has(st.id)) throw new Bad('id повторяется')
      seen.add(st.id)
      data.strategies.push(st)
    } catch (e) {
      invalid++
      errors.push(`стратегия «${id}»: ${e instanceof Bad ? e.message : 'ошибка'}`)
    }
  })
  return { data, invalid, errors }
}

/** Текст на языке интерфейса (английский — запасной). */
export function tx(t: AdvisorText, lang: string): string {
  return lang === 'ru' ? t.ru : t.en
}
