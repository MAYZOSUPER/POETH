import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { FARM_RUNS_LIMIT, FarmTracker, cleanProfit, normalizeFarmData } from '@shared/farm/tracker'
import { profitCells } from '../../src/renderer/src/panels/farm/format'
import type { FarmEvent } from '@shared/types/farm'

// Забеги и сессия фарма (S11b) на синтетических логах EN и RU (tests/farm/fixtures, ники
// вымышленные): порталы туда-обратно и перезаход после смерти — один забег, новая карта того же
// типа (другой seed) — новый, побочная область — часть забега, смерти, пауза, «Стоп».

const FIX = path.join(__dirname, 'fixtures')
const fixture = (lang: 'en' | 'ru'): string[] =>
  readFileSync(path.join(FIX, `client-farm-${lang}.txt`), 'utf8').split(/\r?\n/).filter(Boolean)

/** 21:01:00 28.10.2026 по локальному времени (как в строках лога). */
const at = (hms: string): number => {
  const [h, m, s] = hms.split(':').map(Number)
  return new Date(2026, 9, 28, h, m, s).getTime()
}
const P = (hms: string, level: 'DEBUG' | 'INFO'): string => `2026/10/28 ${hms} 74519921 1186a8a3 [${level} Client 19012] `
const zone = (hms: string, id: string, lvl: number, seed: number | string): string =>
  `${P(hms, 'DEBUG')}Generating level ${lvl} area "${id}" with seed ${seed}`
const sys = (hms: string, text: string): string => `${P(hms, 'INFO')}: ${text}`

/** Строки фикстуры до (не включая) первой строки с временем `hms` и остальные. */
function splitAt(lines: string[], hms: string): [string[], string[]] {
  const i = lines.findIndex((l) => l.slice(11, 19) >= hms)
  return i < 0 ? [lines, []] : [lines.slice(0, i), lines.slice(i)]
}

const types = (ev: FarmEvent[]): string[] => ev.map((e) => (e.type === 'session' ? `session:${e.state}` : e.type))

describe.each([
  ['en', 'Strand', 'Bunker'],
  ['ru', 'Побережье', 'Бункер']
] as const)('синтетический лог %s', (lang, strand, bunker) => {
  const lines = fixture(lang)

  it('забеги: порталы и смерть — один забег, новый seed — новый, переход runEnd → runStart', () => {
    const tr = new FarmTracker()
    const ev = tr.ingestLines(lines, at('22:00:00'))
    expect(types(ev)).toEqual(['runStart', 'runEnd', 'runStart', 'runEnd', 'runStart'])

    // переход Strand(111) → Strand(222): конец первого — последний выход, событие — при входе
    const end1 = ev[1] as Extract<FarmEvent, { type: 'runEnd' }>
    expect(end1.at).toBe(at('21:10:00'))
    expect(end1.run.endTs).toBe(at('21:09:00'))
    expect(ev[2].type === 'runStart' && ev[2].run.seed).toBe('222')

    const st = tr.snapshot(at('22:00:00'))
    const [run2, run1] = st.runs
    expect(run1).toMatchObject({
      areaId: 'MapWorldsStrand',
      areaName: strand,
      kind: 'map',
      areaLevel: 83,
      tier: 16,
      seed: '111',
      startTs: at('21:01:00'),
      endTs: at('21:09:00'),
      // вход + перезаход после смерти + портал обратно; возврат из побочной области — не вход
      entries: 3,
      deaths: 1,
      sessionId: null
    })
    // 21:01:00–21:03:05 + 21:03:30–21:07:00 (с побочной областью) + 21:07:30–21:09:00
    expect(run1.activeMs).toBe((125 + 210 + 90) * 1000)

    // смерть участника группы в той же зоне тоже считается
    expect(run2).toMatchObject({ tier: 15, areaLevel: 82, entries: 2, deaths: 2, endTs: at('21:20:00') })
    expect(run2.activeMs).toBe((310 + 240) * 1000)

    // ограбление из Rogue Harbour — прочий контент, забег ещё открыт
    expect(st.current).toMatchObject({ areaId: 'HeistBunker9', areaName: bunker, kind: 'other', tier: null, endTs: null })
    expect(st.current?.activeMs).toBe(480 * 1000)
    expect(st.inside).toBe(false)
    expect(st.ticking).toBe(false)
    expect(st.location).toMatchObject({ kind: 'town', areaId: 'HeistHub' })
    expect(st.session).toBeNull()
    expect(st.stats).toBeNull()
  })

  it('сессия с паузой внутри карты: время карты и сессии без паузы, «Стоп» закрывает забег', () => {
    const tr = new FarmTracker()
    expect(types(tr.startSession(at('20:59:00')))).toEqual(['session:start'])
    const [before, after] = splitAt(lines, '21:11:00')
    tr.ingestLines(before, 0)
    expect(types(tr.pauseSession(at('21:11:00')))).toEqual(['session:pause'])
    expect(tr.snapshot(at('21:11:30')).ticking).toBe(false)
    expect(tr.snapshot(at('21:11:30')).current?.activeMs).toBe(60_000)
    expect(types(tr.resumeSession(at('21:12:00')))).toEqual(['session:resume'])
    tr.ingestLines(after, 0)

    const stop = tr.stopSession(at('21:31:00'))
    expect(types(stop)).toEqual(['runEnd', 'session:stop'])
    // игрок уже вышел из ограбления — конец забега = последний выход
    expect(stop[0].type === 'runEnd' && stop[0].run.endTs).toBe(at('21:30:00'))

    const st = tr.snapshot(at('21:40:00'))
    expect(st.session).toBeNull()
    expect(st.current).toBeNull()
    expect(st.runs.map((r) => r.activeMs)).toEqual([480_000, 490_000, 425_000])
    expect(st.runs.every((r) => r.sessionId === st.sessions[0].id)).toBe(true)
    const s = st.sessions[0]
    expect(s.pausedMs).toBe(60_000)
    expect(s.stats).toMatchObject({
      durationMs: 31 * 60_000,
      maps: 2,
      runs: 3,
      avgMapMs: (425_000 + 490_000) / 2,
      fastestMapMs: 425_000,
      deaths: 3,
      // смерти были в обеих картах; в ограблении — нет
      mapsWithDeaths: 2,
      profitChaos: null,
      profitPerHour: null
    })
    expect(s.stats.mapsPerHour).toBeCloseTo(2 / (31 / 60), 6)
  })
})

describe('FarmTracker — сессия', () => {
  it('пауза снимается сама при входе в карту (игрок вернулся к игре)', () => {
    const tr = new FarmTracker()
    tr.ingestLines([zone('21:00:00', 'HideoutSpace', 60, 1)], 0)
    tr.startSession(at('21:00:10'))
    tr.pauseSession(at('21:00:30'))
    const ev = tr.ingestLines([zone('21:01:00', 'MapWorldsLair', 77, 5)], 0)
    expect(types(ev)).toEqual(['session:resume', 'runStart'])
    const st = tr.snapshot(at('21:02:00'))
    expect(st.session).toMatchObject({ pausedAt: null, pausedMs: 30_000 })
    expect(st.ticking).toBe(true)
    expect(st.current?.activeMs).toBe(60_000)
    expect(st.stats?.durationMs).toBe(110_000 - 30_000)
  })

  it('пауза в карте: смерти считаются, время нет; «Стоп» внутри — конец сейчас, перезаход — новый забег', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:00:00', 'HideoutSpace', 60, 1), zone('21:01:00', 'MapWorldsLair', 77, 5)], 0)
    tr.pauseSession(at('21:02:00'))
    tr.ingestLines([sys('21:02:30', 'Hero has been slain.')], 0)
    expect(tr.snapshot(at('21:05:00')).current).toMatchObject({ deaths: 1, activeMs: 60_000 })
    const stop = tr.stopSession(at('21:05:00'))
    expect(stop[0].type === 'runEnd' && stop[0].run).toMatchObject({ endTs: at('21:05:00'), activeMs: 60_000 })
    // 21:00–21:02 до паузы, пауза до «Стоп»
    expect(tr.snapshot(at('21:05:00')).sessions[0].stats).toMatchObject({ durationMs: 120_000, maps: 1, deaths: 1 })
    // тот же экземпляр после «Стоп» — уже новый забег (без сессии)
    const again = tr.ingestLines([zone('21:06:00', 'HideoutSpace', 60, 1), zone('21:06:10', 'MapWorldsLair', 77, 5)], 0)
    expect(types(again)).toEqual(['runStart'])
    expect(tr.snapshot(at('21:06:10')).current?.sessionId).toBeNull()
  })

  it('«Начать» посреди карты — текущий забег идёт в сессию; повторное «Начать» ничего не делает', () => {
    const tr = new FarmTracker()
    tr.ingestLines([zone('21:01:00', 'MapWorldsLair', 77, 5)], 0)
    tr.startSession(at('21:02:00'))
    expect(tr.startSession(at('21:03:00'))).toEqual([])
    const st = tr.snapshot(at('21:03:00'))
    expect(st.current?.sessionId).toBe(st.session?.id)
    expect(st.stats).toMatchObject({ maps: 1, runs: 1, avgMapMs: null, mapsPerHour: 1 / (1 / 60) })
  })

  it('«Начать» в убежище с открытым прошлым забегом: он закрывается до сессии и в неё не идёт', () => {
    const tr = new FarmTracker()
    tr.ingestLines([zone('20:00:00', 'MapWorldsLair', 77, 5), zone('20:08:00', 'HideoutSpace', 60, 1)], 0)
    const ev = tr.startSession(at('20:40:00'))
    expect(types(ev)).toEqual(['runEnd', 'session:start'])
    expect(ev[0].type === 'runEnd' && ev[0].run).toMatchObject({ endTs: at('20:08:00'), sessionId: null })
    tr.ingestLines([zone('20:41:00', 'MapWorldsCaldera', 78, 6)], 0)
    const st = tr.snapshot(at('20:42:00'))
    expect(st.stats).toMatchObject({ maps: 1, runs: 1 })
    expect(st.current?.sessionId).toBe(st.session?.id)
  })

  it('кнопки без сессии — без событий', () => {
    const tr = new FarmTracker()
    expect(tr.pauseSession(1)).toEqual([])
    expect(tr.resumeSession(1)).toEqual([])
    expect(tr.stopSession(1)).toEqual([])
  })
})

describe('FarmTracker — прибыль от S11a и история', () => {
  it('прибыль забега → прибыль и доход в час сессии; убыток допустим', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    const ev = tr.ingestLines(
      [
        zone('21:00:00', 'MapWorldsLair', 77, 5),
        zone('21:10:00', 'HideoutSpace', 60, 1),
        zone('21:11:00', 'MapWorldsCaldera', 78, 6)
      ],
      0
    )
    const first = (ev.find((e) => e.type === 'runEnd') as Extract<FarmEvent, { type: 'runEnd' }>).run
    const second = (ev.find((e) => e.type === 'runStart' && e.run.seed === '6') as Extract<FarmEvent, { type: 'runStart' }>).run
    expect(tr.setRunProfit(first.id, { chaos: 120, runs: 1, divineRate: 180 })).toBe(true)
    expect(tr.setRunProfit(second.id, { chaos: -20, runs: 1 })).toBe(true)
    expect(tr.setRunProfit('нет-такого', { chaos: 1, runs: 1 })).toBe(false)
    expect(tr.snapshot(at('21:30:00')).runs[0].profit).toEqual({ chaos: 120, runs: 1, divineRate: 180 })
    const stats = tr.snapshot(at('21:30:00')).stats
    expect(stats?.profitChaos).toBe(100)
    expect(stats?.profitPerHour).toBeCloseTo(100 * 2, 6)
    expect(tr.setRunProfit(first.id, null)).toBe(true)
    expect(tr.snapshot(at('21:30:00')).stats?.profitChaos).toBe(-20)
  })

  it('история ограничена, удаление и очистка не трогают открытый забег', () => {
    const tr = new FarmTracker()
    const lines: string[] = []
    for (let i = 0; i < FARM_RUNS_LIMIT + 5; i++) {
      lines.push(zone('21:00:00', 'HideoutSpace', 60, 1), zone('21:00:00', 'MapWorldsLair', 77, 1000 + i))
    }
    tr.ingestLines(lines, 0)
    const st = tr.snapshot(0)
    expect(st.runs).toHaveLength(FARM_RUNS_LIMIT)
    expect(tr.snapshot(0, 10).runs).toHaveLength(10)
    expect(tr.removeRun(st.runs[0].id)).toBe(true)
    expect(tr.removeRun(st.runs[0].id)).toBe(false)
    tr.clearHistory()
    expect(tr.snapshot(0).runs).toEqual([])
    expect(tr.snapshot(0).current?.seed).toBe(String(1000 + FARM_RUNS_LIMIT + 4))
  })
})

describe('прибыль группой (S11a: снимок тайника между картами не успел)', () => {
  it('cleanProfit: runs ≥ 1, курс и «мало сделок» — только корректные', () => {
    expect(cleanProfit({ chaos: 50 })).toEqual({ chaos: 50, runs: 1 })
    expect(cleanProfit({ chaos: 90, runs: 3.7, divineRate: 175, low: true })).toEqual({ chaos: 90, runs: 3, divineRate: 175, low: true })
    expect(cleanProfit({ chaos: 10, runs: 0, divineRate: -1, low: 'да' })).toEqual({ chaos: 10, runs: 1 })
    expect(cleanProfit({ chaos: Number.NaN, runs: 1 })).toBeNull()
    expect(cleanProfit(null)).toBeNull()
  })

  it('группа из 3 карт: сумма на последней, у двух предыдущих — доля; без прибыли — «считаем…»', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    const lines: string[] = []
    for (let i = 0; i < 5; i++) lines.push(zone(`21:${10 + i * 5}:00`, 'MapWorldsLair', 77, 100 + i), zone(`21:${12 + i * 5}:00`, 'HideoutSpace', 60, 1))
    lines.push(zone('21:40:00', 'MapWorldsLair', 77, 200))
    tr.ingestLines(lines, 0)
    // свежие сверху: [r4, r3, r2, r1, r0]
    const runs = tr.snapshot(at('21:41:00')).runs
    expect(runs).toHaveLength(5)
    tr.setRunProfit(runs[1].id, { chaos: 90, runs: 3, low: true }) // r3 за r1…r3
    tr.setRunProfit(runs[4].id, { chaos: 20, runs: 1 }) // r0
    const st = tr.snapshot(at('21:41:00'))
    const cells = profitCells(st.runs)
    expect(st.runs.map((r) => cells.get(r.id))).toEqual([
      { kind: 'pending' },
      { kind: 'group', chaos: 90, share: 30, runs: 3, low: true },
      { kind: 'inGroup', share: 30, runs: 3, low: true },
      { kind: 'inGroup', share: 30, runs: 3, low: true },
      { kind: 'own', chaos: 20, low: false }
    ])
    // в сумме сессии группа — один раз
    expect(st.stats?.profitChaos).toBe(110)
  })
})

describe('FarmTracker — сохранение и перезапуск', () => {
  it('toData → normalizeFarmData: то же состояние; мусор — пустое', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    tr.ingestLines(fixture('en'), 0)
    tr.setConfig({ overlayWidget: true, widgetPos: { x: 0.3, y: 0.02 } })
    const copy = new FarmTracker(normalizeFarmData(JSON.parse(JSON.stringify(tr.toData(at('21:31:00'))))))
    expect(copy.snapshot(at('21:40:00'))).toEqual(tr.snapshot(at('21:40:00')))
    expect(copy.toData().savedAt).toBe(at('21:31:00'))
    expect(copy.snapshot(0).config).toEqual({ overlayWidget: true, widgetPos: { x: 0.3, y: 0.02 } })
    // позиция за пределами окна — к краю, мусор — по умолчанию (сверху по центру)
    tr.setConfig({ widgetPos: { x: 1.4, y: -1 } })
    expect(tr.snapshot(0).config.widgetPos).toEqual({ x: 1, y: 0 })
    tr.setConfig({ widgetPos: { x: Number.NaN, y: 0.5 } })
    expect(tr.snapshot(0).config.widgetPos).toBeNull()
    const empty = normalizeFarmData({ runs: 'x', current: { id: 1 }, session: {}, config: null })
    expect(new FarmTracker(empty).snapshot(5)).toMatchObject({
      runs: [],
      current: null,
      session: null,
      config: { overlayWidget: false, widgetPos: null }
    })
  })

  it('выход из приложения в карте: сессия на паузу; при запуске игрок ещё в карте — снова «внутри»', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:01:00', 'MapWorldsLair', 77, 5)], 0)
    expect(types(tr.suspend(at('21:03:00')))).toEqual(['session:pause'])
    let st = tr.snapshot(at('21:10:00'))
    expect(st).toMatchObject({ inside: false, ticking: false })
    expect(st.current?.activeMs).toBe(120_000)
    // другой экземпляр — не «внутри»
    expect(tr.markInside({ areaId: 'MapWorldsLair', level: 77, seed: '6' }, at('21:10:00'))).toBe(false)
    expect(tr.markInside({ areaId: 'MapWorldsLair', level: 77, seed: '5' }, at('21:10:00'))).toBe(true)
    st = tr.snapshot(at('21:10:00'))
    expect(st).toMatchObject({ inside: true, ticking: false })
    tr.resumeSession(at('21:10:00'))
    expect(tr.snapshot(at('21:11:00')).current?.activeMs).toBe(180_000)
  })
})
