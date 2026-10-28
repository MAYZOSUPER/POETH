// Маршрут прокачки PoE1 (S14, S22): вариант маршрута → плоский список шагов с зоной после каждого шага;
// прогресс по входу в зону (вперёд, назад за квестом, обратно к прогрессу), ручные галочки, ◀ ▶,
// «перейти к шагу», счётчики «не пропустить».
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
  return { done: {}, current: null, level: 1, areaId: null, variant: { ...variant }, finished: null, showAnyway: false, updatedAt: now }
}

/** Номер текущего шага: сохранённый, иначе первый неотмеченный; -1 — маршрут пройден. */
export function currentIndex(flat: FlatStep[], prog: LevelingProgress): number {
  if (prog.current) {
    const i = flat.findIndex((f) => f.step.id === prog.current)
    if (i >= 0) return i
  }
  return flat.findIndex((f) => !prog.done[f.step.id])
}

/** Где прогресс: первый непройденный шаг; flat.length — пройдено всё. */
export function progressIndex(flat: FlatStep[], prog: LevelingProgress): number {
  const i = flat.findIndex((f) => !prog.done[f.step.id])
  return i < 0 ? flat.length : i
}

/** Зона, где игрок стоит перед шагом `index` (куда привёл предыдущий шаг). */
export function zoneAt(flat: FlatStep[], index: number): string {
  return index > 0 ? flat[index - 1].after : START_AREA
}

/**
 * Игрок вернулся назад по маршруту (текущий шаг уже пройден, прогресс дальше) → номер шага прогресса,
 * куда «вернуться»; иначе null.
 */
export function returnIndex(flat: FlatStep[], prog: LevelingProgress): number | null {
  const i = currentIndex(flat, prog)
  if (i < 0 || !prog.done[flat[i].step.id]) return null
  const h = progressIndex(flat, prog)
  return h > i && h < flat.length ? h : null
}

/** Акт зоны по id («1_5_3» → 5, «2_7_town» → 7); null — не зона актов. */
export function actOf(areaId: string): number | null {
  const m = /^\d+_(\d+)_/.exec(areaId)
  return m ? Number(m[1]) : null
}

/** Отметить пройденным всё до `index`, текущий — `index`; отметок не снимает (вход в зону). */
export function advanceTo(flat: FlatStep[], prog: LevelingProgress, index: number, now: number): LevelingProgress {
  const done = { ...prog.done }
  const i = Math.max(0, Math.min(index, flat.length))
  for (const f of flat.slice(0, i)) done[f.step.id] = done[f.step.id] ?? now
  return { ...prog, done, current: flat[i]?.step.id ?? null, updatedAt: now }
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

/** Как сдвинулся шаг при входе в зону: вперёд, назад (за квестом), обратно к прогрессу; null — на месте. */
export type ZoneMove = 'forward' | 'back' | 'progress' | null

export interface ZoneResult {
  progress: LevelingProgress
  moved: ZoneMove
}

/**
 * Вход в зону кампании → шаг этой зоны (тот, что идёт после входа в неё по маршруту):
 * - та же зона, где игрок по маршруту, и убежище — без изменений (ручной шаг не сбрасывается);
 * - зона, где прогресс, после похода назад — обратно к прогрессу;
 * - шаг впереди (до LOOKAHEAD) — он и всё до него пройдены; город — только если маршрут ведёт туда
 *   следующим переходом (иначе игрок зашёл продать лут);
 * - дальше — ближайший шаг этой зоны впереди (всё до него пройдено) или позади (только показать: отметки
 *   не снимаем, прогресс остаётся — «вернуться к шагу»); город — только впереди и только другого акта.
 */
export function enterZone(flat: FlatStep[], prog: LevelingProgress, areaId: string, now: number): ZoneResult {
  const progress = { ...prog, areaId, updatedAt: now }
  const same: ZoneResult = { progress, moved: null }
  const i = currentIndex(flat, prog)
  if (i < 0) return same
  if (areaId === zoneAt(flat, i) || /^Hideout/.test(areaId)) return same
  const h = progressIndex(flat, prog)
  if (h > i && h < flat.length && zoneAt(flat, h) === areaId) {
    return { progress: { ...progress, current: flat[h].step.id }, moved: 'progress' }
  }
  const town = /_town$/.test(areaId)
  // ближайший шаг, ведущий в эту зону, впереди и позади
  let ahead = -1
  for (let j = i; j < flat.length; j++) {
    if (flat[j].to === areaId) {
      ahead = j + 1
      break
    }
  }
  let behind = areaId === START_AREA ? 0 : -1
  for (let j = i - 2; j >= 0; j--) {
    if (flat[j].to === areaId) {
      behind = j + 1
      break
    }
  }
  const forward = (t: number): ZoneResult => ({ progress: advanceTo(flat, progress, t, now), moved: 'forward' })
  if (town) {
    for (let j = i; j < Math.min(flat.length, i + LOOKAHEAD); j++) {
      if (flat[j].to === areaId) return forward(j + 1)
      if (flat[j].to !== null) break
    }
    // город следующего акта (вход в игру, путевой камень) — к нему; своего или прошлого — за покупками
    const act = actOf(areaId)
    return ahead >= 0 && act !== null && act > flat[i].act ? forward(ahead) : same
  }
  if (ahead >= 0 && ahead - i <= LOOKAHEAD) return forward(ahead)
  if (behind >= 0 && (ahead < 0 || i - behind < ahead - i)) {
    return { progress: { ...progress, current: flat[behind].step.id }, moved: 'back' }
  }
  return ahead >= 0 ? forward(ahead) : same
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
