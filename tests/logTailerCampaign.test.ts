import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { LogTailer } from '../src/main/services/logTailer'
import type { BossIndex, BossQuestRef } from '../src/main/services/bossMatcher'

// Регресс кампании PoE2 при обобщении тейлера (интеграция S8): тейлер по умолчанию (как
// его создаёт домен кампании) должен давать те же зоны, уровни и боссов, что и до патча.
// Тест написан и прогнан на коде ДО патча logTailer, затем — после.

const P = '2026/10/28 21:40:00 123456 abcd [INFO Client 4242]'

function index(): BossIndex {
  const ref: BossQuestRef = { questId: 'act1-geonor', actId: 'act-1', name: 'Count Geonor' }
  return { exact: new Map([['count geonor', ref]]), entries: [{ norm: 'count geonor', ref }] }
}

const tailers: LogTailer[] = []
afterEach(() => {
  for (const t of tailers.splice(0)) t.stop()
})

describe('LogTailer (PoE2, кампания) — регресс', () => {
  it('хвост файла: текущая зона и уровень; живые строки: зоны, уровень, босс один раз', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-campaign-'))
    const file = path.join(dir, 'Client.txt')
    await fs.writeFile(
      file,
      [
        `${P} Generating level 1 area "G1_1" with seed 1`,
        `${P} : Hero (Mercenary) is now level 2`,
        // босс в истории файла не должен засчитываться при старте
        `${P} Count Geonor: Old fight from yesterday.`,
        `${P} Generating level 3 area "G1_2_" with seed 2`,
        `${P} : Hero (Mercenary) is now level 3`,
        ''
      ].join('\n'),
      'utf8'
    )

    const t = new LogTailer()
    tailers.push(t)
    t.setBossIndex(index())
    const events: [string, unknown][] = []
    t.on('zone', (e: { areaId?: string; areaName?: string }) => events.push(['zone', e.areaId ?? e.areaName]))
    t.on('level', (e: { character: string; level: number }) => events.push(['level', `${e.character}:${e.level}`]))
    t.on('boss', (e: { questId: string }) => events.push(['boss', e.questId]))

    const status = await t.start(file)
    expect(status.found).toBe(true)
    expect(status.logPath).toBe(file)
    expect(events).toEqual([
      ['zone', 'g1_2'],
      ['level', 'Hero:3']
    ])

    events.length = 0
    await fs.appendFile(
      file,
      [
        `${P} Generating level 5 area "G1_3" with seed 3`,
        `${P} : Hero (Spirit Walker) is now level 4`,
        `${P} Count Geonor: You dare enter my domain?`,
        `${P} Count Geonor: Kneel!`, // повтор — антидребезг
        `${P} : Hero has been slain.`, // смерть игрока — не босс
        `${P} @From Someone: hi`, // whisper — не босс
        `${P} [SCENE] Set Source [Act 1]`, // титул акта — не зона
        `${P} Generating level 5 area "G1_3" with seed 4`, // та же зона — без повтора
        ''
      ].join('\n'),
      'utf8'
    )
    await new Promise((r) => setTimeout(r, 1600))
    expect(events).toEqual([
      ['zone', 'g1_3'],
      ['level', 'Hero:4'],
      ['boss', 'act1-geonor']
    ])
    t.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('[SCENE] без id зоны — зона по имени', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-campaign-'))
    const file = path.join(dir, 'Client.txt')
    await fs.writeFile(file, `${P} [SCENE] Set Source [Clearfell]\n`, 'utf8')
    const t = new LogTailer()
    tailers.push(t)
    const zones: unknown[] = []
    t.on('zone', (e: { areaId?: string; areaName?: string }) => zones.push(e.areaName))
    await t.start(file)
    expect(zones).toEqual(['Clearfell'])
    t.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
})
