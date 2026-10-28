// Черновик редактора стратегии (S17; чистый модуль, tests/advisor/draft.test.ts): форма мастера из шести шагов
// ↔ стратегия схемы 1. Черновик хранит то, что ввёл игрок (количества строкой «0,5», тексты на выбранных
// языках), сохраняется сам (main, userData) и превращается в стратегию только при «Сохранить»: ошибки
// собираются по шагам (шаг мастера помечается красным), последнее слово — за validateStrategy.
// Добыча «из моих сессий фарма»: трекер карт не даёт разбивки по предметам, поэтому из сессий берётся только
// замер (карты, часы, доход в час) и время карты; строки добычи игрок пишет сам.

import type {
  AdvisorItemKind,
  AdvisorLevel,
  AdvisorLine,
  AdvisorMeasured,
  AdvisorMyResult,
  AdvisorStrategy,
  AdvisorText
} from '../types/advisor'
import type { FarmSessionSummary } from '../types/farm'
import { measuredFrom, MIN_MAPS } from './time'
import { LIMITS, validateStrategy } from './validate'

export const DRAFT_VERSION = 1
export type DraftLang = 'ru' | 'en'
/** Механики (теги стратегии и чипы фильтра). */
export const MECHANICS = ['essence', 'strongbox', 'expedition', 'harvest', 'delirium', 'abyss'] as const
export type Mechanic = (typeof MECHANICS)[number]

export interface DraftLine {
  /** ключ строки для списка */
  key: string
  kind: AdvisorItemKind
  /** английское имя предмета (ref); нет — подпись без цены */
  ref?: string
  /** русское имя для показа (из поиска) */
  ru?: string
  /** подпись без предмета («Своя карта», «Прочая добыча») */
  label?: AdvisorText
  own?: boolean
  /** как ввёл игрок: «1», «0,5» */
  qty: string
}

export interface AdvisorDraft {
  v: typeof DRAFT_VERSION
  /** своя стратегия, которую правим; null — новая (копия тоже новая) */
  editId: string | null
  langs: DraftLang[]
  name: AdvisorText
  summary: AdvisorText
  why: AdvisorText
  tags: string[]
  inputs: DraftLine[]
  outFrom: 'sessions' | 'manual'
  /** id выбранных сессий фарма */
  sessions: string[]
  /** замер по выбранным сессиям */
  measured: AdvisorMeasured | null
  outputs: DraftLine[]
  /** минут на карту строкой */
  minutes: string
  steps: AdvisorText[]
  atlas: AdvisorText[]
  atlasTree: string
  warning: AdvisorText
  difficulty: 0 | AdvisorLevel
  build: { damage: 0 | AdvisorLevel; survival: 0 | AdvisorLevel; speed: 0 | AdvisorLevel; note: AdvisorText }
}

/** Ключ строки: монотонный счётчик (уникален в пределах окна). */
let seq = 0
export const lineKey = (): string => `l${Date.now().toString(36)}${(seq++).toString(36)}`

/** Подпись «Своя карта» — вход без цены. */
export const OWN_MAP_LABEL: AdvisorText = { ru: 'Своя карта T14–16', en: 'Own map T14–16' }

export function emptyDraft(lang: DraftLang): AdvisorDraft {
  return {
    v: DRAFT_VERSION,
    editId: null,
    langs: [lang],
    name: {},
    summary: {},
    why: {},
    tags: [],
    inputs: [{ key: lineKey(), kind: 'map', label: { ...OWN_MAP_LABEL }, own: true, qty: '1' }],
    outFrom: 'manual',
    sessions: [],
    measured: null,
    outputs: [],
    minutes: '5',
    steps: [{}],
    atlas: [],
    atlasTree: '',
    warning: {},
    difficulty: 0,
    build: { damage: 0, survival: 0, speed: 0, note: {} }
  }
}

const qtyStr = (n: number): string => String(Math.round(n * 1000) / 1000)

function lineToDraft(l: AdvisorLine): DraftLine {
  const out: DraftLine = { key: lineKey(), kind: l.item.kind, qty: qtyStr(l.qty) }
  if (l.item.ref) out.ref = l.item.ref
  if (l.item.label) out.label = { ...l.item.label }
  if (l.own) out.own = true
  return out
}

/** Стратегия → черновик («Изменить» свою: editId; «Копия» нашей или из каталога: null). */
export function draftFromStrategy(s: AdvisorStrategy, editId: string | null): AdvisorDraft {
  const langs: DraftLang[] = []
  if (s.name.ru) langs.push('ru')
  if (s.name.en) langs.push('en')
  return {
    v: DRAFT_VERSION,
    editId,
    langs: langs.length ? langs : ['ru'],
    name: { ...s.name },
    summary: { ...s.summary },
    why: { ...s.why },
    tags: s.tags.filter((t) => (MECHANICS as readonly string[]).includes(t)),
    inputs: s.inputs.map(lineToDraft),
    // замер своей сохраняется (это её числа); у копии чужой стратегии его нет (copyAsMine)
    outFrom: 'manual',
    sessions: [],
    measured: editId && s.measured ? { ...s.measured } : null,
    outputs: s.outputs.map(lineToDraft),
    minutes: qtyStr(s.minutesPerMap),
    steps: s.steps.length ? s.steps.map((t) => ({ ...t })) : [{}],
    atlas: s.atlas.map((t) => ({ ...t })),
    atlasTree: s.atlasTree ?? '',
    warning: s.warnings[0] ? { ...s.warnings[0] } : {},
    difficulty: s.difficulty,
    build: { damage: s.build.damage, survival: s.build.survival, speed: s.build.speed, note: s.build.note ? { ...s.build.note } : {} }
  }
}

/** Черновик из хранилища: только своей формы, иначе null (старый или битый — начнём заново). */
export function parseDraft(raw: unknown): AdvisorDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Partial<AdvisorDraft>
  if (d.v !== DRAFT_VERSION || !Array.isArray(d.inputs) || !Array.isArray(d.outputs) || !Array.isArray(d.steps) || !Array.isArray(d.langs)) return null
  return raw as AdvisorDraft
}

/** «0,5» / «0.5» / « 2 » → число; не число — null. */
export function parseQty(s: string): number | null {
  const t = String(s ?? '').trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Замер по выбранным сессиям фарма (только сессии с учётом тайника — у остальных нет прибыли). */
export function sessionsResult(list: readonly FarmSessionSummary[]): AdvisorMyResult | null {
  const usable = list.filter((s) => s.stats.profitChaos !== null)
  if (!usable.length) return null
  const maps = usable.reduce((a, s) => a + s.stats.maps, 0)
  const durationMs = usable.reduce((a, s) => a + s.stats.durationMs, 0)
  const profitChaos = usable.reduce((a, s) => a + (s.stats.profitChaos as number), 0)
  return {
    sessions: usable.length,
    maps,
    durationMs,
    profitChaos,
    perHour: durationMs >= 60_000 ? profitChaos / (durationMs / 3_600_000) : null,
    mapMinutes: maps > 0 && durationMs > 0 ? durationMs / maps / 60_000 : null,
    live: false
  }
}

/** Замер и время карты для черновика; null — мало карт (< MIN_MAPS) или нет прибыли. */
export function measureSessions(
  list: readonly FarmSessionSummary[],
  at: { date: string; patch: string }
): { measured: AdvisorMeasured; minutes: number } | null {
  const r = sessionsResult(list)
  if (!r || r.maps < MIN_MAPS || r.mapMinutes === null) return null
  const measured = measuredFrom(r, at)
  return measured ? { measured, minutes: Math.round(r.mapMinutes * 10) / 10 } : null
}

// ---------------------------------------------------------------------------- проверка

export type DraftStep = 1 | 2 | 3 | 4 | 5
export type DraftErrorCode =
  | 'name.required'
  | 'text.long'
  | 'text.unsafe'
  | 'line.qty'
  | 'line.item'
  | 'lines.many'
  | 'outputs.none'
  | 'minutes'
  | 'steps.none'
  | 'steps.many'
  | 'tree.https'
  | 'difficulty'
  | 'build'
  | 'invalid'

export interface DraftError {
  step: DraftStep | 6
  /** поле формы: name.ru, inputs.2, steps.0.en, atlasTree… */
  field: string
  code: DraftErrorCode
  max?: number
  /** для invalid — что сказал валидатор */
  detail?: string
}

const UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i

/** Текст на выбранных языках: пустые поля не попадают; длина и HTML — ошибки шага. */
function text(t: AdvisorText, langs: readonly DraftLang[], step: DraftStep, field: string, max: number, errors: DraftError[]): AdvisorText {
  const out: AdvisorText = {}
  for (const l of langs) {
    const v = (t[l] ?? '').trim()
    if (!v) continue
    if (v.length > max) errors.push({ step, field: `${field}.${l}`, code: 'text.long', max })
    else if (UNSAFE.test(v)) errors.push({ step, field: `${field}.${l}`, code: 'text.unsafe' })
    out[l] = v
  }
  return out
}
const filled = (t: AdvisorText): boolean => !!(t.ru || t.en)

function lines(list: readonly DraftLine[], step: DraftStep, field: string, langs: readonly DraftLang[], max: number, errors: DraftError[], input: boolean): AdvisorLine[] {
  if (list.length > max) errors.push({ step, field, code: 'lines.many', max })
  const out: AdvisorLine[] = []
  list.slice(0, max).forEach((l, i) => {
    const qty = parseQty(l.qty)
    if (qty === null || qty <= 0 || qty > LIMITS.maxQty) errors.push({ step, field: `${field}.${i}`, code: 'line.qty' })
    const label = l.label ? text(l.label, l.label.ru && l.label.en ? ['ru', 'en'] : langs, step, `${field}.${i}.label`, LIMITS.label, errors) : undefined
    if (!l.ref && (!label || !filled(label))) errors.push({ step, field: `${field}.${i}`, code: 'line.item' })
    const item: AdvisorLine['item'] = { kind: l.kind }
    if (l.ref) item.ref = l.ref
    if (label && filled(label)) item.label = label
    const line: AdvisorLine = { item, qty: qty ?? 0 }
    if (input && l.own) line.own = true
    out.push(line)
  })
  return out
}

export interface DraftResult {
  /** готовая стратегия (без ошибок) или null */
  strategy: AdvisorStrategy | null
  /** то, что уйдёт в main (для предпросмотра — и с ошибками) */
  raw: AdvisorStrategy
  errors: DraftError[]
}

/**
 * Черновик → стратегия. id и источник ставит main при сохранении (mine, сегодняшняя дата), здесь —
 * заглушки. Лига — текущая версия данных (patch).
 */
export function draftToStrategy(d: AdvisorDraft, ctx: { patch: string; date: string }): DraftResult {
  const errors: DraftError[] = []
  const langs = d.langs.length ? d.langs : (['ru'] as DraftLang[])
  const name = text(d.name, langs, 1, 'name', LIMITS.name, errors)
  if (!filled(name)) errors.push({ step: 1, field: `name.${langs[0]}`, code: 'name.required' })
  const summary = text(d.summary, langs, 1, 'summary', LIMITS.summary, errors)
  if (!filled(summary)) errors.push({ step: 1, field: `summary.${langs[0]}`, code: 'name.required' })
  const why = text(d.why, langs, 1, 'why', LIMITS.why, errors)
  if (!filled(why)) errors.push({ step: 1, field: `why.${langs[0]}`, code: 'name.required' })

  const inputs = lines(d.inputs, 2, 'inputs', langs, LIMITS.inputs, errors, true)
  const outputs = lines(d.outputs, 3, 'outputs', langs, LIMITS.outputs, errors, false)
  if (!outputs.length) errors.push({ step: 3, field: 'outputs', code: 'outputs.none' })
  const minutes = parseQty(d.minutes)
  if (minutes === null || minutes < 0.5 || minutes > 120) errors.push({ step: 3, field: 'minutes', code: 'minutes' })

  const steps = d.steps.map((t, i) => text(t, langs, 4, `steps.${i}`, LIMITS.step, errors)).filter(filled)
  if (!steps.length) errors.push({ step: 4, field: 'steps.0', code: 'steps.none' })
  if (steps.length > LIMITS.steps) errors.push({ step: 4, field: 'steps', code: 'steps.many', max: LIMITS.steps })
  const atlas = d.atlas.map((t, i) => text(t, langs, 4, `atlas.${i}`, LIMITS.atlas, errors)).filter(filled).slice(0, LIMITS.atlasItems)
  const tree = d.atlasTree.trim()
  if (tree) {
    let ok = false
    try {
      const u = new URL(tree)
      ok = u.protocol === 'https:' && !u.username && !u.password && tree.length <= LIMITS.url
    } catch {
      ok = false
    }
    if (!ok) errors.push({ step: 4, field: 'atlasTree', code: 'tree.https' })
  }
  const warning = text(d.warning, langs, 4, 'warning', LIMITS.warning, errors)

  if (!d.difficulty) errors.push({ step: 5, field: 'difficulty', code: 'difficulty' })
  if (!d.build.damage || !d.build.survival || !d.build.speed) errors.push({ step: 5, field: 'build', code: 'build' })
  const note = text(d.build.note, langs, 5, 'build.note', LIMITS.buildNote, errors)

  const raw: AdvisorStrategy = {
    id: d.editId ?? 'my-strategy',
    name,
    summary,
    why,
    difficulty: (d.difficulty || 1) as AdvisorLevel,
    build: { damage: (d.build.damage || 1) as AdvisorLevel, survival: (d.build.survival || 1) as AdvisorLevel, speed: (d.build.speed || 1) as AdvisorLevel },
    tags: d.tags.filter((t) => (MECHANICS as readonly string[]).includes(t)).slice(0, LIMITS.tags),
    terms: [],
    minutesPerMap: minutes !== null && minutes >= 0.5 && minutes <= 120 ? minutes : 5,
    inputs,
    outputs,
    source: { kind: 'mine', date: ctx.date },
    atlas,
    steps: steps.slice(0, LIMITS.steps),
    warnings: filled(warning) ? [warning] : [],
    draft: false,
    patch: ctx.patch
  }
  if (filled(note)) raw.build.note = note
  if (d.outFrom === 'sessions' && d.measured) raw.measured = d.measured
  if (tree && !errors.some((e) => e.field === 'atlasTree')) raw.atlasTree = tree

  if (!errors.length) {
    const res = validateStrategy(JSON.parse(JSON.stringify(raw)))
    if (res.ok) return { strategy: res.strategy, raw, errors }
    errors.push({ step: 6, field: '', code: 'invalid', detail: res.error })
  }
  return { strategy: null, raw, errors }
}

/** Состояние шага мастера: error — есть ошибки; done — заполнен. */
export function stepHasErrors(errors: readonly DraftError[], step: number): boolean {
  return errors.some((e) => e.step === step)
}
