// Слухи: что игрок выбрал и его пометки (S65; чистый модуль, tests/rumours/marks.test.ts). Хранит main в
// userData/rumours.json (только на этом ПК, в сеть не уходит); файл с диска — недоверенный, поэтому нормализуем.
//
// Пометка игрока — поверх нашей оценки: свой тир ●●● (он и решает «бери»), «не беру» (слух не участвует в выборе)
// и короткая заметка своими словами.

import { RUMOUR_ID, RUMOUR_LIMITS, type RumourLevel } from './schema'
import { RUMOURS_POOL_MAX } from './match'

export interface RumourMark {
  /** свой тир; null — как у POETH */
  tier: RumourLevel | null
  /** «не беру»: слух не участвует в выборе */
  skip: boolean
  /** своя заметка, одна строка; null — нет */
  note: string | null
}

export type RumoursPickedBy = 'manual' | 'item'

export interface RumoursUserState {
  schema: 1
  /** выбранные видимые слухи (id), до RUMOURS_POOL_MAX — 3 видимых и ещё 3 после «переложить предмет» */
  picked: string[]
  /** как выбраны: руками или разбором текста журнала */
  pickedBy: RumoursPickedBy | null
  /** когда выбраны (ISO) */
  pickedAt: string | null
  marks: Record<string, RumourMark>
}

export const RUMOUR_MARKS_MAX = 60

export function emptyRumoursUser(): RumoursUserState {
  return { schema: 1, picked: [], pickedBy: null, pickedAt: null, marks: {} }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Заметка игрока: одна строка простого текста до 140 символов; пустая — null. */
export function cleanMarkNote(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, RUMOUR_LIMITS.note)
    .trim()
  return s || null
}

/** Пометка из окна или с диска; пустая (как у POETH, без «не беру» и заметки) — null: её не храним. */
export function cleanMark(v: unknown): RumourMark | null {
  if (!isObj(v)) return null
  const tier = v.tier === 1 || v.tier === 2 || v.tier === 3 ? v.tier : null
  const skip = v.skip === true
  const note = cleanMarkNote(v.note)
  if (tier === null && !skip && note === null) return null
  return { tier, skip, note }
}

/** Список выбранных: только id слухов, без повторов, до RUMOURS_POOL_MAX. known — какие id есть в данных. */
export function cleanPicked(v: unknown, known?: ReadonlySet<string>): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || !RUMOUR_ID.test(x) || out.includes(x)) continue
    if (known && !known.has(x)) continue
    out.push(x)
    if (out.length >= RUMOURS_POOL_MAX) break
  }
  return out
}

/** Файл с диска → состояние; битое — пустое состояние, а не ошибка. */
export function normalizeRumoursUser(raw: unknown): RumoursUserState {
  const out = emptyRumoursUser()
  if (!isObj(raw)) return out
  out.picked = cleanPicked(raw.picked)
  out.pickedBy = raw.pickedBy === 'manual' || raw.pickedBy === 'item' ? raw.pickedBy : null
  out.pickedAt = typeof raw.pickedAt === 'string' && !Number.isNaN(Date.parse(raw.pickedAt)) ? raw.pickedAt : null
  if (!out.picked.length) {
    out.pickedBy = null
    out.pickedAt = null
  }
  if (isObj(raw.marks)) {
    for (const [id, m] of Object.entries(raw.marks)) {
      if (Object.keys(out.marks).length >= RUMOUR_MARKS_MAX) break
      if (!RUMOUR_ID.test(id)) continue
      const mark = cleanMark(m)
      if (mark) out.marks[id] = mark
    }
  }
  return out
}

/** Поставить или снять пометку; marks не больше RUMOUR_MARKS_MAX (новая пометка сверх лимита не встаёт). */
export function withMark(state: RumoursUserState, id: string, mark: unknown): RumoursUserState {
  if (!RUMOUR_ID.test(id)) return state
  const marks = { ...state.marks }
  const m = cleanMark(mark)
  if (m) {
    if (!(id in marks) && Object.keys(marks).length >= RUMOUR_MARKS_MAX) return state
    marks[id] = m
  } else delete marks[id]
  return { ...state, marks }
}

/** Выбрать видимые слухи (руками или разбором журнала). */
export function withPicked(state: RumoursUserState, ids: unknown, by: RumoursPickedBy, now: Date, known?: ReadonlySet<string>): RumoursUserState {
  const picked = cleanPicked(ids, known)
  return picked.length
    ? { ...state, picked, pickedBy: by, pickedAt: now.toISOString() }
    : { ...state, picked: [], pickedBy: null, pickedAt: null }
}
