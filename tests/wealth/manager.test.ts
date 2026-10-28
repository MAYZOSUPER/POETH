import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WealthManager } from '../../src/main/games/poe1/wealth/manager'
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
    if (withTabs) data.tabs = tabs
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
    expect(diff?.lines[0]).toMatchObject({ name: 'Chaos Orb', qtyDelta: 300 })
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
