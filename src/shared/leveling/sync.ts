// Авто-прогресс гида прокачки PoE1 по журналу игры (S22): кто играет, где он и пройдена ли кампания. Чистый
// модуль (без electron и fs) — его гоняет services/levelingStore.ts и при запуске по хвосту Client.txt, и по
// новым строкам.
//
// Персонаж. Строки «<имя> (<класс>) is now level N» / «достигает N уровня» дают имя, но в группе пишутся и про
// других игроков. Поэтому журнал делится на входы в игру (строка входа на сервер — см. log.ts): персонаж входа
// — первый, кто повысил уровень после входа (дальше чужие имена — группа). Пока он не узнан, события идут
// активному персонажу; если вход окажется другим — прогресс активного откатывается к снимку на входе, а зоны
// входа переносятся найденному. Новый персонаж всегда начинает в Сумрачном взморье (1_1_1).
//
// Кампания пройдена — любой из признаков (всё из журнала):
//  - карта атласа (MapWorlds*, *_MapGuardian*) — атлас открывается только после 10 акта;
//  - эпилог (2_11_*, Карейские берега) — туда попадают, только убив Китаву;
//  - зона не кампании с уровнем области ≥ 68 (ограбления, Мэйвен, лабиринт вечности…): зоны актов — до 67,
//    но город 10 акта и эпилог — 69, поэтому уровень берём только вне кампании и без лабиринта и арены
//    (безжалостный лабиринт 68 доступен ещё в 10 акте);
//  - уровень своего персонажа ≥ 75: маршрут кончается на ~68, а с 75 в зонах 10 акта опыт режется.
// Признак в непознанном входе ставится активному, только если тот мог дойти до конца (имя не знаем, уровень
// ≥ 55 или он в 10 акте); иначе гид скрыт до конца входа, а признак уйдёт персонажу, когда тот узнается.

import type {
  LevelingData,
  LevelingFinished,
  LevelingHidden,
  LevelingProfile,
  LevelingProgress,
  LevelingSession,
  LevelingShow,
  LevelingVariant,
  LevelingZoneKind
} from '../types/leveling'
import { classifyArea } from '../farm/zones'
import { currentIndex, emptyProgress, enterZone, type FlatStep } from './route'

/** Новый персонаж начинает здесь (Сумрачное взморье). */
export const NEW_CHARACTER_AREA = '1_1_1'
/** Уровень персонажа, с которого кампания считается пройденной. */
export const FINISH_LEVEL = 75
/** Ниже этого уровня персонаж ещё не мог пройти кампанию (для признаков в непознанном входе). */
export const ENDGAME_PLAUSIBLE_LEVEL = 55
/** Уровень области эндгейма: зоны актов — до 67. */
export const ENDGAME_AREA_LEVEL = 68
const MAX_SESSION_ZONES = 100

export interface LevelingBook {
  profiles: LevelingProfile[]
  activeId: string
  progress: Record<string, LevelingProgress>
  session: LevelingSession
}

export interface SyncEnv {
  data: LevelingData
  /** плоский маршрут варианта */
  flat: (v: LevelingVariant) => FlatStep[]
  now: number
  newId: () => string
}

export function emptySession(): LevelingSession {
  return { character: null, fresh: false, endgame: null, finale: false, areaId: null, areaLevel: null, snapshot: null, zones: [] }
}

/** Вид зоны для гида: эпилог и лабиринт вечности — эндгейм; прочее по трекеру карт + уровень области ≥ 68. */
export function zoneKind(areaId: string, level: number): LevelingZoneKind {
  if (/^2_11_/.test(areaId) || /^EndGame_/.test(areaId)) return 'endgame'
  const k = classifyArea(areaId, level)
  if (k !== 'other') return k
  return level >= ENDGAME_AREA_LEVEL && !/^\d+_Labyrinth_/.test(areaId) && !/^ffa/.test(areaId) ? 'endgame' : 'other'
}

/** Признак «кампания пройдена» по зоне; null — нет. */
export function finishByZone(areaId: string, level: number, now: number): LevelingFinished | null {
  const kind = zoneKind(areaId, level)
  if (kind === 'map') return { reason: 'map', at: now, areaId, level }
  if (kind !== 'endgame') return null
  return { reason: /^2_11_/.test(areaId) ? 'epilogue' : 'endgame', at: now, areaId, level }
}

const isDefaultName = (name: string): boolean => /^(Персонаж|Character)( \d+)?$/.test(name.trim())

function active(book: LevelingBook): LevelingProfile {
  return book.profiles.find((p) => p.id === book.activeId) ?? book.profiles[0]
}

/** Персонаж ещё не ушёл дальше начала: до Побережья, уровень ≤ 2, кампания не пройдена. */
export function isFresh(flat: FlatStep[], p: LevelingProgress): boolean {
  if (p.finished || p.level > 2) return false
  const coast = flat.findIndex((f) => f.to === '1_1_2')
  return !flat.some((f, k) => k >= coast && !!p.done[f.step.id])
}

/** Мог ли активный персонаж дойти до конца кампании (для признака в непознанном входе). */
function couldFinish(profile: LevelingProfile, p: LevelingProgress, flat: FlatStep[]): boolean {
  if (!profile.character || p.level >= ENDGAME_PLAUSIBLE_LEVEL) return true
  const i = currentIndex(flat, p)
  return i < 0 || flat[i].act >= 10
}

/** Шаг маршрута по зоне — только для зон кампании и городов актов. */
function routeZone(p: LevelingProgress, areaId: string, level: number, env: SyncEnv): LevelingProgress {
  const kind = zoneKind(areaId, level)
  if (kind !== 'campaign' && kind !== 'town' && !/^2_11_/.test(areaId)) return p
  return enterZone(env.flat(p.variant), p, areaId, env.now).progress
}

function newProfile(book: LevelingBook, env: SyncEnv, name: string, character: string | null): LevelingProfile {
  const variant = book.progress[book.activeId]?.variant
  const p: LevelingProfile = { id: env.newId(), name, className: null, character, createdAt: env.now, updatedAt: env.now }
  book.profiles.push(p)
  book.progress[p.id] = emptyProgress(variant, env.now)
  return p
}

/** Вход в игру: персонаж ещё не известен; снимок активного — чтобы откатить, если это другой персонаж. */
export function applyLogin(book: LevelingBook): void {
  const p = book.progress[book.activeId]
  book.session = { ...emptySession(), snapshot: p ? { profileId: book.activeId, progress: p } : null }
}

/** Сменить активного персонажа по журналу: откатить то, что этот вход сделал прежнему, перенести зоны входа. */
function switchTo(book: LevelingBook, id: string, env: SyncEnv): void {
  const s = book.session
  if (s.snapshot && s.snapshot.profileId === book.activeId && book.progress[book.activeId]) {
    book.progress[book.activeId] = s.snapshot.progress
  }
  book.activeId = id
  s.snapshot = null
  let p = book.progress[id]
  if (!p.finished || p.showAnyway) {
    for (const z of s.zones) p = routeZone(p, z.areaId, z.level, env)
    if (s.areaId) p = { ...p, areaId: s.areaId }
  }
  book.progress[id] = p
}

/**
 * Вход в зону. Сумрачное взморье — новый персонаж (если активный уже ушёл дальше). Зона кампании — шаг этой
 * зоны (если кампания у персонажа не пройдена и этот вход не показал эндгейм чужого персонажа). Карта, эпилог,
 * эндгейм — признак «кампания пройдена».
 */
export function applyZone(book: LevelingBook, areaId: string, level: number, env: SyncEnv): void {
  const s = book.session
  if (areaId === NEW_CHARACTER_AREA) {
    const flat = env.flat(book.progress[book.activeId].variant)
    if (!isFresh(flat, book.progress[book.activeId])) {
      const p = newProfile(book, env, `Персонаж ${book.profiles.length + 1}`, null)
      book.activeId = p.id
      book.session = { ...emptySession(), fresh: true }
    } else {
      s.fresh = true
      s.snapshot = null
    }
  }
  const ss = book.session
  ss.areaId = areaId
  ss.areaLevel = level
  ss.zones.push({ areaId, level })
  if (ss.zones.length > MAX_SESSION_ZONES) ss.zones.splice(0, ss.zones.length - MAX_SESSION_ZONES)

  const profile = active(book)
  let p = book.progress[profile.id]
  const flat = env.flat(p.variant)
  const fin = finishByZone(areaId, level, env.now)
  if (fin && !ss.endgame) ss.endgame = fin
  const mine = ss.character !== null || couldFinish(profile, p, flat)
  // чужой эндгейм в этом входе (персонаж не узнан и не мог дойти до конца) — прогресс активного не трогаем
  if ((!p.finished || p.showAnyway) && (!ss.endgame || mine)) p = { ...routeZone(p, areaId, level, env), areaId }
  if (fin && !p.finished && mine) {
    p = { ...p, finished: fin }
    ss.finale = fin.reason === 'epilogue'
  }
  book.progress[profile.id] = p
}

/**
 * Повышение уровня: имя → персонаж входа. Известное имя — переключиться на него; новое — запомнить у
 * активного (если у того имени нет или вход начался новым персонажем), иначе новый персонаж. После того, как
 * персонаж входа узнан, чужие имена — группа (без изменений).
 */
export function applyLevel(
  book: LevelingBook,
  e: { character: string; className: string; level: number },
  env: SyncEnv
): void {
  const s = book.session
  if (s.character !== null && s.character !== e.character) return
  let target = book.profiles.find((p) => p.character === e.character)
  if (!target) {
    const a = active(book)
    const ap = book.progress[a.id]
    const rebind = !a.character || (s.fresh && isFresh(env.flat(ap.variant), ap))
    // прошедший кампанию персонаж не может оказаться низкоуровневым новичком
    const plausible = !(ap.finished && e.level < ENDGAME_PLAUSIBLE_LEVEL)
    if (rebind && plausible) {
      a.character = e.character
      if (isDefaultName(a.name)) a.name = e.character
      target = a
    } else {
      target = newProfile(book, env, e.character, e.character)
    }
  }
  if (target.id !== book.activeId) switchTo(book, target.id, env)
  s.character = e.character
  s.snapshot = null
  target.className = e.className
  target.updatedAt = env.now
  let p: LevelingProgress = { ...book.progress[target.id], level: e.level, updatedAt: env.now }
  if (!p.finished && s.endgame) {
    p = { ...p, finished: s.endgame }
    s.finale = s.endgame.reason === 'epilogue'
  }
  if (!p.finished && e.level >= FINISH_LEVEL) p = { ...p, finished: { reason: 'level', at: env.now, level: e.level } }
  book.progress[target.id] = p
}

/**
 * Последние шаги маршрута — в эпилоге (рецепт, «Конец голода» +2 пассива): в том входе, где персонаж дошёл до
 * эпилога, гид их ещё показывает в Карейских берегах; со следующего входа — нет.
 */
function finale(p: LevelingProgress, s: LevelingSession, flat: FlatStep[]): boolean {
  return s.finale && !!s.areaId && /^2_11_/.test(s.areaId) && p.finished?.reason === 'epilogue' && currentIndex(flat, p) >= 0
}

/**
 * Виден ли гид: хоткей (до входа в другую зону) — да; «никогда» — нет; «всегда» — да; «авто» — только в
 * зонах кампании (не город, убежище, карта) и пока кампания не пройдена (или «показать всё равно»).
 */
export function guideState(
  show: LevelingShow,
  p: LevelingProgress,
  s: LevelingSession,
  forced: boolean,
  flat: FlatStep[]
): { visible: boolean; hidden: LevelingHidden | null } {
  if (forced) return { visible: true, hidden: null }
  if (show === 'never') return { visible: false, hidden: 'never' }
  if (show === 'always') return { visible: true, hidden: null }
  if (!s.areaId) return { visible: false, hidden: 'noZone' }
  const last = finale(p, s, flat)
  if ((p.finished || s.endgame) && !p.showAnyway && !last) return { visible: false, hidden: 'finished' }
  if (zoneKind(s.areaId, s.areaLevel ?? 0) !== 'campaign' && !last) return { visible: false, hidden: 'zone' }
  return { visible: true, hidden: null }
}
