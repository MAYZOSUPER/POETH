import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { FARM_FINDS_LIMIT, FarmTracker, cleanFindInput, cleanSessionProfit, normalizeFarmData } from '@shared/farm/tracker'
import { POE1_FARM_RULES, parseFarmLine, parseFarmText } from '@shared/farm/zones'
import {
  classifyPoe2Fallback,
  normalizePoe2FarmAreas,
  poe2FarmRules,
  type Poe2FarmAreas
} from '@shared/farm/zonesPoe2'
import type { FarmEvent, FarmFindResult } from '@shared/types/farm'

// Трекер карт PoE 2 (S69) на синтетических журналах EN и RU (tests/farm/fixtures/client-poe2-farm-*.txt,
// ники и имена вымышленные): ярус T1–T16, смерть не закрывает карту (воскрешение — та же строка входа с тем
// же seed), подобласти (Abyssal Depths, пещера Экспедиции), башня, остров, MapHideout*_Claimable — карта,
// «+ находка» и прибыль сессии для «Богатства» (S70). Виды областей — настоящий areas.json из данных.

const AREAS = normalizePoe2FarmAreas(
  JSON.parse(readFileSync(path.join(__dirname, '../../resources/data/poe2/farm/areas.json'), 'utf8'))
) as Poe2FarmAreas
const RULES = poe2FarmRules(AREAS)

const FIX = path.join(__dirname, 'fixtures')
const fixture = (lang: 'en' | 'ru'): string[] =>
  readFileSync(path.join(FIX, `client-poe2-farm-${lang}.txt`), 'utf8').split(/\r?\n/).filter(Boolean)

const at = (hms: string): number => {
  const [h, m, s] = hms.split(':').map(Number)
  return new Date(2026, 10, 1, h, m, s).getTime()
}
const P = (hms: string, level: 'DEBUG' | 'INFO'): string => `2026/11/01 ${hms} 100000001 2caa22d2 [${level} Client 4380] `
const zone = (hms: string, id: string, lvl: number, seed: number): string =>
  `${P(hms, 'DEBUG')}Generating level ${lvl} area "${id}" with seed ${seed}`
const types = (ev: FarmEvent[]): string[] => ev.map((e) => (e.type === 'session' ? `session:${e.state}` : e.type))
const MIN = 60_000

describe('данные областей PoE 2 (resources/data/poe2/farm/areas.json)', () => {
  it('файл читается, виды — из RePoE: карты, башни, острова, подобласти, убежища, города', () => {
    expect(AREAS).not.toBeNull()
    expect(AREAS.tier).toEqual({ base: 64, max: 16 })
    const kind = (id: string, lvl = 70): string => RULES.classify(id, lvl)
    expect(kind('MapBluff')).toBe('map')
    expect(kind('MapPrecursorTowerDesert')).toBe('map')
    expect(kind('MapUberBoss_IronCitadel')).toBe('map')
    expect(kind('ExpeditionLogBook_Tundra')).toBe('map')
    // ловушка: на атласе это карта, а не убежище
    expect(kind('MapHideoutFarmlands_Claimable')).toBe('map')
    expect(kind('HideoutFelled')).toBe('hideout')
    expect(kind('G_Endgame_Town')).toBe('town')
    expect(kind('G1_town')).toBe('town')
    expect(kind('Abyss_Hub')).toBe('town')
    expect(kind('Abyss_Depths2')).toBe('sub')
    expect(kind('ExpeditionSubArea_Cavern')).toBe('sub')
    expect(kind('IncursionTemplePresent')).toBe('sub')
    // пиннаклы и испытания — не карты
    expect(kind('MapUberBoss_Monolith')).toBe('other')
    expect(kind('BreachDomain_01')).toBe('other')
    expect(kind('Sanctum_1')).toBe('other')
    expect(kind('Delirium_Act1Town')).toBe('other')
    expect(kind('G2_4_1', 21)).toBe('campaign')
    expect(kind('P1_3', 55)).toBe('campaign')
    // карта мира и экраны — сцены, а не имена областей (EN и RU)
    for (const n of ['Atlas', 'Act 1', 'Interlude', 'Акт 1', '(null)', '(unknown)']) expect(RULES.isAreaName(n)).toBe(false)
    expect(RULES.isAreaName('Bluff')).toBe(true)
  })

  it('новые id (до пересборки к 1.0) — по шаблонам', () => {
    expect(classifyPoe2Fallback('MapNewRuins', 72)).toBe('map')
    expect(classifyPoe2Fallback('MapHideoutNew_Claimable', 70)).toBe('map')
    expect(classifyPoe2Fallback('MapHideoutAct5_Claimable', 58)).toBe('campaign')
    expect(classifyPoe2Fallback('HideoutNewOne', 65)).toBe('hideout')
    expect(classifyPoe2Fallback('G5_town', 60)).toBe('town')
    expect(classifyPoe2Fallback('G5_3', 60)).toBe('campaign')
    expect(classifyPoe2Fallback('Abyss_Depths4', 75)).toBe('sub')
    expect(classifyPoe2Fallback('ExpeditionLogBook_Newisle', 70)).toBe('map')
    expect(classifyPoe2Fallback('SomethingNew', 70)).toBe('other')
    // без данных — те же шаблоны и ярус по умолчанию
    const bare = poe2FarmRules(null)
    expect(bare.classify('MapBluff', 70)).toBe('map')
    expect(bare.tier(65)).toBe(1)
  })

  it('битый файл данных — null; лишнее отброшено', () => {
    expect(normalizePoe2FarmAreas(null)).toBeNull()
    expect(normalizePoe2FarmAreas({ version: 2, kinds: {} })).toBeNull()
    const d = normalizePoe2FarmAreas({
      version: 1,
      kinds: { map: ['MapA', 'bad id', 7], wat: ['X'] },
      sceneIgnore: ['Atlas', '', 5],
      tier: { base: -1, max: 16 }
    })
    expect(d).toEqual({ version: 1, source: '', kinds: { map: ['MapA'] }, sceneIgnore: ['Atlas'] })
  })

  it('ярус путевого камня: уровень − 64, T1 = 65 … T16 = 80', () => {
    expect(RULES.tier(64)).toBeNull()
    expect(RULES.tier(65)).toBe(1)
    expect(RULES.tier(79)).toBe(15)
    expect(RULES.tier(80)).toBe(16)
    expect(RULES.tier(82)).toBe(16)
  })
})

describe('строки журнала PoE 2', () => {
  it('смерть EN/RU: «has been slain», «has committed suicide», «был повержен», «покончил с собой»', () => {
    expect(parseFarmText(': Testhero has been slain.', RULES)).toEqual({ type: 'death', player: 'Testhero' })
    expect(parseFarmText(': Testhero has committed suicide.', RULES)).toEqual({ type: 'death', player: 'Testhero' })
    expect(parseFarmText(': Тестгерой был повержен.', RULES)).toEqual({ type: 'death', player: 'Тестгерой' })
    expect(parseFarmText(': Тестгерой покончил с собой', RULES)).toEqual({ type: 'death', player: 'Тестгерой' })
    // whisper — не системное сообщение
    expect(parseFarmText('@From Testbuyer: Testhero has been slain.', RULES)).toBeNull()
    // PoE 1 — как было: самоубийство не считаем
    expect(parseFarmText(': Testhero has committed suicide.', POE1_FARM_RULES)).toBeNull()
    expect(parseFarmText(': Testhero has committed suicide.')).toBeNull()
  })

  it('сцена: Atlas и Act N — не имя области; имя области — на языке клиента', () => {
    expect(parseFarmText('[SCENE] Set Source [Atlas]', RULES)).toBeNull()
    expect(parseFarmText('[SCENE] Set Source [(unknown)]', RULES)).toBeNull()
    expect(parseFarmText('[SCENE] Set Source [Утёс]', RULES)).toEqual({ type: 'areaName', name: 'Утёс' })
    // PoE 1 — как было
    expect(parseFarmText('[SCENE] Set Source [Atlas]')).toEqual({ type: 'areaName', name: 'Atlas' })
  })

  it('вход в область — та же строка, что в PoE 1 (EN и RU)', () => {
    const p = parseFarmLine(zone('21:01:00', 'MapBluff', 79, 101), RULES)
    expect(p).toEqual({ ts: at('21:01:00'), event: { type: 'zone', zone: { areaId: 'MapBluff', level: 79, seed: '101' } } })
  })
})

describe.each([
  ['en', 'Bluff', 'Precursor Tower', 'Frigid Bluffs', 'Farmlands Hideout'],
  ['ru', 'Утёс', 'Башня Предтеч', 'Холодные скалы', 'Убежище на полях']
] as const)('синтетический журнал PoE 2 %s', (lang, bluff, tower, island, claim) => {
  const lines = fixture(lang)

  it('забеги, ярусы, смерти, порталы и подобласти', () => {
    const tr = new FarmTracker(undefined, RULES)
    const ev = tr.ingestLines(lines, at('22:00:00'))
    expect(types(ev)).toEqual(['runStart', 'runEnd', 'runStart', 'runEnd', 'runStart', 'runEnd', 'runStart', 'runEnd', 'runStart'])
    const st = tr.snapshot(at('21:32:00'))
    expect(st.game).toBe('poe2')
    const [claimRun, islandRun, towerRun, bluffRun] = st.runs
    // карта: смерть и воскрешение, Abyssal Depths, портал в убежище и обратно — один забег
    expect(bluffRun).toMatchObject({
      areaId: 'MapBluff',
      areaName: bluff,
      kind: 'map',
      areaLevel: 79,
      tier: 15,
      seed: '101',
      startTs: at('21:01:00'),
      endTs: at('21:10:00'),
      entries: 2,
      deaths: 1,
      activeMs: 7 * MIN + 90_000
    })
    // башня — своя карта T16, самоубийство — смерть
    expect(towerRun).toMatchObject({ areaId: 'MapPrecursorTowerDesert', areaName: tower, kind: 'map', tier: 16, deaths: 1, entries: 1, activeMs: 7 * MIN })
    // остров Экспедиции — карта атласа, пещера — часть забега
    expect(islandRun).toMatchObject({ areaId: 'ExpeditionLogBook_Tundra', areaName: island, kind: 'map', tier: 11, entries: 1, activeMs: 6 * MIN })
    // MapHideout*_Claimable — карта (T4), смерть союзника в зоне считается
    expect(claimRun).toMatchObject({ areaId: 'MapHideoutFarmlands_Claimable', areaName: claim, kind: 'map', tier: 4, deaths: 1 })
    // новый экземпляр того же вида карты — новый забег T2, игрок внутри
    expect(st.current).toMatchObject({ areaId: 'MapBluff', seed: '505', tier: 2, entries: 1 })
    expect(st.inside).toBe(true)
  })

  it('сессия: карт в час, среднее время, смерти — как у PoE 1', () => {
    const tr = new FarmTracker(undefined, RULES)
    tr.startSession(at('20:59:00'))
    tr.ingestLines(lines, at('22:00:00'))
    const stop = tr.stopSession(at('21:33:00'))
    expect(types(stop)).toEqual(['runEnd', 'session:stop'])
    const s = tr.snapshot(at('21:33:00')).sessions[0]
    expect(s.stats).toMatchObject({
      maps: 5,
      runs: 5,
      deaths: 3,
      mapsWithDeaths: 3,
      // «Стоп» закрыл и последнюю карту (2 мин)
      avgMapMs: ((8.5 + 7 + 6 + 4 + 2) * MIN) / 5,
      fastestMapMs: 2 * MIN,
      // находок и прибыли ещё нет
      finds: 0,
      findsEx: null,
      profitEx: null,
      exPerHour: null
    })
    expect(s.stats.mapsPerHour).toBeCloseTo(5 / (34 / 60), 6)
  })
})

describe('подобласть PoE 2 через убежище', () => {
  const base = (): FarmTracker => {
    const tr = new FarmTracker(undefined, RULES)
    tr.ingestLines(
      [
        zone('21:00:00', 'HideoutFelled', 65, 1),
        zone('21:01:00', 'MapBluff', 79, 101),
        zone('21:03:00', 'Abyss_Depths1', 79, 555),
        zone('21:04:00', 'HideoutFelled', 65, 1)
      ],
      0
    )
    return tr
  }

  it('вернулись в подобласть с новым seed (экземпляр истёк) за 15 мин — та же карта', () => {
    const tr = base()
    const ev = tr.ingestLines([zone('21:10:00', 'Abyss_Depths1', 79, 556)], 0)
    expect(ev).toEqual([])
    expect(tr.snapshot(at('21:11:00')).current).toMatchObject({ areaId: 'MapBluff', entries: 2 })
  })

  it('позже 15 мин — новый забег вида «прочее»', () => {
    const tr = base()
    const ev = tr.ingestLines([zone('21:30:00', 'Abyss_Depths1', 79, 557)], 0)
    expect(types(ev)).toEqual(['runEnd', 'runStart'])
    expect(tr.snapshot(at('21:31:00')).current).toMatchObject({ areaId: 'Abyss_Depths1', kind: 'other', tier: null })
  })

  it('из кампании — не к старой карте', () => {
    const tr = base()
    tr.ingestLines([zone('21:05:00', 'G2_4_1', 21, 9)], 0)
    const ev = tr.ingestLines([zone('21:06:00', 'Abyss_Depths1', 22, 558)], 0)
    expect(types(ev)).toEqual(['runEnd', 'runStart'])
  })
})

describe('«+ находка» и прибыль сессии (API для окна цены и «Богатства» S70)', () => {
  const ok = (r: FarmFindResult): Extract<FarmFindResult, { ok: true }> => {
    if (!r.ok) throw new Error(r.reason)
    return r
  }

  it('находка — к открытому забегу (и в убежище после карты), без забега — noRun', () => {
    const tr = new FarmTracker(undefined, RULES)
    expect(tr.addFind({ ref: 'Divine Orb', valueEx: 560 }, at('21:00:00'))).toEqual({ ok: false, reason: 'noRun' })
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:01:00', 'MapBluff', 79, 101), zone('21:08:00', 'HideoutFelled', 65, 1)], 0)
    // в убежище карта ещё открыта — находка к ней
    const a = ok(tr.addFind({ ref: 'Divine Orb', name: 'Божественная сфера', qty: 1, valueEx: 560, source: 'ctrlD' }, at('21:08:10')))
    const b = ok(tr.addFind({ ref: 'Exalted Orb', qty: 12, valueEx: 12 }, at('21:08:10')))
    expect(a.find).toMatchObject({ ref: 'Divine Orb', name: 'Божественная сфера', qty: 1, valueEx: 560, source: 'ctrlD', at: at('21:08:10') })
    expect(b.find.id).not.toBe(a.find.id)
    expect(b.find.source).toBe('manual')
    ok(tr.addFind({ ref: 'Unknown Waystone', valueEx: null }, at('21:08:20')))
    const st = tr.snapshot(at('21:09:00'))
    expect(st.current?.finds?.map((f) => f.ref)).toEqual(['Divine Orb', 'Exalted Orb', 'Unknown Waystone'])
    expect(st.stats).toMatchObject({ finds: 3, findsEx: 572, profitEx: null })
    expect(st.stats?.exPerHour).toBeCloseTo(572 / (9 / 60), 6)

    // следующая карта: прошлая закрыта, находка без runId — к новой; с runId — к прошлой
    tr.ingestLines([zone('21:10:00', 'MapCrypt', 70, 202)], 0)
    expect(ok(tr.addFind({ ref: 'Chaos Orb', valueEx: 3 }, at('21:11:00'))).runId).toBe(tr.snapshot(0).current?.id)
    const prev = tr.snapshot(0).runs[0].id
    expect(ok(tr.addFind({ ref: 'Chaos Orb', valueEx: 3, runId: prev }, at('21:11:00'))).runId).toBe(prev)
  })

  it('без открытого забега — к последнему забегу идущей сессии', () => {
    const tr = new FarmTracker(undefined, RULES)
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:01:00', 'MapBluff', 79, 101), zone('21:08:00', 'HideoutFelled', 65, 1)], 0)
    tr.endCurrentRun(at('21:09:00'))
    const r = ok(tr.addFind({ ref: 'Divine Orb', valueEx: 560 }, at('21:09:30')))
    expect(r.runId).toBe(tr.snapshot(0).runs[0].id)
  })

  it('неверный ввод — invalid; лимит — full; удаление', () => {
    const tr = new FarmTracker(undefined, RULES)
    tr.ingestLines([zone('21:01:00', 'MapBluff', 79, 101)], 0)
    for (const bad of [null, {}, { ref: '  ' }, { ref: 'A', qty: 0 }, { ref: 'A', qty: 1.5 }, { ref: 'A', valueEx: -1 }, { ref: 'A', valueEx: Infinity }, { ref: 'x'.repeat(201) }, { ref: 'A\u0007' }]) {
      expect(tr.addFind(bad, 1)).toEqual({ ok: false, reason: 'invalid' })
    }
    const first = ok(tr.addFind({ ref: 'A', valueEx: 1 }, 1))
    for (let i = 1; i < FARM_FINDS_LIMIT; i += 1) ok(tr.addFind({ ref: 'A', valueEx: 1 }, 1))
    expect(tr.addFind({ ref: 'A', valueEx: 1 }, 1)).toEqual({ ok: false, reason: 'full' })
    const runId = tr.snapshot(0).current?.id as string
    expect(tr.removeFind(runId, first.find.id)).toBe(true)
    expect(tr.removeFind(runId, first.find.id)).toBe(false)
    expect(tr.snapshot(0).current?.finds).toHaveLength(FARM_FINDS_LIMIT - 1)
  })

  it('прибыль сессии от S70: у идущей и после «Стоп»; итог = прибыль + находки (макет: вкладки + находки)', () => {
    const tr = new FarmTracker(undefined, RULES)
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:01:00', 'MapBluff', 79, 101)], 0)
    ok(tr.addFind({ ref: 'Divine Orb', valueEx: 560 }, at('21:20:00')))
    const sid = tr.snapshot(0).session?.id as string
    expect(tr.setSessionProfit('nope', { ex: 1, source: 'manual', at: 0 }, 0)).toBe(false)
    expect(tr.setSessionProfit(sid, { ex: 300, exPerDiv: 560, source: 'manual', at: at('21:30:00') }, 0)).toBe(true)
    let st = tr.snapshot(at('21:30:00'))
    expect(st.session?.profit).toEqual({ ex: 300, exPerDiv: 560, source: 'manual', at: at('21:30:00') })
    expect(st.stats).toMatchObject({ findsEx: 560, profitEx: 300, totalEx: 860 })
    expect(st.stats?.exPerHour).toBeCloseTo(860 * 2, 6)

    tr.stopSession(at('21:30:00'), 'snapshot')
    // итог приходит после «Стоп» (снимок в конце) — пересчёт итога сессии
    expect(tr.setSessionProfit(sid, { ex: 1120, source: 'snapshot', tabs: 3, at: 0 } as never, at('21:31:00'))).toBe(true)
    st = tr.snapshot(at('21:31:00'))
    expect(st.sessions[0]).toMatchObject({ profitEnd: 'snapshot', profit: { ex: 1120, source: 'snapshot', tabs: 3, at: 0 } })
    expect(st.sessions[0].stats).toMatchObject({ profitEx: 1120, findsEx: 560, totalEx: 1680 })
    expect(st.sessions[0].stats.exPerHour).toBeCloseTo(1680 * 2, 6)
    // убрать — итог — только находки
    expect(tr.setSessionProfit(sid, null, 0)).toBe(true)
    st = tr.snapshot(at('21:31:00'))
    expect(st.sessions[0].profit).toBeUndefined()
    expect(st.sessions[0].stats).toMatchObject({ profitEx: null, totalEx: 560 })
  })

  it('диалоги: «Чем отметить начало» и «Как посчитать прибыль» — в сессии и событиях для S70; отметка начала', () => {
    const tr = new FarmTracker(undefined, RULES)
    const start = tr.startSession(at('21:00:00'), undefined, 'snapshot')
    expect(start[0]).toMatchObject({ type: 'session', state: 'start', session: { profitMode: 'snapshot' } })
    const sid = tr.snapshot(0).session?.id as string
    expect(tr.setSessionStart('nope', { source: 'snapshot', at: 1 }, 0)).toBe(false)
    expect(tr.setSessionStart(sid, { source: 'snapshot', tabs: 3 } as never, at('21:00:30'))).toBe(true)
    expect(tr.snapshot(0).session?.profitStart).toEqual({ source: 'snapshot', at: at('21:00:30'), tabs: 3 })
    // снаружи — копия: правка события не трогает трекер
    const ev = tr.pauseSession(at('21:05:00'))[0] as Extract<FarmEvent, { type: 'session' }>
    ;(ev.session.profitStart as { tabs: number }).tabs = 99
    expect(tr.snapshot(0).session?.profitStart?.tabs).toBe(3)
    const stop = tr.stopSession(at('21:30:00'), 'manual')
    expect(stop.at(-1)).toMatchObject({ state: 'stop', session: { profitMode: 'snapshot', profitEnd: 'manual' } })
    // неизвестный режим — не пишется; без режима (PoE 1) — полей нет
    const tr2 = new FarmTracker(undefined, RULES)
    tr2.startSession(1, undefined, 'wat' as never)
    expect(tr2.snapshot(1).session?.profitMode).toBeUndefined()
    const sess = tr.snapshot(0).sessions[0]
    const back = new FarmTracker(normalizeFarmData(JSON.parse(JSON.stringify(tr.toData(5)))), RULES).snapshot(5).sessions[0]
    expect(back).toMatchObject({ profitMode: 'snapshot', profitEnd: 'manual', profitStart: { tabs: 3 } })
    expect(back.stats).toEqual(sess.stats)
  })

  it('farm.json: находки и прибыль сессии переживают перезапуск; битое — отброшено', () => {
    const tr = new FarmTracker(undefined, RULES)
    tr.startSession(at('21:00:00'))
    tr.ingestLines([zone('21:01:00', 'MapBluff', 79, 101)], 0)
    ok(tr.addFind({ ref: 'Divine Orb', valueEx: 560 }, at('21:05:00')))
    tr.setSessionProfit(tr.snapshot(0).session?.id as string, { ex: 10, source: 'manual', at: 5 }, 0)
    const raw = JSON.parse(JSON.stringify(tr.toData(at('21:06:00'))))
    raw.current.finds.push({ id: 'bad', ref: '', qty: 1, valueEx: 1, at: 1, source: 'manual' })
    const back = new FarmTracker(normalizeFarmData(raw), RULES).snapshot(at('21:06:00'))
    expect(back.current?.finds).toHaveLength(1)
    expect(back.session?.profit).toEqual({ ex: 10, source: 'manual', at: 5 })
    expect(cleanSessionProfit({ ex: 'x' })).toBeNull()
    expect(cleanSessionProfit({ ex: -5, exPerDiv: 0, source: 'x' }, 7)).toEqual({ ex: -5, source: 'manual', at: 7 })
    expect(cleanFindInput({ ref: ' Divine Orb ', name: 'Divine Orb', valueEx: 0 })).toEqual({ ref: 'Divine Orb', qty: 1, valueEx: 0, source: 'manual' })
  })

  it('PoE 1 — статистика без полей PoE 2', () => {
    const tr = new FarmTracker()
    tr.startSession(at('21:00:00'))
    const st = tr.snapshot(at('21:05:00'))
    expect(st.game).toBe('poe1')
    expect(st.stats && 'exPerHour' in st.stats).toBe(false)
  })
})
