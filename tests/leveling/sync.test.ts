import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { LevelingData } from '@shared/types/leveling'
import { DEFAULT_VARIANT, currentIndex, flattenRoute } from '@shared/leveling/route'
import { FINISH_LEVEL, zoneKind } from '@shared/leveling/sync'
import { LevelingStore } from '../../src/main/services/levelingStore'

// Авто-прогресс гида прокачки (S22) на синтетических журналах EN и RU: запуск по хвосту лога, вход в игру,
// персонажи по имени, «кампания пройдена» (карты, эпилог, эндгейм ≥ 68, уровень), город и убежище, возврат
// в старую зону, режимы показа и хоткей. Строки — в формате настоящего Client.txt PoE1 3.29.

const DATA = path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json')
const data = JSON.parse(readFileSync(DATA, 'utf8')) as LevelingData
const flat = flattenRoute(data, DEFAULT_VARIANT)
/** шаг после входа в зону по маршруту (первый, начиная с from) */
const after = (areaId: string, from = 0): number => flat.findIndex((f, j) => j >= from && f.to === areaId) + 1

const CLASS_RU: Record<string, string> = { Witch: 'Ведьма', Ranger: 'Охотница', Marauder: 'Дикарь', Deadeye: 'Следопыт', Templar: 'Жрец' }
const pad = (n: number): string => String(n).padStart(2, '0')

/** Журнал игры: время идёт по секунде на строку, счётчик клиента растёт. */
function gameLog(lang: 'en' | 'ru', start = new Date(2026, 9, 28, 20, 0, 0)) {
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
    up: (name: string, cls: string, level: number): string =>
      `${pre('INFO')}: ` +
      (lang === 'en' ? `${name} (${cls}) is now level ${level}` : `${name} (${CLASS_RU[cls] ?? cls}) достигает ${level} уровня`),
    chat: (text: string): string => `${pre('INFO')}#Someone: ${text}`
  }
}

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-leveling-sync-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

let clock = 1_000_000
const make = async (): Promise<LevelingStore> => {
  const s = new LevelingStore(path.join(dir, 'leveling.json'), DATA, () => ++clock)
  await s.load()
  return s
}
/** Запуск приложения: хвост лога */
const start = async (lines: string[]): Promise<LevelingStore> => {
  const s = await make()
  await s.prime(async () => lines)
  return s
}
const idx = (s: LevelingStore): number => currentIndex(flat, s.state().progress)
const profile = (s: LevelingStore) => s.state().profiles.find((p) => p.id === s.state().activeId)!

describe.each([['en'], ['ru']] as const)('журнал %s', (lang) => {
  it('персонаж в картах → гид скрыт (кампания пройдена), и в зонах актов тоже', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('HideoutSpace', 60), g.area('MapWorldsLair', 77), g.chat('wtb'), g.area('HideoutSpace', 60)])
    let st = s.state()
    expect(st.progress.finished).toMatchObject({ reason: 'map', areaId: 'MapWorldsLair', level: 77 })
    expect(st.guide).toEqual({ visible: false, hidden: 'finished', forced: false })
    // новый вход: город 7 акта, потом зона актов — гид всё равно скрыт, прогресс не трогаем
    const before = st.progress.done
    s.ingestLines([g.login(), g.area('2_7_town'), g.area('2_7_4')])
    st = s.state()
    expect(st.guide.hidden).toBe('finished')
    expect(st.progress.done).toEqual(before)
    // «Показать всё равно» — гид в зонах кампании снова работает
    st = await s.act({ type: 'showAnyway', on: true })
    expect(st.guide.visible).toBe(true)
  })

  it('запуск посреди акта 5 → шаг акта 5, уровень и имя персонажа', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('1_5_town'), g.area('1_5_2'), g.up('Hero', 'Witch', 42)])
    const st = s.state()
    expect(idx(s)).toBe(after('1_5_2'))
    expect(flat[idx(s)].act).toBe(5)
    expect(st.progress.level).toBe(42)
    expect(profile(s)).toMatchObject({ name: 'Hero', character: 'Hero', className: lang === 'en' ? 'Witch' : 'Ведьма' })
    expect(st.character).toBe('Hero')
    expect(st.guide.visible).toBe(true)
    expect(st.zone).toEqual({ areaId: '1_5_2', level: 41, kind: 'campaign' })
  })

  it('новый персонаж → гид с начала 1 акта; старый остаётся пройденным', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('HideoutSpace', 60), g.area('MapWorldsTower', 83), g.up('Mapper', 'Deadeye', 92)])
    expect(profile(s).character).toBe('Mapper')
    expect(s.state().progress.finished).not.toBeNull()
    s.ingestLines([g.login(), g.area('1_1_1', 1)])
    let st = s.state()
    expect(st.profiles).toHaveLength(2)
    expect(st.progress.finished).toBeNull()
    expect(idx(s)).toBe(0)
    expect(st.guide.visible).toBe(true)
    s.ingestLines([g.up('Newbie', 'Ranger', 2), g.area('1_1_town')])
    st = s.state()
    expect(profile(s)).toMatchObject({ name: 'Newbie', character: 'Newbie' })
    expect(idx(s)).toBe(after('1_1_town'))
    const mapper = st.profiles.find((p) => p.character === 'Mapper')!
    expect((await s.selectProfile(mapper.id)).progress.finished?.reason).toBe('map')
  })

  it('переключение персонажей: по имени при повышении уровня; чужой вход откатывается', async () => {
    const g = gameLog(lang)
    // A качается в 3 акте, B — в картах
    const s = await start([
      g.login(),
      g.area('1_3_town'),
      g.area('1_3_1'),
      g.up('Alpha', 'Marauder', 25),
      g.login(),
      g.area('HideoutSpace', 60),
      g.area('MapWorldsLair', 77),
      g.up('Beta', 'Deadeye', 90)
    ])
    let st = s.state()
    expect(st.profiles.map((p) => p.character)).toEqual(['Alpha', 'Beta'])
    expect(profile(s).character).toBe('Beta')
    expect(st.guide.hidden).toBe('finished')
    // снова A: до повышения уровня — ещё Beta (пройдена, гид скрыт), после — Alpha в 3 акте
    s.ingestLines([g.login(), g.area('1_3_town'), g.area('1_3_2')])
    expect(profile(s).character).toBe('Beta')
    s.ingestLines([g.up('Alpha', 'Marauder', 26)])
    st = s.state()
    expect(profile(s).character).toBe('Alpha')
    expect(idx(s)).toBe(after('1_3_2'))
    expect(st.progress.level).toBe(26)
    expect(st.progress.finished).toBeNull()
    expect(st.guide.visible).toBe(true)
    // вход незнакомым персонажем: зоны 8 акта сначала идут Alpha, а после его повышения уровня — откат
    const alphaDone = Object.keys(st.progress.done).length
    s.ingestLines([g.login(), g.area('2_8_town'), g.area('2_8_1')])
    expect(flat[idx(s)].act).toBe(8)
    s.ingestLines([g.up('Gamma', 'Templar', 56)])
    st = s.state()
    expect(profile(s).character).toBe('Gamma')
    expect(flat[idx(s)].act).toBe(8)
    const alpha = st.profiles.find((p) => p.character === 'Alpha')!
    st = await s.selectProfile(alpha.id)
    expect(Object.keys(st.progress.done)).toHaveLength(alphaDone)
    expect(flat[currentIndex(flat, st.progress)].act).toBe(3)
  })

  it('в группе: после своего повышения уровня чужие имена не меняют персонажа', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('1_2_town'), g.up('Hero', 'Witch', 14), g.up('Ally', 'Marauder', 30)])
    const st = s.state()
    expect(st.profiles).toHaveLength(1)
    expect(profile(s).character).toBe('Hero')
    expect(st.progress.level).toBe(14)
  })

  it('возврат в старую зону за квестом: её шаг и «вернуться к шагу»; снова туда, где прогресс', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('1_1_town'), g.up('Hero', 'Witch', 9), g.area('1_1_7_1'), g.area('1_1_7_2')])
    const h = idx(s)
    expect(h).toBe(after('1_1_7_2'))
    expect(s.state().offRoute).toBeNull()
    s.ingestLines([g.area('1_1_3')])
    let st = s.state()
    expect(idx(s)).toBe(after('1_1_3'))
    expect(st.offRoute).toBe(h)
    expect(Object.keys(st.progress.done)).toHaveLength(h)
    expect(st.guide.visible).toBe(true)
    s.ingestLines([g.area('1_1_7_2')])
    st = s.state()
    expect(idx(s)).toBe(h)
    expect(st.offRoute).toBeNull()
  })

  it('город и убежище: гид скрыт, шаг не меняется; хоткей показывает до следующей зоны', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('1_2_town'), g.area('1_2_2'), g.up('Hero', 'Witch', 14)])
    const step = idx(s)
    expect(s.state().guide.visible).toBe(true)
    s.ingestLines([g.area('1_2_town')])
    expect(s.state().guide).toEqual({ visible: false, hidden: 'zone', forced: false })
    expect(s.state().zone?.kind).toBe('town')
    expect(idx(s)).toBe(step)
    s.ingestLines([g.area('HideoutSpace', 60)])
    expect(s.state().guide.hidden).toBe('zone')
    expect(s.state().zone?.kind).toBe('hideout')
    expect(idx(s)).toBe(step)
    // хоткей: скрытый — показать развёрнутым; видимый — свернуть
    let st = await s.toggleGuide()
    expect(st.guide).toEqual({ visible: true, hidden: null, forced: true })
    st = await s.toggleGuide()
    expect(st.config.collapsed).toBe(true)
    st = await s.toggleGuide()
    expect(st.config.collapsed).toBe(false)
    s.ingestLines([g.area('1_2_town')])
    expect(s.state().guide).toEqual({ visible: false, hidden: 'zone', forced: false })
    // вернулся в зону — гид снова виден на том же шаге
    s.ingestLines([g.area('1_2_2')])
    expect(s.state().guide.visible).toBe(true)
    expect(idx(s)).toBe(step)
  })

  it('эпилог: в этом входе гид ещё показывает последние шаги в Карейских берегах, со следующего — скрыт', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('2_10_town'), g.up('Hero', 'Witch', 66), g.area('2_10_5'), g.area('2_10_6')])
    expect(s.state().progress.finished).toBeNull()
    expect(s.state().guide.visible).toBe(true)
    s.ingestLines([g.area('2_11_endgame_town')])
    let st = s.state()
    expect(st.progress.finished?.reason).toBe('epilogue')
    expect(idx(s)).toBe(after('2_11_endgame_town'))
    expect(st.guide.visible).toBe(true) // «сдайте Конец голода» (+2 пассива)
    s.ingestLines([g.area('HideoutSpace', 60)])
    expect(s.state().guide.hidden).toBe('finished')
    s.ingestLines([g.login(), g.area('2_11_endgame_town')])
    st = s.state()
    expect(st.guide.hidden).toBe('finished')
  })

  it('уровень области: лабиринт 68 и город 10 акта 69 — ещё кампания; ограбление 83 — эндгейм', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('2_10_town'), g.up('Hero', 'Witch', 64), g.area('Labyrinth_Airlock', 33), g.area('3_Labyrinth_C_straight', 68)])
    expect(s.state().progress.finished).toBeNull()
    expect(zoneKind('2_10_town', 69)).toBe('town')
    expect(zoneKind('3_Labyrinth_C_straight', 68)).toBe('other')
    expect(zoneKind('ffa3_1', 68)).toBe('other')
    expect(zoneKind('HeistHub', 68)).toBe('town')
    expect(zoneKind('HeistBunker7', 45)).toBe('other')
    s.ingestLines([g.area('2_10_town'), g.area('HeistHub', 68), g.area('HeistBunker9', 83)])
    expect(s.state().progress.finished).toMatchObject({ reason: 'endgame', level: 83 })
  })

  it(`уровень персонажа ≥ ${FINISH_LEVEL} — кампания пройдена`, async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('HideoutSpace', 60), g.up('Old', 'Deadeye', FINISH_LEVEL - 1)])
    expect(s.state().progress.finished).toBeNull()
    s.ingestLines([g.up('Old', 'Deadeye', FINISH_LEVEL)])
    expect(s.state().progress.finished).toMatchObject({ reason: 'level', level: FINISH_LEVEL })
  })

  it('карты у неузнанного персонажа при активном новичке: новичка не трогаем, гид скрыт до конца входа', async () => {
    const g = gameLog(lang)
    const s = await start([g.login(), g.area('1_2_town'), g.area('1_2_2'), g.up('Hero', 'Witch', 15)])
    const step = idx(s)
    s.ingestLines([g.login(), g.area('HideoutSpace', 60), g.area('MapWorldsLair', 77), g.area('HideoutSpace', 60)])
    let st = s.state()
    expect(st.progress.finished).toBeNull()
    expect(st.guide.hidden).toBe('finished')
    expect(st.character).toBeNull()
    // в зону актов в том же входе — всё ещё чужой эндгейм: шаг не меняется
    s.ingestLines([g.area('1_2_3')])
    expect(idx(s)).toBe(step)
    // новый вход — снова новичок
    s.ingestLines([g.login(), g.area('1_2_town'), g.area('1_2_2')])
    st = s.state()
    expect(st.guide.visible).toBe(true)
    expect(idx(s)).toBe(step)
  })
})

describe('запуск по хвосту лога', () => {
  it('повторный запуск не учитывает строки дважды: только новые после курсора', async () => {
    const g = gameLog('en')
    const tail = [g.login(), g.area('HideoutSpace', 60), g.area('MapWorldsLair', 77), g.up('Mapper', 'Deadeye', 92), g.login(), g.area('1_1_1', 1), g.up('Newbie', 'Witch', 2)]
    const s = await start(tail)
    expect(s.state().profiles.map((p) => p.character)).toEqual(['Mapper', 'Newbie'])
    await s.flush()
    // перезапуск: тот же хвост + новые строки — Сумрачное взморье из старого хвоста не создаёт ещё персонажа
    const again = await start([...tail, g.area('1_1_town')])
    const st = again.state()
    expect(st.profiles.map((p) => p.character)).toEqual(['Mapper', 'Newbie'])
    expect(profile(again).character).toBe('Newbie')
    expect(idx(again)).toBe(after('1_1_town'))
    expect(again.logState().cursor).not.toBeNull()
  })

  it('строки тейлера до чтения хвоста ждут в очереди и не повторяются', async () => {
    const g = gameLog('ru')
    const s = await make()
    s.hold()
    const live = g.area('1_1_town')
    const tail = [g.login(), g.area('1_1_1', 1), g.up('Героиня', 'Witch', 2)]
    s.ingestLines([live])
    expect(idx(s)).toBe(0) // ещё в очереди
    await s.prime(async () => [...tail, live])
    expect(profile(s).character).toBe('Героиня')
    expect(idx(s)).toBe(after('1_1_town'))
    expect(s.logState().session.zones.map((z) => z.areaId)).toEqual(['1_1_1', '1_1_town'])
  })

  it('пустой журнал: зоны нет — в режиме «авто» гид ждёт зону кампании', async () => {
    const s = await start([])
    expect(s.state().guide).toEqual({ visible: false, hidden: 'noZone', forced: false })
    expect(s.state().zone).toBeNull()
  })
})

describe('режим показа гида', () => {
  it('авто / всегда / никогда — в своём файле; хоткей показывает и при «никогда»', async () => {
    const g = gameLog('en')
    const s = await start([g.login(), g.area('1_1_town')])
    expect(s.state().guide.hidden).toBe('zone')
    let st = await s.setConfig({ show: 'always' })
    expect(st.guide.visible).toBe(true)
    st = await s.setConfig({ show: 'never' })
    expect(st.guide).toEqual({ visible: false, hidden: 'never', forced: false })
    st = await s.toggleGuide()
    expect(st.guide.visible).toBe(true)
    await s.flush()
    const file = JSON.parse(await fs.readFile(path.join(dir, 'leveling.json'), 'utf8'))
    expect(file.config).toMatchObject({ show: 'never' })
    expect(file.version).toBe(2)
  })

  it('файл S14: «гид поверх игры» выключен → «никогда», включён → «авто»', async () => {
    await fs.writeFile(path.join(dir, 'leveling.json'), JSON.stringify({ version: 1, config: { overlay: false, collapsed: true } }))
    let s = await make()
    expect(s.state().config).toEqual({ show: 'never', collapsed: true, pos: null })
    await fs.writeFile(path.join(dir, 'leveling.json'), JSON.stringify({ version: 1, config: { overlay: true } }))
    s = await make()
    expect(s.state().config.show).toBe('auto')
    expect(s.state().progress).toMatchObject({ finished: null, showAnyway: false })
  })

  it('«Начать заново (новый персонаж)»: маршрут с начала, первое повышение уровня даёт имя', async () => {
    const g = gameLog('en')
    const s = await start([g.login(), g.area('HideoutSpace', 60), g.area('MapWorldsLair', 77), g.up('Mapper', 'Deadeye', 92)])
    let st = await s.createProfile('Character 2')
    expect(st.progress.finished).toBeNull()
    expect(st.activeId).not.toBe(st.profiles[0].id)
    s.ingestLines([g.login(), g.area('1_1_1', 1), g.up('Fresh', 'Templar', 2)])
    st = s.state()
    expect(st.profiles).toHaveLength(2)
    expect(profile(s)).toMatchObject({ name: 'Fresh', character: 'Fresh' })
  })
})
