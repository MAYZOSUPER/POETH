import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { LevelingData } from '@shared/types/leveling'
import {
  DEFAULT_VARIANT,
  banditPassives,
  counters,
  currentIndex,
  emptyProgress,
  enterZone,
  flattenRoute,
  jumpTo,
  next,
  prev,
  progressIndex,
  returnIndex,
  stepPassives,
  toggle,
  zoneAt
} from '@shared/leveling/route'
import { isAfter, parseLevelingLine, parseLevelingLog } from '@shared/leveling/log'
import { plainText, renderParts } from '@shared/leveling/render'

// Прокачка PoE1 (S14, S22) на настоящих данных (resources/data/poe1/leveling/leveling.json, маршрут exile-leveling)
// и синтетических строках Client.txt EN/RU: зоны, уровень, переход шагов, «не по маршруту», счётчики.

const data = JSON.parse(
  readFileSync(path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json'), 'utf8')
) as LevelingData
const flat = flattenRoute(data, DEFAULT_VARIANT)
const T = 1_000
const P = (level: 'DEBUG' | 'INFO'): string => `2026/10/28 21:00:00 1000 1186a8a3 [${level} Client 1] `
const zone = (id: string, lvl = 1): string => `${P('DEBUG')}Generating level ${lvl} area "${id}" with seed 7`

describe('данные маршрута', () => {
  it('10 актов, шаги с id, зоны и квесты есть, имена RU', () => {
    expect(data.sections.map((s) => s.act)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(data.meta.source).toMatchObject({ repo: 'HeartofPhos/exile-leveling', license: 'MIT' })
    expect(data.areas['1_1_2']).toMatchObject({ en: 'The Coast', ru: 'Побережье', act: 1 })
    expect(data.areas['1_1_town'].ru).toBe('Застава Львиного глаза')
    expect(data.quests.a1q1.ru).toBe('Враг у ворот')
    expect(data.names.Hillock).toBe('Хиллок')
    const ids = data.sections.flatMap((s) => s.steps.map((x) => x.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('очки пассивов с квестов: 24 при убийстве всех бандитов, 23 — если помочь одному (как в маршруте)', () => {
    const kill = counters(flat, emptyProgress(DEFAULT_VARIANT), data)
    expect(kill.passives.total).toBe(24)
    const alira = flattenRoute(data, { leagueStart: true, bandit: 'alira' })
    expect(counters(alira, emptyProgress({ leagueStart: true, bandit: 'alira' }), data).passives.total).toBe(23)
    // 6 испытаний для Лабиринта Правителя в актах 1–3 (маршрут «старт лиги»)
    expect(kill.trials.total).toBe(6)
    // макет v3: «23 с квестов + 1 за бандитов = 24»
    expect(banditPassives(data)).toBe(1)
    // тег «+2 пассива» — «Конец голода» в 10 акте
    const hunger = flat.find((f) => f.step.parts.some((p) => typeof p === 'object' && 'k' in p && p.k === 'quest' && data.quests[p.q]?.en === 'An End to Hunger'))
    expect(hunger && stepPassives(hunger.step, data)).toBe(2)
    const bandits = flat.find((f) => f.step.cond?.includes('BANDIT_KILL') && f.step.tags?.includes('passive'))
    expect(bandits && stepPassives(bandits.step, data)).toBe(1)
  })

  it('варианты: без «старта лиги» шагов меньше, первые шаги и зоны после них', () => {
    const std = flattenRoute(data, { leagueStart: false, bandit: 'kill' })
    expect(std.length).toBeLessThan(flat.length)
    expect(flat[0]).toMatchObject({ act: 1, actIndex: 1, after: '1_1_1', to: null }) // убейте Хиллока
    expect(flat[1]).toMatchObject({ to: '1_1_town' })
    expect(flat[3]).toMatchObject({ to: '1_1_2' })
    expect(flat.at(-1)?.act).toBe(10)
  })
})

describe('текст шага RU/EN', () => {
  it('сдать квест, вход в зону, путевой камень', () => {
    const hand = flat.find((f) => f.step.id === 'a1-003')!.step
    expect(plainText(renderParts(hand.parts, data, 'ru'))).toBe('Сдайте Враг у ворот')
    expect(plainText(renderParts(hand.parts, data, 'en'))).toBe('Hand in Enemy at the Gate')
    expect(plainText(renderParts(flat[3].step.parts, data, 'ru'))).toBe('➞ Побережье')
    const wp = flat.find((f) => f.step.parts.some((p) => typeof p === 'object' && 'k' in p && p.k === 'wp'))!.step
    expect(plainText(renderParts(wp.parts, data, 'ru'))).toMatch(/^Путевой камень ➞ /)
  })

  it('подсказки: перевод и стрелки направлений', () => {
    const withSub = flat.find((f) => f.step.sub?.some((s) => s.en.some((p) => typeof p === 'object' && 'k' in p && p.k === 'dir')))!
    const sub = withSub.step.sub!.find((s) => s.en.some((p) => typeof p === 'object' && 'k' in p && p.k === 'dir'))!
    expect(plainText(renderParts(sub.ru, data, 'ru'))).toMatch(/[↑↗→↘↓↙←↖]/)
    expect(plainText(renderParts(sub.ru, data, 'ru'))).not.toMatch(/\b(Go|Follow|Look)\b/)
  })
})

describe.each([
  ['EN', 'Hero (Witch) is now level 2', 'Hero', 'Witch'],
  ['RU', 'Героиня (Ведьма) достигает 2 уровня', 'Героиня', 'Ведьма']
] as const)('журнал игры %s', (_lang, levelUp, who, cls) => {
  it('портал: глагол из текста маршрута не дублируется («…, place {portal|set}», «Take {portal|use}»)', () => {
    const withPortal = flat.filter((f) => f.step.parts.some((p) => typeof p === 'object' && 'k' in p && p.k === 'portal'))
    expect(withPortal.length).toBeGreaterThan(0)
    for (const f of withPortal) {
      const ruText = plainText(renderParts(f.step.parts, data, 'ru'))
      const enText = plainText(renderParts(f.step.parts, data, 'en'))
      expect(ruText, f.step.id).not.toMatch(/(поставьте|заберите)\s+(поставьте|войдите)/i)
      expect(enText, f.step.id).not.toMatch(/\b(place|take)\s+(set|use)\b/i)
    }
    const den = withPortal.find((f) => f.step.id === 'a2-004')!
    expect(plainText(renderParts(den.step.parts, data, 'ru'))).toMatch(/, поставьте портал$/)
    expect(plainText(renderParts(den.step.parts, data, 'en'))).toMatch(/, set a portal$/)
  })

  it('уровень персонажа и вход в зону', () => {
    expect(parseLevelingLine(`${P('INFO')}: ${levelUp}`)).toEqual({ type: 'level', character: who, className: cls, level: 2 })
    expect(parseLevelingLine(zone('1_1_2', 2))).toEqual({ type: 'zone', areaId: '1_1_2', level: 2 })
    expect(parseLevelingLine(`${P('INFO')}: ${who} has been slain.`)).toBeNull()
  })

  it('вход в игру — служебная строка движка (как в настоящем Client.txt); время и счётчик строки', () => {
    const login = '2026/10/29 02:03:27 265719328 890d9dbc [INFO Client 45552] Async connecting to fra.login.pathofexile.com:20488'
    expect(parseLevelingLog(login)).toEqual({ event: { type: 'login' }, at: { ts: new Date(2026, 9, 29, 2, 3, 27).getTime(), up: 265719328 } })
    // «Connected to …» и подключение к серверу зоны — не вход
    expect(parseLevelingLine('2026/10/29 02:03:27 265719437 890d9d3b [INFO Client 45552] Connected to fra.login.pathofexile.com in 31ms.')).toBeNull()
    expect(parseLevelingLine('2026/10/29 02:03:34 265726359 ca3a6b7d [INFO Client 45552] Connecting to instance server at 67.58.99.211:6112')).toBeNull()
    const at = { ts: new Date(2026, 9, 29, 2, 3, 27).getTime(), up: 265719328 }
    expect(isAfter(login, at)).toBe(false)
    expect(isAfter('2026/10/29 02:03:27 265719437 890d9d3b [INFO Client 45552] x', at)).toBe(true)
    expect(isAfter('2026/10/29 02:03:26 999999999 890d9d3b [INFO Client 45552] x', at)).toBe(false)
  })
})

describe('переход шагов по входу в зону', () => {
  const after = (areaId: string, from = 0): number => flat.findIndex((f, j) => j >= from && f.to === areaId) + 1

  it('вход в город после Хиллока → шаги 1–2 пройдены, текущий — «Сдайте квест»', () => {
    let prog = emptyProgress()
    expect(currentIndex(flat, prog)).toBe(0)
    const r = enterZone(flat, prog, '1_1_town', T)
    expect(r.moved).toBe('forward')
    prog = r.progress
    expect(Object.keys(prog.done)).toEqual(['a1-001', 'a1-002'])
    expect(prog.current).toBe('a1-003')
    // Побережье — через шаг «сдайте квест»: тот тоже пройден
    prog = enterZone(flat, prog, '1_1_2', T).progress
    expect(prog.current).toBe(flat[4].step.id)
    expect(prog.done['a1-003']).toBe(T)
  })

  it('та же зона (ручной шаг не сбрасывается), убежище, город по пути — без изменений', () => {
    const prog = jumpTo(flat, emptyProgress(), 4, T)
    expect(enterZone(flat, prog, '1_1_2', T).moved).toBeNull()
    expect(enterZone(flat, prog, 'HideoutSpace', T).moved).toBeNull()
    expect(enterZone(flat, prog, '1_1_town', T).moved).toBeNull()
    // ▶ вручную на шаг дальше в той же зоне, вход туда же (портал, смерть) — шаг остаётся
    const manual = next(flat, prog, T)
    expect(zoneAt(flat, currentIndex(flat, manual))).toBe('1_1_2')
    const r = enterZone(flat, manual, '1_1_2', T)
    expect(r.moved).toBeNull()
    expect(r.progress.current).toBe(manual.current)
  })

  it('зона далеко впереди (запуск посреди кампании, другой акт) → сразу её шаг', () => {
    const prog = jumpTo(flat, emptyProgress(), 4, T)
    const target = after('1_2_2') // акт 2
    const r = enterZone(flat, prog, '1_2_2', T)
    expect(r.moved).toBe('forward')
    expect(currentIndex(flat, r.progress)).toBe(target)
    expect(Object.keys(r.progress.done)).toHaveLength(target)
  })

  it('назад за квестом: шаг той зоны, отметки и прогресс остаются; «вернуться» — обратно', () => {
    const h = after('1_1_7_2') // Склеп Мерволла, уровень 2
    const prog = jumpTo(flat, emptyProgress(), h, T)
    const r = enterZone(flat, prog, '1_1_3', T) // Приливный остров — раньше по маршруту
    expect(r.moved).toBe('back')
    const back = currentIndex(flat, r.progress)
    expect(back).toBe(after('1_1_3'))
    expect(Object.keys(r.progress.done)).toHaveLength(h)
    expect(returnIndex(flat, r.progress)).toBe(h)
    expect(progressIndex(flat, r.progress)).toBe(h)
    // зона прогресса — обратно к нему
    const ret = enterZone(flat, r.progress, '1_1_7_2', T)
    expect(ret.moved).toBe('progress')
    expect(currentIndex(flat, ret.progress)).toBe(h)
    expect(returnIndex(flat, ret.progress)).toBeNull()
    // или кнопкой «вернуться к шагу»
    expect(currentIndex(flat, jumpTo(flat, r.progress, h, T))).toBe(h)
  })

  it('город: следующего акта — к нему (вход в игру), своего или прошлого — без изменений (за покупками)', () => {
    const prog = jumpTo(flat, emptyProgress(), 4, T)
    const r = enterZone(flat, prog, '1_5_town', T)
    expect(r.moved).toBe('forward')
    expect(currentIndex(flat, r.progress)).toBe(after('1_5_town'))
    const act5 = jumpTo(flat, emptyProgress(), after('1_5_3'), T)
    expect(enterZone(flat, act5, '1_5_town', T).moved).toBeNull()
    expect(enterZone(flat, act5, '1_1_town', T).moved).toBeNull()
  })

  it('◀ ▶ и ручные галочки', () => {
    let prog = next(flat, emptyProgress(), T)
    expect(prog.current).toBe('a1-002')
    prog = prev(flat, prog, T)
    expect(prog.current).toBe('a1-001')
    expect(prog.done['a1-001']).toBeUndefined()
    prog = toggle(flat, prog, 'a1-001', T)
    expect(prog.current).toBe('a1-002')
    prog = toggle(flat, prog, 'a1-001', T)
    expect(prog.current).toBe('a1-001')
  })

  it('счётчики: пройденные шаги акта и очки пассивов', () => {
    // всё до первой сдачи «Обитателя глубин» (первый квест с очком пассивов)
    const passiveStep = flat.findIndex((f) => f.step.tags?.includes('passive'))
    const prog = jumpTo(flat, emptyProgress(), passiveStep + 1, T)
    const c = counters(flat, prog, data)
    expect(c.passives.done).toBe(1)
    expect(c.acts[1].done).toBe(passiveStep + 1)
    expect(c.acts[1].total).toBe(flat.filter((f) => f.act === 1).length)
  })
})
