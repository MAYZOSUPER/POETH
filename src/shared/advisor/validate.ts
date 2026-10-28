// Строгая проверка одной стратегии (чистый модуль; tests/advisor/validate.test.ts). Ей же пройдёт импорт
// чужой стратегии в S17 (код `POETH1:…`, каталог) — это недоверенные данные, поэтому:
//  - неизвестные поля на любом уровне — ошибка (новые поля = новая версия схемы);
//  - только простой текст: без HTML-тегов, управляющих символов и символов смены направления текста;
//  - лимиты длины текстов и числа предметов, шагов, тегов;
//  - ссылка — только https (wealthy — только wealthyexile.com), автор — ник, без аккаунта и персонажа;
//  - числа конечные и в разумных пределах.
// Цены в стратегии не хранятся — поле цены будет неизвестным полем.

import type {
  AdvisorBuildNeeds,
  AdvisorItemKind,
  AdvisorItemRef,
  AdvisorLevel,
  AdvisorLine,
  AdvisorMeasured,
  AdvisorSource,
  AdvisorSourceKind,
  AdvisorStrategy,
  AdvisorText
} from '../types/advisor'

export const STRATEGY_ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const DATE = /^\d{4}-\d{2}(-\d{2})?$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const PATCH = /^\d{1,2}\.\d{1,2}(\.\d{1,2})?$/
/** refName предмета: буквы любого алфавита (Mjölner), цифры, пробел и ' , . : - ( ) */
const REF = /^[\p{L}\p{N}][\p{L}\p{N}' ,.:\-()]*$/u
const KINDS: readonly AdvisorItemKind[] = ['stackable', 'card', 'map', 'unique', 'gem']
const SOURCES: readonly AdvisorSourceKind[] = ['official', 'community', 'imported', 'wealthy']
const WEALTHY_HOSTS = ['wealthyexile.com', 'www.wealthyexile.com']

/** Лимиты (символов и штук). */
export const LIMITS = {
  name: 60,
  summary: 200,
  why: 600,
  step: 300,
  atlas: 200,
  warning: 300,
  note: 120,
  label: 60,
  buildNote: 200,
  sourceNote: 300,
  author: 40,
  url: 300,
  league: 40,
  ref: 100,
  inputs: 12,
  outputs: 20,
  steps: 12,
  atlasItems: 8,
  warnings: 6,
  tags: 8,
  terms: 12,
  maxQty: 10_000
} as const

/** HTML-тег, управляющие символы (кроме перевода строки и табуляции), смена направления текста. */
const UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i

class Bad extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Объект только с разрешёнными полями. */
function obj(v: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!isObj(v)) throw new Bad(`${what}: не объект`)
  const extra = Object.keys(v).filter((k) => !allowed.includes(k))
  if (extra.length) throw new Bad(`${what}: неизвестные поля ${extra.join(', ')}`)
  return v
}

/** Простой текст: непустой, не длиннее max, без HTML и управляющих символов. */
export function plain(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string') throw new Bad(`${what}: не текст`)
  const s = v.trim()
  if (!s) throw new Bad(`${what}: пусто`)
  if (s.length > max) throw new Bad(`${what}: длиннее ${max}`)
  if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`)
  return s
}

function text(v: unknown, what: string, max: number): AdvisorText {
  const o = obj(v, what, ['ru', 'en'])
  const out: AdvisorText = {}
  if (o.ru !== undefined) out.ru = plain(o.ru, `${what}.ru`, max)
  if (o.en !== undefined) out.en = plain(o.en, `${what}.en`, max)
  if (!out.ru && !out.en) throw new Bad(`${what}: нужен текст хотя бы на одном языке`)
  return out
}

const optText = (v: unknown, what: string, max: number): AdvisorText | undefined =>
  v === undefined ? undefined : text(v, what, max)

function texts(v: unknown, what: string, max: number, maxItems: number, min = 0): AdvisorText[] {
  if (v === undefined && min === 0) return []
  if (!Array.isArray(v) || v.length < min || v.length > maxItems) throw new Bad(`${what}: от ${min} до ${maxItems}`)
  return v.map((x, i) => text(x, `${what}[${i}]`, max))
}

function level(v: unknown, what: string): AdvisorLevel {
  if (v !== 1 && v !== 2 && v !== 3) throw new Bad(`${what}: 1, 2 или 3`)
  return v
}

function num(v: unknown, what: string, min: number, max: number, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
    throw new Bad(`${what}: число ${min}…${max}`)
  }
  return v
}

const optInt = (v: unknown, what: string, min: number, max: number): number | undefined =>
  v === undefined ? undefined : num(v, what, min, max, true)

function date(v: unknown, what: string, re = DATE): string {
  if (typeof v !== 'string' || !re.test(v)) throw new Bad(`${what}: дата`)
  return v
}

function patch(v: unknown, what: string): string {
  if (typeof v !== 'string' || !PATCH.test(v)) throw new Bad(`${what}: версия игры вида 3.29`)
  return v
}

function keys(v: unknown, what: string, max: number): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max) throw new Bad(`${what}: до ${max}`)
  return v.map((k, i) => {
    if (typeof k !== 'string' || !STRATEGY_ID.test(k)) throw new Bad(`${what}[${i}]`)
    return k
  })
}

function item(v: unknown, what: string): AdvisorItemRef {
  const o = obj(v, what, ['kind', 'ref', 'tier', 'level', 'quality', 'label'])
  const kind = o.kind ?? 'stackable'
  if (!KINDS.includes(kind as AdvisorItemKind)) throw new Bad(`${what}.kind`)
  const out: AdvisorItemRef = { kind: kind as AdvisorItemKind }
  if (o.ref !== undefined) {
    const ref = plain(o.ref, `${what}.ref`, LIMITS.ref)
    if (!REF.test(ref)) throw new Bad(`${what}.ref: английское имя предмета`)
    out.ref = ref
  }
  const label = optText(o.label, `${what}.label`, LIMITS.label)
  if (label) out.label = label
  if (!out.ref && !out.label) throw new Bad(`${what}: нужно ref или label`)
  const tier = optInt(o.tier, `${what}.tier`, 1, 17)
  if (tier !== undefined) out.tier = tier
  const lvl = optInt(o.level, `${what}.level`, 1, 21)
  if (lvl !== undefined) out.level = lvl
  const q = optInt(o.quality, `${what}.quality`, 0, 23)
  if (q !== undefined) out.quality = q
  return out
}

function lines(v: unknown, what: string, min: number, max: number): AdvisorLine[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Bad(`${what}: от ${min} до ${max}`)
  return v.map((x, i) => {
    const w = `${what}[${i}]`
    const o = obj(x, w, ['item', 'qty', 'own', 'note'])
    const line: AdvisorLine = { item: item(o.item, `${w}.item`), qty: num(o.qty, `${w}.qty`, Number.MIN_VALUE, LIMITS.maxQty) }
    if (o.own !== undefined && typeof o.own !== 'boolean') throw new Bad(`${w}.own`)
    if (o.own === true) line.own = true
    const note = optText(o.note, `${w}.note`, LIMITS.note)
    if (note) line.note = note
    return line
  })
}

function build(v: unknown): AdvisorBuildNeeds {
  const o = obj(v, 'build', ['damage', 'survival', 'speed', 'note'])
  const out: AdvisorBuildNeeds = {
    damage: level(o.damage, 'build.damage'),
    survival: level(o.survival, 'build.survival'),
    speed: level(o.speed, 'build.speed')
  }
  const note = optText(o.note, 'build.note', LIMITS.buildNote)
  if (note) out.note = note
  return out
}

/** Ссылка на оригинал: https, у wealthy — только сайт Wealthy Exile. */
export function sourceUrl(v: unknown, kind: AdvisorSourceKind): string {
  const s = plain(v, 'source.url', LIMITS.url)
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw new Bad('source.url: не ссылка')
  }
  if (u.protocol !== 'https:' || u.username || u.password) throw new Bad('source.url: только https')
  if (kind === 'wealthy' && !WEALTHY_HOSTS.includes(u.hostname)) throw new Bad('source.url: не wealthyexile.com')
  return u.toString()
}

function source(v: unknown): AdvisorSource {
  const o = obj(v, 'source', ['kind', 'author', 'url', 'date', 'note'])
  if (!SOURCES.includes(o.kind as AdvisorSourceKind)) throw new Bad('source.kind')
  const kind = o.kind as AdvisorSourceKind
  const out: AdvisorSource = { kind, date: date(o.date, 'source.date') }
  if (o.author !== undefined) out.author = plain(o.author, 'source.author', LIMITS.author)
  if (o.url !== undefined) out.url = sourceUrl(o.url, kind)
  if (kind === 'wealthy' && (!out.url || !out.author)) throw new Bad('source: у wealthy нужны автор и ссылка (атрибуция)')
  const note = optText(o.note, 'source.note', LIMITS.sourceNote)
  if (note) out.note = note
  return out
}

function measured(v: unknown): AdvisorMeasured {
  const o = obj(v, 'measured', ['maps', 'hours', 'perHour', 'date', 'patch', 'league'])
  const out: AdvisorMeasured = {
    maps: num(o.maps, 'measured.maps', 1, 100_000, true),
    hours: num(o.hours, 'measured.hours', 0.01, 10_000),
    perHour: num(o.perHour, 'measured.perHour', -1e6, 1e7),
    date: date(o.date, 'measured.date', DAY)
  }
  if (o.patch !== undefined) out.patch = patch(o.patch, 'measured.patch')
  if (o.league !== undefined) out.league = plain(o.league, 'measured.league', LIMITS.league)
  return out
}

/** Значения по умолчанию из файла данных (у импорта их нет — все поля обязательны). */
export interface StrategyDefaults {
  minutesPerMap?: number
  draft?: boolean
  patch?: string
}

const FIELDS = [
  'id',
  'name',
  'summary',
  'why',
  'difficulty',
  'build',
  'tags',
  'terms',
  'minutesPerMap',
  'inputs',
  'outputs',
  'source',
  'measured',
  'atlas',
  'steps',
  'warnings',
  'draft',
  'patch',
  'league'
]

export type StrategyCheck = { ok: true; strategy: AdvisorStrategy } | { ok: false; error: string }

/** Проверить одну стратегию (свои данные или чужой импорт). Ошибка — по-русски, с путём поля. */
export function validateStrategy(raw: unknown, defaults: StrategyDefaults = {}): StrategyCheck {
  try {
    const o = obj(raw, 'стратегия', FIELDS)
    if (typeof o.id !== 'string' || !STRATEGY_ID.test(o.id)) throw new Bad('id')
    const minutes = o.minutesPerMap ?? defaults.minutesPerMap
    const s: AdvisorStrategy = {
      id: o.id,
      name: text(o.name, 'name', LIMITS.name),
      summary: text(o.summary, 'summary', LIMITS.summary),
      why: text(o.why, 'why', LIMITS.why),
      difficulty: level(o.difficulty, 'difficulty'),
      build: build(o.build),
      tags: keys(o.tags, 'tags', LIMITS.tags),
      terms: keys(o.terms, 'terms', LIMITS.terms),
      minutesPerMap: num(minutes, 'minutesPerMap', 0.5, 120),
      inputs: lines(o.inputs, 'inputs', 0, LIMITS.inputs),
      outputs: lines(o.outputs, 'outputs', 1, LIMITS.outputs),
      source: source(o.source),
      atlas: texts(o.atlas, 'atlas', LIMITS.atlas, LIMITS.atlasItems),
      steps: texts(o.steps, 'steps', LIMITS.step, LIMITS.steps, 1),
      warnings: texts(o.warnings, 'warnings', LIMITS.warning, LIMITS.warnings),
      draft: false,
      patch: patch(o.patch ?? defaults.patch, 'patch')
    }
    const draft = o.draft ?? defaults.draft ?? false
    if (typeof draft !== 'boolean') throw new Bad('draft')
    s.draft = draft
    if (o.measured !== undefined) s.measured = measured(o.measured)
    if (o.league !== undefined) s.league = plain(o.league, 'league', LIMITS.league)
    return { ok: true, strategy: s }
  } catch (e) {
    return { ok: false, error: e instanceof Bad ? e.message : 'ошибка' }
  }
}

/** Термин словаря: только term и tip. */
export function validateTerm(raw: unknown): { term: AdvisorText; tip: AdvisorText } | null {
  try {
    const o = obj(raw, 'термин', ['term', 'tip'])
    return { term: text(o.term, 'term', 40), tip: text(o.tip, 'tip', LIMITS.sourceNote) }
  } catch {
    return null
  }
}
