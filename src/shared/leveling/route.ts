// Маршрут прокачки PoE1 (S14): вариант маршрута → плоский список шагов с зоной после каждого шага;
// прогресс по входу в зону, ручные галочки, ◀ ▶, «перейти к шагу», счётчики «не пропустить».
// Зона после шага считается как в exile-leveling (common/src/route-processing, MIT): {enter} и путевой
// камень ведут в зону, {logout} и {ascend} — в последний город, портал — туда-обратно.

import type {
  LevelingData,
  LevelingProgress,
  LevelingVariant,
  LvFrag,
  LvPart,
  LvStep,
  LvTag
} from '../types/leveling'

export const START_AREA = '1_1_1'
const START_TOWN = '1_1_town'
/** Как далеко вперёд ищем шаг, ведущий в зону, куда вошёл игрок (дальше — «не по маршруту»). */
export const LOOKAHEAD = 12

export const DEFAULT_VARIANT: LevelingVariant = { leagueStart: true, bandit: 'kill' }

export interface FlatStep {
  step: LvStep
  act: number
  /** номер в плоском списке */
  index: number
  /** номер в акте (с 1) и шагов в акте — для «шаг 3 из 12» */
  actIndex: number
  actTotal: number
  /** где игрок после шага */
  after: string
  /** зона, в которую шаг переводит (вход, путевой камень, logout, портал); null — шаг на месте */
  to: string | null
}

const isFrag = (p: LvPart): p is LvFrag => typeof p === 'object' && 'k' in p

/** Определения варианта для условий шагов (#ifdef в маршруте). */
export function definitions(v: LevelingVariant): Set<string> {
  const d = new Set<string>()
  if (v.leagueStart) d.add('LEAGUE_START')
  d.add({ kill: 'BANDIT_KILL', alira: 'BANDIT_ALIRA', kraityn: 'BANDIT_KRAITYN', oak: 'BANDIT_OAK' }[v.bandit])
  return d
}

export function stepEnabled(step: LvStep, defs: Set<string>): boolean {
  return (step.cond ?? []).every((c) => (c.startsWith('!') ? !defs.has(c.slice(1)) : defs.has(c)))
}

/** Плоский маршрут варианта с зоной после каждого шага. */
export function flattenRoute(data: LevelingData, variant: LevelingVariant): FlatStep[] {
  const defs = definitions(variant)
  const out: FlatStep[] = []
  let cur = START_AREA
  let lastTown = START_TOWN
  let portal: string | null = null
  const go = (a: string): void => {
    cur = a
    if (data.areas[a]?.town) lastTown = a
  }
  for (const section of data.sections) {
    const steps = section.steps.filter((s) => stepEnabled(s, defs))
    steps.forEach((step, i) => {
      const before = cur
      for (const p of step.parts) {
        if (!isFrag(p)) continue
        if (p.k === 'enter' || p.k === 'wp') go(p.a)
        else if (p.k === 'logout' || p.k === 'ascend') {
          go(lastTown)
          portal = null
        } else if (p.k === 'portal') {
          if (p.v === 'set') portal = cur
          else {
            const here = data.areas[cur]
            if (portal === null && !here?.town) portal = cur
            if (portal !== null && cur === portal && here?.townId) go(here.townId)
            else if (portal !== null && cur === data.areas[portal]?.townId) {
              go(portal)
              portal = null
            }
          }
        }
      }
      out.push({ step, act: section.act, index: out.length, actIndex: i + 1, actTotal: steps.length, after: cur, to: cur !== before ? cur : null })
    })
  }
  return out
}

export function emptyProgress(variant: LevelingVariant = DEFAULT_VARIANT, now = Date.now()): LevelingProgress {
  return { done: {}, current: null, level: 1, areaId: null, variant: { ...variant }, updatedAt: now }
}

/** Номер текущего шага: сохранённый, иначе первый неотмеченный; -1 — маршрут пройден. */
export function currentIndex(flat: FlatStep[], prog: LevelingProgress): number {
  if (prog.current) {
    const i = flat.findIndex((f) => f.step.id === prog.current)
    if (i >= 0) return i
  }
  return flat.findIndex((f) => !prog.done[f.step.id])
}

/** Пройдено всё до `index` (не включая), дальше — нет; текущий — `index`. */
export function jumpTo(flat: FlatStep[], prog: LevelingProgress, index: number, now: number): LevelingProgress {
  const done: Record<string, number> = {}
  const i = Math.max(0, Math.min(index, flat.length))
  for (const f of flat.slice(0, i)) done[f.step.id] = prog.done[f.step.id] ?? now
  return { ...prog, done, current: flat[i]?.step.id ?? null, updatedAt: now }
}

/** ▶ — текущий шаг пройден, дальше следующий. */
export function next(flat: FlatStep[], prog: LevelingProgress, now: number): LevelingProgress {
  const i = currentIndex(flat, prog)
  if (i < 0) return prog
  const done = { ...prog.done, [flat[i].step.id]: now }
  const n = flat.findIndex((f, j) => j > i && !done[f.step.id])
  return { ...prog, done, current: n >= 0 ? flat[n].step.id : null, updatedAt: now }
}

/** ◀ — вернуться на предыдущий шаг (он снова не пройден). */
export function prev(flat: FlatStep[], prog: LevelingProgress, now: number): LevelingProgress {
  const i = currentIndex(flat, prog)
  const p = (i < 0 ? flat.length : i) - 1
  if (p < 0) return prog
  const done = { ...prog.done }
  delete done[flat[p].step.id]
  return { ...prog, done, current: flat[p].step.id, updatedAt: now }
}

/** Ручная галочка: отметить/снять шаг; текущим становится первый неотмеченный. */
export function toggle(flat: FlatStep[], prog: LevelingProgress, stepId: string, now: number): LevelingProgress {
  const done = { ...prog.done }
  if (done[stepId]) delete done[stepId]
  else done[stepId] = now
  const n = flat.findIndex((f) => !done[f.step.id])
  return { ...prog, done, current: n >= 0 ? flat[n].step.id : null, updatedAt: now }
}

export interface ZoneResult {
  progress: LevelingProgress
  /** шаг сменился сам */
  advanced: boolean
  /** игрок в зоне другого шага: номер шага, куда «перейти» */
  offRoute: number | null
}

/**
 * Вход в зону. Шаг впереди (до LOOKAHEAD), ведущий в эту зону, → он и все до него пройдены, текущий —
 * следующий за ним. Город, убежище и текущая зона маршрута — без изменений. Иначе — «не по маршруту»:
 * ближайший шаг этой зоны (сначала впереди, потом позади).
 */
export function enterZone(flat: FlatStep[], prog: LevelingProgress, areaId: string, now: number): ZoneResult {
  const progress = { ...prog, areaId, updatedAt: now }
  const i = currentIndex(flat, prog)
  if (i < 0) return { progress, advanced: false, offRoute: null }
  // повторный вход в зону, где игрок и так по маршруту (портал, смерть), и убежище — без изменений
  const here = i > 0 ? flat[i - 1].after : START_AREA
  if (areaId === here || /^Hideout/.test(areaId)) return { progress, advanced: false, offRoute: null }
  // город — только если маршрут ведёт туда следующим переходом (иначе игрок зашёл продать лут)
  const townLike = /_town$/.test(areaId)
  for (let j = i; j < Math.min(flat.length, i + LOOKAHEAD); j++) {
    if (townLike && flat[j].to !== null && flat[j].to !== areaId) break
    if (flat[j].to === areaId) {
      const moved = jumpTo(flat, progress, j + 1, now)
      return { progress: moved, advanced: true, offRoute: null }
    }
  }
  const ahead = flat.findIndex((f, j) => j >= i + LOOKAHEAD && f.to === areaId)
  let behind = -1
  for (let j = i - 1; j >= 0; j--) {
    if (flat[j].to === areaId) {
      behind = j
      break
    }
  }
  const target = ahead >= 0 ? ahead + 1 : behind >= 0 ? behind + 1 : -1
  // в городе, который ещё встретится по маршруту, — не тревожим: игрок просто зашёл за покупками
  const town = !!flat.find((f) => f.after === areaId) && /_town$/.test(areaId)
  return { progress, advanced: false, offRoute: target >= 0 && !town ? Math.min(target, flat.length - 1) : null }
}

export interface Counters {
  passives: { done: number; total: number }
  trials: { done: number; total: number }
  /** по актам: пройдено / всего шагов */
  acts: Record<number, { done: number; total: number }>
}

/** «Не пропустить за кампанию»: очки пассивов с квестов, испытания восхождения, шаги актов. */
export function counters(flat: FlatStep[], prog: LevelingProgress, data: LevelingData): Counters {
  const out: Counters = { passives: { done: 0, total: 0 }, trials: { done: 0, total: 0 }, acts: {} }
  const defs = definitions(prog.variant)
  // квест в маршруте может сдаваться дважды (награда после второго разговора) — очки считаем один раз
  const counted = new Set<string>()
  for (const f of flat) {
    const done = !!prog.done[f.step.id]
    const a = (out.acts[f.act] = out.acts[f.act] ?? { done: 0, total: 0 })
    a.total += 1
    if (done) a.done += 1
    for (const p of f.step.parts) {
      if (!isFrag(p)) continue
      if (p.k === 'quest') {
        const q = data.quests[p.q]
        if (counted.has(p.q)) continue
        const n = q?.passives && (!q.passivesIf || defs.has(q.passivesIf)) ? q.passives : 0
        if (n) counted.add(p.q)
        out.passives.total += n
        if (done) out.passives.done += n
      }
      if (p.k === 'trial' && f.act <= 3) {
        // 6 испытаний для Лабиринта Правителя — в актах 1–3; дальше — для жестокого и безжалостного
        out.trials.total += 1
        if (done) out.trials.done += 1
      }
    }
  }
  return out
}

/** Очки пассивов за квесты шага — для тега «+N пассива» («Конец голода» даёт 2). */
export function stepPassives(step: LvStep, data: LevelingData): number {
  let n = 0
  for (const p of step.parts) {
    if (!isFrag(p) || p.k !== 'quest') continue
    const q = data.quests[p.q]
    if (q?.passives && (!q.passivesIf || step.cond?.includes(q.passivesIf))) n += q.passives
  }
  return n
}

/** Очки за бандитов во 2 акте: только если убить всех (BANDIT_KILL) — «23 с квестов + 1». */
export function banditPassives(data: LevelingData): number {
  let n = 0
  for (const q of Object.values(data.quests)) if (q.passivesIf) n += q.passives ?? 0
  return n
}

/** Пункты «не пропустите» шага (теги в порядке важности). */
export function stepTags(step: LvStep): LvTag[] {
  const order: LvTag[] = ['passive', 'trial', 'flask', 'gem']
  return order.filter((t) => step.tags?.includes(t))
}
