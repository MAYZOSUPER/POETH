// Лабиринты PoE 1 (S52): напоминание «Пора пройти лабиринт (обычный): +2 очка восхождения» в гиде прокачки и
// вкладке «Кампания». Чистый модуль. Уровни областей лабиринтов: обычный 33, жестокий 55, безжалостный 68,
// вечный 75 (испытания для него — в картах); за первое прохождение каждого — 2 очка восхождения, всего 8
// (подсказки клиента AscendancyClassSelectorWindowDescription, TutorialPanelTheLabyrinthContent3). Проходят по
// порядку: лабиринт не открыть, пока не пройдены прошлые (LabyrinthLockedPopupNoCost).
//
// Сколько пройдено — честно:
//  - по журналу: класс восхождения в строке повышения уровня («(Deadeye) is now level 40») — пройден хотя бы
//    обычный; вывод `/passives` («8 total Ascendancy Skill Points (8 allocated)», log.ts) — очки / 2.
//    Отдельной строки «лабиринт пройден» клиент в журнал не пишет (BackendErrors и ClientStrings 3.29.3.3);
//  - иначе — галочка «Пройден» у игрока, на персонажа. Отметка лабиринта значит, что и прошлые пройдены.
// В кампании напоминание ждёт шага маршрута «Лабиринт — восхождение» (exile-leveling: 4, 7 и 10 акты): до него
// войти может быть нельзя (испытания впереди), на шаге — строка с раскладкой, после шага — напоминание.

import type { LevelingLabs, LvLab } from '../types/leveling'
import { BASE_CLASSES, baseClass } from './classes'

export const LABS: readonly LvLab[] = ['normal', 'cruel', 'merciless', 'eternal']
/** Уровень области лабиринта — с него напоминаем. */
export const LAB_LEVEL: Record<LvLab, number> = { normal: 33, cruel: 55, merciless: 68, eternal: 75 }
/** Очки восхождения за первое прохождение. */
export const LAB_POINTS = 2

/** RU-имена базовых классов, как их пишет журнал клиента. */
const RU_BASE = new Set(['Дикарь', 'Ведьма', 'Дворянка', 'Охотница', 'Дуэлянт', 'Бандит', 'Жрец'])

export function emptyLabs(): LevelingLabs {
  return { log: 0, marked: {}, hidden: null }
}

export const labIndex = (lab: LvLab): number => LABS.indexOf(lab)

/** Класс из журнала — класс восхождения (не базовый): значит, обычный лабиринт пройден. */
export function isAscendancyClass(name: string | null | undefined, classes?: Record<string, string>): boolean {
  if (!name || (BASE_CLASSES as readonly string[]).includes(name) || RU_BASE.has(name)) return false
  return baseClass(name, classes) !== null
}

/** Лабиринтов по очкам восхождения из `/passives` (не больше 4). */
export function labsFromPoints(total: number): number {
  return Number.isFinite(total) && total > 0 ? Math.min(LABS.length, Math.floor(total / LAB_POINTS)) : 0
}

/** Сколько лабиринтов пройдено: по журналу или по галочкам (отмеченный — и все до него). */
export function labsDone(labs: LevelingLabs): number {
  let n = Math.max(0, Math.min(LABS.length, labs.log))
  LABS.forEach((lab, i) => {
    if (labs.marked[lab]) n = Math.max(n, i + 1)
  })
  return n
}

/** Чем подтверждён лабиринт: журнал, галочка (своя или более высокого) или ничем. */
export function labSource(labs: LevelingLabs, lab: LvLab): 'log' | 'mark' | null {
  const i = labIndex(lab)
  if (i < labs.log) return 'log'
  return i < labsDone(labs) ? 'mark' : null
}

/** Сколько лабиринтов уже по уровню персонажа. */
export function labsOpen(level: number): number {
  return LABS.filter((lab) => level >= LAB_LEVEL[lab]).length
}

/** Самый высокий лабиринт по уровню персонажа; null — ниже 33. */
export function labBracket(level: number): LvLab | null {
  const n = labsOpen(level)
  return n > 0 ? LABS[n - 1] : null
}

/** Журнал показал больше пройденных лабиринтов — запомнить (меньше не бывает: очки за первое прохождение). */
export function withLogLabs(labs: LevelingLabs, n: number): LevelingLabs {
  const v = Math.max(0, Math.min(LABS.length, Math.floor(n)))
  return v > labs.log ? { ...labs, log: v } : labs
}

/** Галочка «Пройден»: отметить лабиринт; снять — и все выше (без него их не пройти). Журнал не снимается. */
export function markLab(labs: LevelingLabs, lab: LvLab, done: boolean, now: number): LevelingLabs {
  const marked = { ...labs.marked }
  if (done) marked[lab] = marked[lab] ?? now
  else for (const l of LABS.slice(labIndex(lab))) delete marked[l]
  return { ...labs, marked }
}

/** Где в маршруте шаг «Лабиринт — восхождение»: впереди, текущий, пройден; нет такого шага — undefined. */
export type LabRouteAt = Partial<Record<LvLab, 'ahead' | 'now' | 'passed'>>

export interface LabReminder {
  lab: LvLab
  /** очки за этот лабиринт */
  points: number
  /** очков восхождения сейчас и сколько положено по уровню */
  have: number
  expected: number
  /** уровень лабиринта */
  level: number
  /** напоминание на шаге маршрута «Лабиринт» (без «скрыть»: шаг сам про лабиринт) */
  onStep: boolean
}

/**
 * Напоминание о следующем лабиринте или null. Следующий — первый не пройденный (по порядку). Напоминаем, когда
 * уровень персонажа дорос до него, а очков восхождения меньше положенного: в кампании — после шага маршрута с
 * этим лабиринтом (на самом шаге — строка шага, даже раньше уровня), без шага (вечный) или после кампании — по
 * уровню. «Скрыть» — до следующего лабиринта: пока не пройден этот или уровень не дорос до следующего.
 */
export function labReminder(level: number, labs: LevelingLabs, route: LabRouteAt = {}): LabReminder | null {
  const done = labsDone(labs)
  if (done >= LABS.length) return null
  const lab = LABS[done]
  const at = route[lab]
  const make = (onStep: boolean): LabReminder => ({
    lab,
    points: LAB_POINTS,
    have: done * LAB_POINTS,
    expected: Math.max(done + 1, labsOpen(level)) * LAB_POINTS,
    level: LAB_LEVEL[lab],
    onStep
  })
  if (at === 'now') return make(true)
  if (level < LAB_LEVEL[lab] || at === 'ahead') return null
  const h = labs.hidden
  if (h && h.lab === lab && labIndex(labBracket(level) ?? lab) <= labIndex(h.bracket)) return null
  return make(false)
}

/** «Скрыть» напоминание: до следующего лабиринта (этот пройден или уровень дорос до следующего). */
export function hideLab(labs: LevelingLabs, level: number): LevelingLabs {
  const done = labsDone(labs)
  if (done >= LABS.length) return labs
  const lab = LABS[done]
  const bracket = labBracket(level)
  return { ...labs, hidden: { lab, bracket: bracket && labIndex(bracket) > labIndex(lab) ? bracket : lab } }
}
