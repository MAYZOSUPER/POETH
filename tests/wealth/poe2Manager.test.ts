import { describe, expect, it } from 'vitest'
import type { ScreenCell, ScreenRead } from '@shared/types/screen'
import type { Poe2Sources, Poe2WealthState, WealthSnapshot, WealthSummary } from '@shared/types/wealth'
import { dedupeHistory, emptyLink, sanitizeLink, type Poe2SessionLink } from '../../src/main/games/poe2/wealth/store'
import { COALESCE_MS, dayDelta, END_GRACE_MS, Poe2WealthManager, START_GRACE_MS } from '../../src/main/games/poe2/wealth/manager'
import type { Poe2PriceView } from '../../src/main/games/poe2/wealth/prices'
import type { FarmEventLike, FarmRunProfit } from '../../src/main/games/poe1/wealth/manager'

// «Богатство PoE 2» (S70), main: запись снимков по вводу (пауза, правка одного снимка), ценные предметы, снимок
// вкладки по клавише (карточка → «Принять»), прибыль сессии фарма по снимкам начала и конца.

const PRICES: Record<string, number> = { 'Divine Orb': 600, 'Exalted Orb': 1, 'Chaos Orb': 70, 'Regal Orb': 2.5 }
const VIEW: Poe2PriceView = {
  priceOf: (n) => (PRICES[n] ? { unit: PRICES[n], source: 'ange' } : null),
  size: 10,
  exPerDivine: 600,
  info: { feedHour: 1 }
}

class MemStore {
  sources: Record<string, Poe2Sources> = {}
  link: Poe2SessionLink = emptyLink()
  history: WealthSummary[] = []
  details = new Map<string, WealthSnapshot>()
  async loadSources() {
    return this.sources
  }
  async saveSources(s: Record<string, Poe2Sources>) {
    this.sources = JSON.parse(JSON.stringify(s))
  }
  async loadLink() {
    return this.link
  }
  async saveLink(l: Poe2SessionLink) {
    this.link = sanitizeLink(JSON.parse(JSON.stringify(l)))
  }
  async loadHistoryCompact() {
    return dedupeHistory(this.history)
  }
  async appendHistory(s: WealthSummary) {
    this.history.push(s)
  }
  async saveDetail(s: WealthSnapshot) {
    this.details.set(s.summary.id, JSON.parse(JSON.stringify(s)))
  }
  async loadDetail(id: string) {
    return this.details.get(id) ?? null
  }
  async pruneDetails(): Promise<string[]> {
    return [...this.details.keys()]
  }
}

const cell = (item: string | null, count: number | null, slot: number, extra: Partial<ScreenCell> = {}): ScreenCell => ({
  rect: { x: 0, y: 0, width: 70, height: 70 },
  item,
  present: true,
  count,
  countSure: true,
  match: 0.9,
  slot,
  ...extra
})

const read = (cells: ScreenCell[], tab = 'orbs'): ScreenRead => ({
  game: 'poe2',
  window: 'stash',
  tab,
  scale: 1,
  client: { width: 2560, height: 1440 },
  cells,
  at: 1,
  ms: { find: 0, match: 0, ocr: 0, total: 0 }
})

function setup() {
  let t = 1_793_000_000_000
  let league: string | null = 'Forbidden Rites'
  const store = new MemStore()
  const states: Poe2WealthState[] = []
  const profits: Array<[string, FarmRunProfit | null]> = []
  let farmCb: ((e: FarmEventLike) => void) | null = null
  const m = new Poe2WealthManager({
    store,
    prices: { view: () => VIEW, refresh: async () => VIEW },
    currency: async () => ({ main: [{ name: 'Divine Orb', tag: 'divine' }, { name: 'Exalted Orb', tag: 'exalted' }, { name: 'Chaos Orb', tag: 'chaos' }], common: [{ name: 'Regal Orb', tag: 'regal' }] }),
    league: async () => league,
    emit: (s) => states.push(s),
    now: () => t,
    debounceMs: 60_000
  })
  m.attachFarm({
    onFarmEvent: (cb) => {
      farmCb = cb
      return () => (farmCb = null)
    },
    setRunProfit: (id, p) => profits.push([id, p])
  })
  const farm = async (e: FarmEventLike) => {
    farmCb?.(e)
    await m.idle()
  }
  return {
    m,
    store,
    states,
    profits,
    farm,
    tick: (ms: number) => (t += ms),
    now: () => t,
    setLeague: (l: string | null) => (league = l)
  }
}

describe('ручной ввод и золото', () => {
  it('ввод подряд — один снимок после паузы; правки в пределах 10 минут правят его же', async () => {
    const { m, store, tick } = setup()
    await m.start()
    await m.setManual('Divine Orb', 1)
    await m.setManual('Divine Orb', 2)
    await m.setManual('Chaos Orb', 10)
    expect(store.history).toHaveLength(0)
    await m.idle()
    expect(store.history).toHaveLength(1)
    const first = store.history[0]
    expect(first).toMatchObject({ base: 'exalted', chaos: 2 * 600 + 700, divineRate: 600, league: 'Forbidden Rites' })
    tick(COALESCE_MS - 1000)
    await m.setManual('Divine Orb', 3)
    await m.idle()
    expect(dedupeHistory(store.history).map((s) => [s.id, s.chaos])).toEqual([[first.id, 3 * 600 + 700]])
    tick(COALESCE_MS + 1000)
    await m.setManual('Divine Orb', 4)
    await m.idle()
    expect(dedupeHistory(store.history)).toHaveLength(2)
    const st = m.state()
    expect(st.history).toHaveLength(2)
    expect(st.total.ex).toBe(4 * 600 + 700)
    expect(st.manual.find((r) => r.name === 'Divine Orb')).toMatchObject({ qty: 4, unit: 600, group: 'main' })
    expect(st.manual.find((r) => r.name === 'Regal Orb')).toMatchObject({ qty: 0, group: 'common' })
  })

  it('золото — отдельно, в итог в exalted не входит; мусор — 0', async () => {
    const { m } = setup()
    await m.start()
    await m.setGold(1_234_567)
    expect(m.state().gold.qty).toBe(1_234_567)
    expect(m.state().total.ex).toBe(0)
    await m.setGold('abc')
    expect(m.state().gold.qty).toBe(0)
  })

  it('у каждой лиги своё богатство', async () => {
    const { m, setLeague } = setup()
    await m.start()
    await m.setManual('Divine Orb', 5)
    await m.idle()
    setLeague('Dawn of the Hunt')
    await m.onLeagueChanged()
    expect(m.state().total.ex).toBe(0)
    expect(m.state().history).toHaveLength(0)
    setLeague('Forbidden Rites')
    await m.onLeagueChanged()
    expect(m.state().total.ex).toBe(3000)
  })
})

describe('ценные предметы', () => {
  it('из окна цены — сразу в снимок своей строкой; мусор не принимается; удаление', async () => {
    const { m, store } = setup()
    await m.start()
    expect(await m.addValuable({ name: '', unit: 5 })).toEqual({ ok: false })
    const r = await m.addValuable({ name: 'Headhunter', base: 'Leather Belt', kind: 'unique', unit: 9000, source: 'trade' })
    expect(r.ok).toBe(true)
    const id = (r as { id: string }).id
    expect(store.history).toHaveLength(1)
    const d = store.details.get(store.history[0].id)!
    expect(d.lines.find((l) => l.key === `VALUABLE|${id}`)).toMatchObject({ name: 'Headhunter', unit: 9000, source: 'pricecheck' })
    expect(m.state().sources.valuables).toMatchObject({ ex: 9000, count: 1 })
    await m.removeValuable(id)
    expect(m.state().sources.valuables.count).toBe(0)
    expect(m.state().total.ex).toBe(0)
  })
})

describe('снимок вкладки из панели Alt+F', () => {
  it('две вкладки → карточки; неуверенное число — только после правки или «верно»; «Принять» по вкладке', async () => {
    const orbs = read([cell('Divine Orb', 10, 14), cell('Exalted Orb', 300, 24, { countSure: false }), cell(null, 2, 3)])
    const ess = read([cell('Regal Orb', null, 5), cell('Chaos Orb', 4, 6, { countSure: false })], 'essence')
    const { m, store } = setup()
    await m.start()
    expect(m.screenRecord(null)).toBe(false)
    expect(m.screenRecord({ ...orbs, game: 'poe1' })).toBe(false)
    expect(m.screenRecord(orbs)).toBe(true)
    expect(m.screenRecord(ess)).toBe(true)
    let st = m.state()
    expect(st.screenOpenAt).toBeGreaterThan(0)
    expect(st.screen?.tabs.map((t) => t.layout)).toEqual(['orbs', 'essence'])
    expect(st.screen?.tabs[0].unknown).toBe(1)
    // «Принять» вкладку «Валюта» без проверки Exalted — в снимок только div
    st = await m.screenAccept('screen:poe2:stash:orbs')
    expect(st.screen?.tabs.map((t) => t.layout)).toEqual(['essence'])
    expect(st.sources.screen).toMatchObject({ tabs: 1, ex: 6000 })
    // вторая вкладка: Regal поправили, Chaos — «верно» (то же число)
    m.screenEdit('screen:poe2:stash:essence', 's5', { qty: 40 })
    m.screenEdit('screen:poe2:stash:essence', 's6', { qty: 4 })
    st = await m.screenAccept()
    expect(st.screen).toBeNull()
    expect(st.sources.screen).toMatchObject({ tabs: 2, ex: 6000 + 40 * 2.5 + 4 * 70 })
    // две вкладки подряд — одна точка истории (правится тот же снимок)
    expect(dedupeHistory(store.history)).toHaveLength(1)
  })

  it('«Переснять» убирает вкладку из сеанса, отмена — весь сеанс', async () => {
    const { m } = setup()
    await m.start()
    m.screenRecord(read([cell('Divine Orb', 10, 14)]))
    m.screenRecord(read([cell('Regal Orb', 3, 5)], 'essence'))
    expect(m.screenDrop('screen:poe2:stash:orbs').screen?.tabs.length).toBe(1)
    expect(m.screenDrop().screen).toBeNull()
  })

  it('изменение за сутки — по истории', () => {
    const p = (h: number, chaos: number) => ({ at: h * 3_600_000, chaos, divineRate: 600 })
    expect(dayDelta([p(0, 100)])).toEqual({})
    // сутки назад от последней точки — 6 ч: 100 + (400 − 100) × 6/30 = 160 → +240
    expect(dayDelta([p(0, 100), p(30, 400)]).delta).toEqual({ ex: 240, fromAt: 6 * 3_600_000 })
  })
})

describe('прибыль сессии фарма', () => {
  it('начало (с поправкой в первые минуты), забеги группой, конец после «Стоп» и его поправка', async () => {
    const { m, store, profits, farm, tick } = setup()
    await m.start()
    await m.setManual('Divine Orb', 1)
    await m.idle()
    await farm({ type: 'session', state: 'start', at: 0 })
    const pin = store.link.session!
    expect(pin.startEx).toBe(600)
    // игрок отметил богатство в начале: ввёл точное число
    tick(60_000)
    await m.setManual('Divine Orb', 10)
    await m.idle()
    expect(store.link.session!.startEx).toBe(6000)
    expect(store.link.session!.startId).not.toBe(pin.startId)

    tick(START_GRACE_MS)
    await farm({ type: 'runStart', run: { id: 'r1', sessionId: 's' }, at: 0 })
    await farm({ type: 'runEnd', run: { id: 'r1', sessionId: 's' }, at: 0 })
    await farm({ type: 'runStart', run: { id: 'r2', sessionId: 's' }, at: 0 })
    await farm({ type: 'runEnd', run: { id: 'r2', sessionId: 's' }, at: 0 })
    // забег вне сессии не считается
    await farm({ type: 'runEnd', run: { id: 'x', sessionId: null }, at: 0 })
    await farm({ type: 'session', state: 'stop', at: 0 })
    expect(m.state().session).toMatchObject({ awaitingEnd: true })
    expect(profits).toEqual([])

    // после «Стоп» игрок снял вкладку: +2 div и 50 ex
    tick(5 * 60_000)
    await m.addValuable({ name: 'Astramentis', kind: 'unique', unit: 300, source: 'trade' })
    expect(profits).toEqual([['r2', { chaos: 300, runs: 2, divineRate: 600 }]])
    tick(60_000)
    await m.setManual('Divine Orb', 12)
    await m.idle()
    expect(profits.at(-1)).toEqual(['r2', { chaos: 300 + 1200, runs: 2, divineRate: 600 }])
    const s = m.state().session!
    expect(s.profitEx).toBe(1500)
    expect(s.awaitingEnd).toBeUndefined()

    // через 2 часа после «Стоп» правки богатства в сессию уже не идут
    tick(END_GRACE_MS + COALESCE_MS)
    await m.setManual('Divine Orb', 20)
    await m.idle()
    expect(profits).toHaveLength(2)
    expect(m.state().session!.profitEx).toBe(1500)
  })

  it('правка посреди карты — граница не сдвигается, прибыль достаётся закончившемуся позже забегу', async () => {
    const { m, profits, farm, tick } = setup()
    await m.start()
    await farm({ type: 'session', state: 'start', at: 0 })
    tick(START_GRACE_MS + 1)
    await farm({ type: 'runStart', run: { id: 'r1', sessionId: 's' }, at: 0 })
    await m.setManual('Chaos Orb', 5)
    await m.idle()
    expect(profits).toEqual([])
    await farm({ type: 'runEnd', run: { id: 'r1', sessionId: 's' }, at: 0 })
    tick(COALESCE_MS + 1)
    await m.setManual('Chaos Orb', 7)
    await m.idle()
    expect(profits).toEqual([['r1', { chaos: 490, runs: 1, divineRate: 600 }]])
  })
})

describe('хранилище', () => {
  it('история без повторов: у id побеждает последняя запись', () => {
    const s = (id: string, at: number, chaos: number) => ({ id, at, league: 'L', chaos, divineRate: 1, tabs: [], priced: 0, unpriced: 0 })
    expect(dedupeHistory([s('a', 1, 1), s('b', 2, 2), s('a', 3, 5)]).map((x) => [x.id, x.chaos])).toEqual([
      ['b', 2],
      ['a', 5]
    ])
  })

  it('связка сессии: мусор отбрасывается', () => {
    expect(sanitizeLink({ league: 'L', session: { startedAt: 1, startId: 'bad id!', startEx: 1 }, pending: ['r1', 5], lastGroup: { runId: 'r1', runs: 0, fromId: 'a' } })).toEqual({
      league: 'L',
      session: null,
      boundary: null,
      pending: ['r1'],
      lastGroup: null
    })
  })
})
