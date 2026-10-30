import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { LevelingData, LevelingLabs } from '@shared/types/leveling'
import {
  LAB_LEVEL,
  emptyLabs,
  hideLab,
  isAscendancyClass,
  labReminder,
  labSource,
  labsDone,
  labsFromPoints,
  labsOpen,
  markLab,
  withLogLabs
} from '@shared/leveling/labs'
import { DEFAULT_VARIANT, emptyProgress, flattenRoute, jumpTo, labRouteAt, stepLab } from '@shared/leveling/route'
import { parseLevelingLine } from '@shared/leveling/log'
import { zoneXp } from '@shared/leveling/zoneXp'
import { LevelingStore, normalizeLevelingFile } from '../../src/main/services/levelingStore'

// Лабиринты (S52): напоминание по уровню и пройденным, галочки, «скрыть до следующего», шаг маршрута;
// по журналу — класс восхождения и `/passives`; в группе — только свой персонаж.

const DATA = path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json')
const data = JSON.parse(readFileSync(DATA, 'utf8')) as LevelingData
const flat = flattenRoute(data, DEFAULT_VARIANT)

const labs = (patch: Partial<LevelingLabs> = {}): LevelingLabs => ({ ...emptyLabs(), ...patch })

describe('лабиринты: уровни и пройденные', () => {
  it('уровни лабиринтов', () => {
    expect(LAB_LEVEL).toEqual({ normal: 33, cruel: 55, merciless: 68, eternal: 75 })
    expect([1, 32, 33, 54, 55, 67, 68, 74, 75, 100].map(labsOpen)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('класс восхождения в журнале — обычный пройден; базовый — нет (EN и RU, из данных клиента)', () => {
    for (const c of ['Deadeye', 'Снайпер', 'Juggernaut', 'Покоритель', 'Luminary', 'Светоч', 'Вознесшаяся']) {
      expect(isAscendancyClass(c, data.classes), c).toBe(true)
    }
    for (const c of ['Ranger', 'Охотница', 'Scion', 'Дворянка', 'Witch', 'Ведьма', 'Foo', '', null]) {
      expect(isAscendancyClass(c, data.classes), String(c)).toBe(false)
    }
    // без данных — запасная таблица
    expect(isAscendancyClass('Elementalist')).toBe(true)
  })

  it('очки из /passives → лабиринты', () => {
    expect([0, 1, 2, 3, 4, 6, 8, 10, NaN].map(labsFromPoints)).toEqual([0, 0, 1, 1, 2, 3, 4, 4, 0])
  })

  it('галочка: отмеченный значит и прошлые; снять — и все выше; журнал не снимается', () => {
    let l = markLab(emptyLabs(), 'cruel', true, 5)
    expect(labsDone(l)).toBe(2)
    expect(labSource(l, 'normal')).toBe('mark')
    expect(labSource(l, 'merciless')).toBeNull()
    l = markLab(l, 'merciless', true, 6)
    l = markLab(l, 'normal', false, 7)
    expect(l.marked).toEqual({})
    expect(labsDone(l)).toBe(0)
    l = markLab(withLogLabs(l, 1), 'normal', false, 8)
    expect(labsDone(l)).toBe(1)
    expect(labSource(l, 'normal')).toBe('log')
    // журнал показывает только больше
    expect(withLogLabs(withLogLabs(emptyLabs(), 3), 1).log).toBe(3)
  })
})

describe('напоминание о лабиринте', () => {
  it('по уровню: дорос, а очков меньше положенного', () => {
    expect(labReminder(32, labs())).toBeNull()
    expect(labReminder(33, labs())).toMatchObject({ lab: 'normal', points: 2, have: 0, expected: 2, level: 33, onStep: false })
    expect(labReminder(54, labs({ log: 1 }))).toBeNull()
    expect(labReminder(55, labs({ log: 1 }))).toMatchObject({ lab: 'cruel', have: 2, expected: 4 })
    // 70 и пройден только обычный — следующий жестокий, положено 6
    expect(labReminder(70, labs({ log: 1 }))).toMatchObject({ lab: 'cruel', have: 2, expected: 6 })
    expect(labReminder(75, labs({ log: 3 }))).toMatchObject({ lab: 'eternal', have: 6, expected: 8 })
    expect(labReminder(90, labs({ log: 4 }))).toBeNull()
    expect(labReminder(90, labs({ marked: { eternal: 1 } }))).toBeNull()
  })

  it('«скрыть» — до следующего лабиринта', () => {
    // скрыл обычный на 40 — до 55 нет, на 55 снова (обычный всё ещё не пройден)
    let l = hideLab(labs(), 40)
    expect(l.hidden).toEqual({ lab: 'normal', bracket: 'normal' })
    expect(labReminder(54, l)).toBeNull()
    expect(labReminder(55, l)).toMatchObject({ lab: 'normal' })
    // скрыл обычный на 60, потом прошёл его — жестокий напоминаем сразу
    l = hideLab(labs(), 60)
    expect(labReminder(60, l)).toBeNull()
    expect(labReminder(60, markLab(l, 'normal', true, 1))).toMatchObject({ lab: 'cruel' })
    // скрыл жестокий на 60 — до 68 нет
    l = hideLab(labs({ log: 1 }), 60)
    expect(labReminder(67, l)).toBeNull()
    expect(labReminder(68, l)).toMatchObject({ lab: 'cruel' })
    // вечный — последний: скрыть навсегда (пока не пройден)
    l = hideLab(labs({ log: 3 }), 80)
    expect(labReminder(100, l)).toBeNull()
    expect(hideLab(labs({ log: 4 }), 90)).toEqual(labs({ log: 4 }))
  })

  it('шаг маршрута: впереди — ждём, на шаге — строка шага (и раньше уровня, и скрытая), после — по уровню', () => {
    expect(labReminder(40, labs(), { normal: 'ahead' })).toBeNull()
    expect(labReminder(31, labs(), { normal: 'now' })).toMatchObject({ lab: 'normal', onStep: true, expected: 2 })
    expect(labReminder(40, hideLab(labs(), 40), { normal: 'now' })).toMatchObject({ onStep: true })
    expect(labReminder(40, labs(), { normal: 'passed' })).toMatchObject({ lab: 'normal', onStep: false })
    // вечного в маршруте нет — по уровню
    expect(labReminder(75, labs({ log: 3 }), { normal: 'passed', cruel: 'passed', merciless: 'passed' })).toMatchObject({ lab: 'eternal' })
  })

  it('шаги «Лабиринт» маршрута exile-leveling: 4, 7, 10 акты', () => {
    const steps = flat.filter((f) => stepLab(f.step))
    expect(steps.map((f) => [f.act, stepLab(f.step)])).toEqual([
      [4, 'normal'],
      [7, 'cruel'],
      [10, 'merciless']
    ])
    const p = emptyProgress()
    expect(labRouteAt(flat, p)).toEqual({ normal: 'ahead', cruel: 'ahead', merciless: 'ahead' })
    const at = jumpTo(flat, p, steps[0].index, 1)
    expect(labRouteAt(flat, at)).toEqual({ normal: 'now', cruel: 'ahead', merciless: 'ahead' })
    expect(labRouteAt(flat, jumpTo(flat, p, steps[0].index + 1, 1))).toMatchObject({ normal: 'passed', cruel: 'ahead' })
    expect(labRouteAt(flat, { ...p, finished: { reason: 'map', at: 1 } })).toEqual({ normal: 'passed', cruel: 'passed', merciless: 'passed' })
  })
})

// ---------------------------------------------------------------------------
// По журналу (main: LevelingStore на синтетическом Client.txt)
// ---------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')
function gameLog(start = new Date(2026, 9, 30, 20, 0, 0)) {
  let n = 0
  const pre = (lvl: 'DEBUG' | 'INFO'): string => {
    n += 1
    const d = new Date(start.getTime() + n * 1000)
    const ts = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return `${ts} ${100000 + n * 7} 1186a8a3 [${lvl} Client 4242] `
  }
  return {
    login: (): string => `${pre('INFO')}Async connecting to fra.login.pathofexile.com:20488`,
    area: (id: string, level?: number): string =>
      `${pre('DEBUG')}Generating level ${level ?? data.areas[id]?.level ?? 1} area "${id}" with seed ${n + 1}`,
    sys: (text: string): string => `${pre('INFO')}: ${text}`
  }
}

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-leveling-labs-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})
let clock = 2_000_000
let files = 0
/** Запуск приложения по хвосту лога; свой файл на каждый запуск (отложенная запись прошлого не мешает) */
const start = async (lines: string[], file = `leveling-${++files}.json`): Promise<LevelingStore> => {
  const s = new LevelingStore(path.join(dir, file), DATA, () => ++clock)
  await s.load()
  await s.prime(async () => lines)
  return s
}

describe('лабиринты по журналу', () => {
  it('/passives EN и RU — событие с очками восхождения', () => {
    const g = gameLog()
    expect(parseLevelingLine(g.sys('6 total Ascendancy Skill Points (5 allocated)'))).toEqual({ type: 'ascendancy', total: 6 })
    expect(parseLevelingLine(g.sys('6 очков Восхождения (5 использовано)'))).toEqual({ type: 'ascendancy', total: 6 })
    expect(parseLevelingLine(g.sys('31 total Passive Skill Points (30 allocated)'))).toBeNull()
  })

  it.each([
    ['en', 'Kassi (Deadeye) is now level 40', 'Kassi (Ranger) is now level 41'],
    ['ru', 'Kassi (Снайпер) достигает 40 уровня', 'Kassi (Охотница) достигает 41 уровня']
  ])('%s: класс восхождения → обычный пройден; /passives → больше', async (_lang, asc, base) => {
    const g = gameLog()
    let s = await start([g.login(), g.area('1_4_town'), g.sys(base)])
    expect(s.state().progress.labs.log).toBe(0)
    s = await start([g.login(), g.area('1_4_town'), g.sys(asc)])
    expect(s.state().progress.labs.log).toBe(1)
    expect(s.state().progress.level).toBe(40)
    s.ingestLines([g.sys('6 total Ascendancy Skill Points (6 allocated)')])
    expect(s.state().progress.labs.log).toBe(3)
    // меньше — не бывает
    s.ingestLines([g.sys('2 total Ascendancy Skill Points (2 allocated)')])
    expect(s.state().progress.labs.log).toBe(3)
  })

  it('группа: уровень и класс — только своего персонажа, опыт в зоне — по своему уровню', async () => {
    const g = gameLog()
    const s = await start([
      g.login(),
      g.area('1_4_town'),
      g.sys('Me (Ranger) is now level 40'),
      g.area('1_5_1', 45),
      g.sys('Friend (Deadeye) is now level 80'),
      g.sys('Friend (Deadeye) is now level 81')
    ])
    const st = s.state()
    expect(st.character).toBe('Me')
    expect(st.progress.level).toBe(40)
    expect(st.progress.labs.log).toBe(0)
    expect(st.zone).toMatchObject({ areaId: '1_5_1', level: 45 })
    // 40 в 45: в пределах ±5 — без штрафа; по чужому 81 было бы −90 %
    expect(zoneXp(st.zone!.areaId, st.zone!.level, st.progress.level, false)).toBeNull()
    expect(zoneXp('1_5_1', 45, 81, true)).not.toBeNull()
  })

  it('галочка и «скрыть» — на персонажа, переживают перезапуск и «Начать заново»', async () => {
    const g = gameLog()
    const s = await start([g.login(), g.area('1_4_town'), g.sys('Me (Ranger) is now level 60')], 'keep.json')
    let st = await s.act({ type: 'lab', lab: 'normal', done: true })
    expect(labsDone(st.progress.labs)).toBe(1)
    st = await s.act({ type: 'labHide' })
    expect(st.progress.labs.hidden).toEqual({ lab: 'cruel', bracket: 'cruel' })
    st = await s.act({ type: 'reset' })
    expect(labsDone(st.progress.labs)).toBe(1)
    await s.flush()
    const again = new LevelingStore(path.join(dir, 'keep.json'), DATA, () => ++clock)
    await again.load()
    expect(again.state().progress.labs).toMatchObject({ log: 0, hidden: { lab: 'cruel', bracket: 'cruel' } })
    expect(again.state().progress.labs.marked.normal).toBeTypeOf('number')
    // новый персонаж — с нуля
    st = await again.createProfile('Новый')
    expect(st.progress.labs).toEqual(emptyLabs())
  })

  it('файл: мусор в лабиринтах отбрасывается, старый файл без них — пусто', () => {
    const f = normalizeLevelingFile(
      {
        profiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        activeId: 'a',
        progress: {
          a: { labs: { log: 9, marked: { normal: 5, uber: 3, cruel: 'x' }, hidden: { lab: 'uber', bracket: 'normal' } } },
          b: {}
        }
      },
      1
    )
    expect(f.progress.a.labs).toEqual({ log: 4, marked: { normal: 5 }, hidden: null })
    expect(f.progress.b.labs).toEqual(emptyLabs())
  })
})
