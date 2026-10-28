import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WealthManager, type FarmEventLike, type FarmRunProfit } from '../../src/main/games/poe1/wealth/manager'
import { PriceService } from '../../src/main/games/poe1/wealth/priceService'
import { sanitizeConfig, type WealthConfig } from '../../src/main/games/poe1/wealth/store'
import type { StashProvider, StashQuery, StashResult } from '../../src/main/games/poe1/wealth/stashProvider'
import type { ParsedStash, StashItem, StashTabInfo } from '../../src/shared/wealth/stash'
import { STASH_DEFAULT_WINDOWS } from '../../src/shared/wealth/tabs'
import type { WealthSnapshot, WealthState, WealthSummary } from '../../src/shared/types/wealth'

const T0 = 1_800_000_000_000
const tabs: StashTabInfo[] = [
  { id: 'cur', index: 0, name: 'Валюта', type: 'CurrencyStash' },
  { id: 'dump', index: 1, name: 'Свалка', type: 'QuadStash' },
  { id: 'map', index: 2, name: 'Карты', type: 'MapStash', unsupported: true }
]
const chaos = (qty: number): StashItem => ({
  name: '',
  typeLine: 'Chaos Orb',
  baseType: 'Chaos Orb',
  frameType: 5,
  qty,
  identified: true,
  corrupted: false,
  links: 0
})

class FakeProvider implements StashProvider {
  readonly name = 'legacy' as const
  calls: Array<{ tabs: boolean; q: StashQuery }> = []
  /** chaos во вкладках по индексу */
  content: Record<number, number> = { 0: 100, 1: 50 }
  fail: Record<number, StashResult<ParsedStash>> = {}
  async sessionAccountName(): Promise<string | null> {
    return 'Exile_Example#1234'
  }
  private res(q: StashQuery, withTabs: boolean): StashResult<ParsedStash> {
    this.calls.push({ tabs: withTabs, q })
    const f = this.fail[q.index]
    if (f) return f
    const data: ParsedStash = { numTabs: tabs.length, items: [chaos(this.content[q.index] ?? 0)] }
    if (withTabs) data.tabs = tabs.map((t) => ({ ...t }))
    return { ok: true, data }
  }
  async fetchTabs(q: StashQuery) {
    return this.res(q, true)
  }
  async fetchTab(q: StashQuery) {
    return this.res(q, false)
  }
  windows() {
    return [...STASH_DEFAULT_WINDOWS]
  }
}

function memStore() {
  let cfg: WealthConfig = sanitizeConfig(null)
  const history: WealthSummary[] = []
  const details = new Map<string, WealthSnapshot>()
  return {
    history,
    details,
    cfg: () => cfg,
    loadConfig: async () => cfg,
    saveConfig: async (c: WealthConfig) => {
      cfg = JSON.parse(JSON.stringify(c)) as WealthConfig
    },
    loadHistory: async () => [...history],
    appendHistory: async (s: WealthSummary) => {
      history.push(s)
    },
    saveDetail: async (s: WealthSnapshot) => {
      details.set(s.summary.id, s)
    },
    loadDetail: async (id: string) => details.get(id) ?? null,
    detailedIds: async () => [...details.keys()].sort(),
    pruneDetails: async () => [...details.keys()].sort()
  }
}

function prices(): PriceService {
  const p = new PriceService({
    getJson: async () => ({ status: 404, json: null }),
    readCache: async () => null,
    writeCache: async () => undefined,
    listCache: async () => [],
    removeCache: async () => undefined,
    loadNames: async () => ({ version: 1, names: {} }),
    now: () => T0
  })
  // одна цена: chaos = 1
  vi.spyOn(p, 'index').mockReturnValue({
    get: (kind, name) => (kind === 'stackable' && name === 'Chaos Orb' ? [{ name, kind, chaos: 1, source: 'exchange' }] : []),
    size: 1
  })
  vi.spyOn(p, 'divineRate').mockReturnValue(300)
  return p
}

function setup(loggedIn = true) {
  let now = T0
  let logged = loggedIn
  const provider = new FakeProvider()
  const store = memStore()
  const states: WealthState[] = []
  const m = new WealthManager({
    provider,
    prices: prices(),
    store,
    league: async () => 'Allflame',
    loggedIn: () => logged,
    emit: (s) => states.push(s),
    now: () => now
  })
  return {
    m,
    provider,
    store,
    states,
    tick: (ms: number) => (now += ms),
    login: (v: boolean) => (logged = v)
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('менеджер учёта богатства', () => {
  it('без входа — «войдите», ни одного запроса к сайту', async () => {
    const { m, provider } = setup(false)
    await m.start()
    expect(m.state().loggedIn).toBe(false)
    expect(await m.snapshot()).toEqual({ ok: false, error: { code: 'auth' } })
    expect(await m.refreshTabs()).toEqual({ ok: false, error: { code: 'auth' } })
    expect(provider.calls).toHaveLength(0)
    expect(m.state().status.error?.code).toBe('auth')
  })

  it('снимок: список вкладок вместе с первой, дальше по вкладке; карты не берутся; итог и точка графика', async () => {
    const { m, provider, store } = setup()
    await m.start()
    const seen: WealthSummary[] = []
    m.onSnapshot((s) => seen.push(s))
    expect(await m.snapshot()).toEqual({ ok: true })
    expect(provider.calls.map((c) => [c.tabs, c.q.index])).toEqual([
      [true, 0],
      [false, 1]
    ])
    expect(provider.calls[0].q).toMatchObject({ account: 'Exile_Example#1234', league: 'Allflame' })
    const st = m.state()
    expect(st.latest).toMatchObject({ chaos: 150, divineRate: 300, league: 'Allflame' })
    expect(st.tabs.map((t) => [t.id, t.selected])).toEqual([
      ['cur', true],
      ['dump', true],
      ['map', false]
    ])
    expect(st.history).toHaveLength(1)
    expect(st.account).toEqual({ name: 'Exile_Example#1234', source: 'session' })
    expect(store.history).toHaveLength(1)
    expect(seen.map((s) => s.chaos)).toEqual([150])
    expect(m.getNetWorthAt(T0 + 3_600_000)).toBe(150)
  })

  it('ошибка любой вкладки обрывает снимок — частичной суммы нет', async () => {
    const { m, provider, store } = setup()
    await m.start()
    provider.fail[1] = { ok: false, error: { code: 'rate-limited', retryAt: T0 + 60_000 } }
    expect(await m.snapshot()).toEqual({ ok: false, error: { code: 'rate-limited', retryAt: T0 + 60_000 } })
    expect(store.history).toHaveLength(0)
    expect(m.state().latest).toBeNull()
  })

  it('выбор вкладок сохраняется; снимок берёт только выбранные', async () => {
    const { m, provider } = setup()
    await m.start()
    await m.refreshTabs()
    await m.setTabs(['dump', 'map', 'nope'])
    expect(m.state().tabs.filter((t) => t.selected).map((t) => t.id)).toEqual(['dump'])
    expect(m.state().budget.requests).toBe(1)
    provider.calls = []
    await m.snapshot()
    // первая выбранная вкладка (index 1) приходит вместе со списком — один запрос
    expect(provider.calls.map((c) => [c.tabs, c.q.index])).toEqual([[true, 1]])
    expect(m.state().latest?.chaos).toBe(50)
  })

  it('имя аккаунта вручную: формат проверяется, пустое — снова из сессии', async () => {
    const { m } = setup()
    await m.start()
    expect(await m.setAccount('плохо')).toBe('bad-format')
    expect(await m.setAccount('Exile_Other-0042')).toBe('ok')
    expect(m.state().account).toEqual({ name: 'Exile_Other#0042', source: 'manual' })
    expect(await m.setAccount('')).toBe('ok')
    expect(m.state().account.source).toBeNull()
  })

  it('сессия фарма: «Начать» → снимки по таймеру → «Стоп»; доход в час и «что прибавилось»', async () => {
    const { m, provider, tick } = setup()
    await m.start()
    await m.setOptions({ autoEnabled: false }) // «вручную»: авто-снимки — только во время сессии
    expect(await m.startFarm()).toEqual({ ok: true })
    const s0 = m.state()
    expect(s0.farm.session).toMatchObject({ league: 'Allflame', startChaos: 150 })
    // во время сессии авто-снимки включаются сами
    expect(s0.nextAutoAt).toBeDefined()
    provider.content[0] = 400
    tick(30 * 60_000)
    expect(await m.stopFarm()).toEqual({ ok: true })
    const st = m.state()
    expect(st.farm.session?.stoppedAt).toBe(T0 + 30 * 60_000)
    expect(st.farm).toMatchObject({ gain: 300, perHour: 600, snapshots: 2 })
    expect(st.nextAutoAt).toBeUndefined()
    const diff = await m.diff()
    expect(diff?.chaosDelta).toBe(300)
    expect(diff?.lines[0]).toMatchObject({ name: 'Chaos Orb', qtyDelta: 300, unit: 1, source: 'exchange' })
    // «с начала сессии» — от снимка «Начать», а не по id 'session'
    const sess = await m.diff('session')
    expect(sess?.fromId).toBe(st.farm.session?.startId)
    expect(sess?.chaosDelta).toBe(300)
  })

  it('авто-снимок по таймеру не чаще лимита сайта', async () => {
    const { m, provider } = setup()
    await m.start()
    await m.setOptions({ autoEnabled: true, autoIntervalMin: 15 })
    await m.snapshot()
    const next = m.state().nextAutoAt ?? 0
    // 2 вкладки → лимит не мешает, 15 мин от снимка
    expect(next).toBe(T0 + 15 * 60_000)
    provider.calls = []
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(provider.calls.length).toBe(2)
  })
})

function farmLink() {
  const subs = new Set<(e: FarmEventLike) => void>()
  const profits: Array<[string, FarmRunProfit | null]> = []
  return {
    profits,
    emit: (e: FarmEventLike) => subs.forEach((cb) => cb(e)),
    link: {
      onFarmEvent: (cb: (e: FarmEventLike) => void) => {
        subs.add(cb)
        return () => subs.delete(cb)
      },
      setRunProfit: (id: string, p: FarmRunProfit | null) => profits.push([id, p])
    }
  }
}

describe('связка с трекером карт S11b', () => {
  async function linked(loggedIn = true) {
    const env = setup(loggedIn)
    const f = farmLink()
    await env.m.start()
    env.m.attachFarm(f.link)
    // время в менеджере и в таймерах идёт вместе
    const advance = async (ms: number): Promise<void> => {
      env.tick(ms)
      await vi.advanceTimersByTimeAsync(ms)
      await env.m.farmIdle()
    }
    const ev = async (e: FarmEventLike): Promise<void> => {
      f.emit(e)
      await env.m.farmIdle()
      await vi.advanceTimersByTimeAsync(0)
      await env.m.farmIdle()
    }
    return { ...env, f, advance, ev }
  }
  const run = (type: 'runStart' | 'runEnd', id: string): FarmEventLike => ({ type, run: { id }, at: 0 })
  const sess = (state: 'start' | 'stop' | 'pause' | 'resume'): FarmEventLike => ({ type: 'session', state, at: 0 })

  it('«Начать» — снимок-отсчёт; граница A→B — снимок «после A» и прибыль A без дрейфа цен', async () => {
    const { m, provider, f, advance, ev } = await linked()
    expect(m.state().farmLinked).toBe(true)
    await ev(sess('start'))
    expect(m.state().farm.session).toMatchObject({ startChaos: 150 })
    await ev(run('runStart', 'r1'))
    expect(provider.calls).toHaveLength(2) // только снимок-отсчёт
    await advance(5 * 60_000)
    provider.content[0] = 120 // лут карты r1 (+20 chaos) сложен в тайник
    await ev(run('runEnd', 'r1'))
    await ev(run('runStart', 'r2'))
    expect(provider.calls).toHaveLength(4)
    expect(f.profits).toEqual([['r1', { chaos: 20, runs: 1, divineRate: 300 }]])
  })

  it('лимит не пускает снимок на каждой границе — забеги копятся в группу', async () => {
    const { provider, f, advance, ev } = await linked()
    await ev(sess('start'))
    await ev(run('runStart', 'r1'))
    await advance(30_000)
    provider.content[0] = 110
    await ev(run('runEnd', 'r1'))
    await ev(run('runStart', 'r2')) // рано: 2 вкладки → ≥ 107 с между снимками
    expect(f.profits).toEqual([])
    await advance(20_000)
    provider.content[0] = 125
    await ev(run('runEnd', 'r2'))
    await ev(run('runStart', 'r3'))
    await advance(120_000) // таймер границы
    expect(f.profits).toEqual([['r2', { chaos: 25, runs: 2, divineRate: 300 }]])
  })

  it('«Стоп» — финальный снимок даёт прибыль последнего забега; пауза снимков не делает', async () => {
    const { m, provider, f, advance, ev } = await linked()
    await m.setOptions({ autoEnabled: false })
    await ev(sess('start'))
    await ev(run('runStart', 'r1'))
    await ev(sess('pause'))
    await advance(10 * 60_000)
    await ev(run('runEnd', 'r1'))
    await ev(run('runStart', 'r2'))
    expect(provider.calls).toHaveLength(2) // на паузе границ нет
    await ev(sess('resume'))
    expect(provider.calls).toHaveLength(4)
    await advance(10 * 60_000)
    provider.content[1] = 90
    await ev(run('runEnd', 'r2'))
    await ev(sess('stop'))
    expect(f.profits.map(([id, p]) => [id, p?.chaos])).toEqual([
      ['r1', 0],
      ['r2', 40]
    ])
    expect(m.state().farm.session?.stoppedAt).toBeDefined()
    expect(m.state().nextAutoAt).toBeUndefined()
  })

  it('без входа: сессия трекера идёт, запросов к сайту нет, прибыли нет', async () => {
    const { provider, f, advance, ev } = await linked(false)
    await ev(sess('start'))
    await ev(run('runStart', 'r1'))
    await advance(10 * 60_000)
    await ev(run('runEnd', 'r1'))
    await ev(run('runStart', 'r2'))
    await ev(sess('stop'))
    expect(provider.calls).toHaveLength(0)
    expect(f.profits).toEqual([])
  })
})

describe('по макету «Тайник»', () => {
  it('«Обновить» — не чаще раза в минуту', async () => {
    const { m, provider, tick } = setup()
    await m.start()
    expect(await m.refresh()).toEqual({ ok: true })
    const n = provider.calls.length
    tick(30_000)
    expect(await m.refresh()).toEqual({ ok: true })
    expect(provider.calls.length).toBe(n) // рано — без запросов
    expect(m.state().refreshAt).toBe(T0 + 60_000)
    tick(31_000)
    await m.refresh()
    expect(provider.calls.length).toBe(n + 2)
    expect(m.state().refreshAt).toBeDefined()
  })

  it('изменение за сутки: общее и по вкладкам; одного снимка мало', async () => {
    const { m, provider, tick } = setup()
    await m.start()
    await m.snapshot()
    expect(m.state().delta).toBeUndefined()
    tick(12 * 3_600_000)
    provider.content[0] = 130
    await m.snapshot()
    tick(13 * 3_600_000)
    provider.content[0] = 160
    provider.content[1] = 40
    await m.snapshot()
    const st = m.state()
    // сутки назад (T0+1 ч) — между 150 и 180: 152.5; сейчас 200
    expect(st.delta).toEqual({ chaos: 47.5, pct: 31.15, fromAt: T0 + 3_600_000 })
    // по вкладкам — от итога не позже «сутки назад» (первый снимок)
    expect(st.tabDelta).toEqual({ cur: 60, dump: -10 })
  })

  it('новая вкладка на сайте включается сама, remove-only — нет', async () => {
    const { m, provider } = setup()
    await m.start()
    await m.refreshTabs()
    await m.setTabs(['cur'])
    tabs.push({ id: 'new1', index: 3, name: 'Новая', type: 'PremiumStash' })
    tabs.push({ id: 'ro1', index: 4, name: 'Старая (Remove-only)', type: 'PremiumStash', removeOnly: true })
    try {
      await m.refreshTabs()
      expect(m.state().tabs.filter((t) => t.selected).map((t) => t.id)).toEqual(['cur', 'new1'])
      expect(provider.calls.length).toBeGreaterThan(0)
    } finally {
      tabs.splice(3)
    }
  })
})
