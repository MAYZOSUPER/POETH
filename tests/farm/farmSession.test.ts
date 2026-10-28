import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { GAMES, type GameDef } from '@shared/games'
import type { FarmEvent } from '@shared/types/farm'
import { FarmSessionService } from '../../src/main/services/farmSession'
import { setGameLogPath, subscribeGameLog } from '../../src/main/services/gameLog'

// Сервис трекера карт в main (S11b): farm.json, перезапуск приложения (пауза при выходе,
// догонка по хвосту лога), очередь строк во время догонки, строки общего тейлера gameLog.

const at = (hms: string): number => {
  const [h, m, s] = hms.split(':').map(Number)
  return new Date(2026, 9, 28, h, m, s).getTime()
}
const P = (hms: string, level: 'DEBUG' | 'INFO'): string => `2026/10/28 ${hms} 74519921 1186a8a3 [${level} Client 19012] `
const zone = (hms: string, id: string, lvl: number, seed: number): string =>
  `${P(hms, 'DEBUG')}Generating level ${lvl} area "${id}" with seed ${seed}`
const sys = (hms: string, text: string): string => `${P(hms, 'INFO')}: ${text}`

// подпапки, которых нет на диске: автопоиск не тронет настоящий лог игры
const POE1: GameDef = { ...GAMES.poe1, logSubdirs: ['POETH test nowhere farm/logs'] }

let dir = ''
let file = ''
let now = 0
const clock = (): number => now
const services: FarmSessionService[] = []

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-farm-'))
  file = path.join(dir, 'farm.json')
})
afterEach(async () => {
  // отложенные записи farm.json — до удаления папки
  for (const s of services.splice(0)) await s.flush()
  await setGameLogPath('poe1', null)
  await fs.rm(dir, { recursive: true, force: true })
})

function service(): { svc: FarmSessionService; events: FarmEvent[] } {
  const svc = new FarmSessionService(file, clock)
  services.push(svc)
  const events: FarmEvent[] = []
  svc.on('farm', (e: FarmEvent) => events.push(e))
  return { svc, events }
}

const kinds = (ev: FarmEvent[]): string[] => ev.map((e) => (e.type === 'session' ? `session:${e.state}` : e.type))

describe('FarmSessionService — farm.json и перезапуск', () => {
  it('сохраняет историю; после сбоя сессия на паузе с момента сохранения', async () => {
    const a = service()
    await a.svc.load()
    now = at('21:00:00')
    await a.svc.start()
    now = at('21:01:30')
    a.svc.ingestLines([zone('21:01:00', 'HideoutSpace', 60, 1), zone('21:01:10', 'MapWorldsLair', 77, 5)])
    expect(kinds(a.events)).toEqual(['session:start', 'runStart'])
    now = at('21:02:00')
    await a.svc.flush()

    const b = service()
    now = at('21:30:00')
    await b.svc.load()
    const st = b.svc.state()
    expect(st.session?.pausedAt).toBe(at('21:02:00'))
    expect(st.current).toMatchObject({ areaId: 'MapWorldsLair', activeMs: 50_000 })
    expect(st.inside).toBe(false)
    expect(kinds(b.events)).toEqual(['session:pause'])
  })

  it('выход из приложения (suspendSync) → запуск, игрок всё ещё в карте: снова «внутри», без лишнего входа', async () => {
    const a = service()
    await a.svc.load()
    now = at('21:00:00')
    await a.svc.start()
    const tail = [zone('21:00:30', 'HideoutSpace', 60, 1), zone('21:01:00', 'MapWorldsLair', 77, 5)]
    a.svc.ingestLines(tail)
    now = at('21:03:00')
    a.svc.suspendSync()

    const b = service()
    now = at('21:20:00')
    await b.svc.prime(async () => tail)
    let st = b.svc.state()
    expect(st).toMatchObject({ inside: true, ticking: false })
    expect(st.current).toMatchObject({ entries: 1, activeMs: 120_000 })
    expect(st.session?.pausedAt).toBe(at('21:03:00'))
    // «Продолжить» — время карты снова идёт
    await b.svc.resume()
    now = at('21:21:00')
    st = b.svc.state()
    expect(st.current?.activeMs).toBe(180_000)
    expect(st.stats?.durationMs).toBe(4 * 60_000)
  })

  it('вошёл в новую карту, пока приложения не было: строки хвоста после выхода засчитываются', async () => {
    const a = service()
    await a.svc.load()
    now = at('21:00:00')
    await a.svc.start()
    const old = [zone('21:00:30', 'HideoutSpace', 60, 1), zone('21:01:00', 'MapWorldsLair', 77, 5)]
    a.svc.ingestLines(old)
    now = at('21:05:00')
    a.svc.suspendSync()

    const b = service()
    now = at('21:12:00')
    const late = [
      zone('21:06:00', 'HideoutSpace', 60, 1),
      zone('21:07:00', 'MapWorldsCaldera', 78, 6),
      sys('21:08:00', 'Hero has been slain.')
    ]
    await b.svc.prime(async () => [...old, ...late])
    // забег Lair закрыт, Caldera начат с настоящего времени входа, пауза снялась при входе
    expect(kinds(b.events)).toEqual(['session:resume', 'runEnd', 'runStart'])
    const st = b.svc.state()
    expect(st.runs[0]).toMatchObject({ areaId: 'MapWorldsLair', endTs: at('21:05:00'), activeMs: 240_000 })
    expect(st.current).toMatchObject({ areaId: 'MapWorldsCaldera', startTs: at('21:07:00'), deaths: 1, activeMs: 300_000 })
    expect(st.session?.pausedMs).toBe(2 * 60_000)
  })

  it('строки во время догонки ждут в очереди и проходят после неё', async () => {
    const { svc } = service()
    now = at('21:10:00')
    let release: ((lines: string[]) => void) | null = null
    const primed = svc.prime(() => new Promise<string[]>((r) => (release = r)))
    // строки от тейлера приходят, пока хвост лога ещё читается
    svc.ingestLines([zone('21:10:00', 'HideoutSpace', 60, 1), zone('21:10:05', 'MapWorldsCaldera', 78, 6)])
    while (!release) await new Promise((r) => setTimeout(r, 5))
    expect(svc.state().current).toBeNull()
    ;(release as (lines: string[]) => void)([zone('21:09:00', 'MapWorldsLair', 77, 5)])
    await primed
    const st = svc.state()
    expect(st.runs[0]?.areaId).toBe('MapWorldsLair')
    expect(st.current?.areaId).toBe('MapWorldsCaldera')
  })

  it('прибыль забега и настройка виджета сохраняются', async () => {
    const a = service()
    now = at('21:00:00')
    await a.svc.load()
    a.svc.ingestLines([zone('21:00:00', 'MapWorldsLair', 77, 5)])
    const id = a.svc.state().current?.id as string
    expect(await a.svc.setRunProfit(id, { chaos: 42, runs: 1, divineRate: 180 })).toBe(true)
    expect(await a.svc.setRunProfit('нет', { chaos: 1, runs: 1 })).toBe(false)
    await a.svc.setConfig({ overlayWidget: true })
    await a.svc.flush()
    const b = service()
    await b.svc.load()
    expect(b.svc.state().current?.profit).toEqual({ chaos: 42, runs: 1, divineRate: 180 })
    expect(b.svc.state().config.overlayWidget).toBe(true)
  })
})

describe('FarmSessionService на общем тейлере gameLog', () => {
  it('строки Client.txt из общего тейлера → забег', async () => {
    const log = path.join(dir, 'Client.txt')
    await fs.writeFile(log, sys('21:00:00', 'You have entered Highgate.') + '\n', 'utf8')
    await setGameLogPath('poe1', log)
    const { svc, events } = service()
    now = Date.now()
    await svc.load()
    const sub = await subscribeGameLog(POE1, (lines) => svc.ingestLines(lines))
    try {
      expect(sub.logPath).toBe(log)
      await fs.appendFile(log, [zone('21:01:00', 'HideoutSpace', 60, 1), zone('21:02:00', 'MapWorldsLair', 77, 5)].join('\n') + '\n')
      const end = Date.now() + 3000
      while (!events.some((e) => e.type === 'runStart') && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
      expect(kinds(events)).toEqual(['runStart'])
      expect(svc.state().current).toMatchObject({ areaId: 'MapWorldsLair', tier: 10 })
    } finally {
      sub.off()
    }
  })
})
