import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { LevelingStore } from '../../src/main/services/levelingStore'

// Прокачка PoE1 в main (S14): строки Client.txt EN/RU → шаг маршрута, уровень своего персонажа и класс,
// «не по маршруту», персонажи, сохранение userData/leveling.json.

const DATA = path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json')
const P = (level: 'DEBUG' | 'INFO'): string => `2026/10/28 21:00:00 1000 1186a8a3 [${level} Client 1] `
const zone = (id: string, lvl = 1): string => `${P('DEBUG')}Generating level ${lvl} area "${id}" with seed 7`
const sys = (text: string): string => `${P('INFO')}: ${text}`

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-leveling-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const make = (): LevelingStore => new LevelingStore(path.join(dir, 'leveling.json'), DATA, () => 1000)

describe.each([
  ['EN', 'Hero (Witch) is now level 2', 'Ally (Marauder) is now level 9', 'Witch'],
  ['RU', 'Героиня (Ведьма) достигает 2 уровня', 'Союзник (Дикарь) достигает 9 уровня', 'Ведьма']
] as const)('журнал %s', (_l, mine, other, cls) => {
  it('вход в зоны двигает шаг; уровень и класс — только своего персонажа', async () => {
    const s = make()
    await s.load()
    s.ingestLines([sys(mine), zone('1_1_town'), zone('1_1_2', 2)])
    let st = s.state()
    expect(st.progress.level).toBe(2)
    expect(st.profiles[0]).toMatchObject({ className: cls })
    expect(st.progress.done['a1-002']).toBeDefined()
    expect(st.progress.areaId).toBe('1_1_2')
    // повышение уровня другого игрока в группе — не наше
    s.ingestLines([sys(other)])
    st = s.state()
    expect(st.progress.level).toBe(2)
    expect(st.offRoute).toBeNull()
  })
})

describe('LevelingStore', () => {
  it('«не по маршруту» и «перейти к шагу»', async () => {
    const s = make()
    await s.load()
    s.ingestLines([zone('1_2_2', 15)])
    const off = s.state().offRoute
    expect(off).not.toBeNull()
    const st = await s.act({ type: 'jump', index: off! })
    expect(st.offRoute).toBeNull()
    expect(Object.keys(st.progress.done).length).toBe(off)
  })

  it('персонажи: свой прогресс у каждого, вариант маршрута, сохранение', async () => {
    const s = make()
    await s.load()
    await s.act({ type: 'next' })
    let st = await s.createProfile('Второй')
    expect(st.profiles).toHaveLength(2)
    expect(Object.keys(st.progress.done)).toEqual([])
    st = await s.setVariant({ bandit: 'alira', leagueStart: false })
    expect(st.progress.variant).toEqual({ leagueStart: false, bandit: 'alira' })
    st = await s.setConfig({ overlay: false, pos: { x: 0.02, y: 0.1 } })
    await s.flush()
    const again = make()
    await again.load()
    const st2 = again.state()
    expect(st2.profiles.map((p) => p.name)).toEqual(['Персонаж 1', 'Второй'])
    expect(st2.config).toEqual({ overlay: false, collapsed: false, pos: { x: 0.02, y: 0.1 } })
    st = await again.selectProfile(st2.profiles[0].id)
    expect(Object.keys(st.progress.done)).toEqual(['a1-001'])
  })
})
