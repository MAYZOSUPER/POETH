import { describe, expect, it } from 'vitest'
import { FeedStore, FIRST_HOURS } from '../../src/main/games/poe1/exchange/feedStore'
import type { FullHour } from '../../src/shared/flip/feed'

const M = 'Metadata/Items/'
const NOW = 1_793_149_260_000
/** начало текущего часа (ещё не опубликован) */
const CUR = Math.floor(NOW / 3_600_000) * 3600

function feedJson(hour: number): unknown {
  const m = (league: string): unknown => ({
    league,
    market_pair: [`${M}Currency/CurrencyRerollRare`, `${M}Currency/CurrencyModValues`],
    volume_traded: { [`${M}Currency/CurrencyRerollRare`]: 3000 + (hour % 7), [`${M}Currency/CurrencyModValues`]: 10 },
    lowest_ratio: {},
    highest_ratio: {},
    lowest_stock: {},
    highest_stock: {}
  })
  return { next_change_id: hour + 3600, markets: [m('Allflame'), m('Standard')] }
}

function setup(opts: { offline?: boolean; disk?: FullHour[]; missingLatest?: boolean } = {}) {
  const disk = new Map<number, FullHour>((opts.disk ?? []).map((h) => [h.hour, h]))
  const urls: string[] = []
  const removed: number[] = []
  const store = new FeedStore({
    getJson: async (url) => {
      urls.push(url)
      if (opts.offline) throw new Error('offline')
      const hour = Number(url.split('/').pop())
      if (hour >= CUR || (opts.missingLatest && hour === CUR - 3600)) return { status: 404, json: null }
      return { status: 200, json: feedJson(hour) }
    },
    readHour: async (h) => disk.get(h) ?? null,
    writeHour: async (h) => void disk.set(h.hour, h),
    listHours: async () => [...disk.keys()],
    removeHour: async (h) => {
      removed.push(h)
      disk.delete(h)
    },
    now: () => NOW,
    sleep: async () => undefined
  })
  return { store, urls, disk, removed }
}

describe('хранилище часов фида', () => {
  it('сразу свежие 24 ч (без текущего часа), в памяти — только рынки лиги, на диске — весь час', async () => {
    const { store, urls, disk } = setup()
    expect(await store.refresh('Allflame')).toBe(true)
    expect(urls).toHaveLength(FIRST_HOURS)
    expect(urls[0]).toBe(`https://web.poecdn.com/api/currency-exchange/${CUR - 3600}`)
    const hs = store.hours('Allflame')
    expect(hs).toHaveLength(24)
    expect(hs.every((h) => h.markets.every((m) => m[0] === 'Allflame'))).toBe(true)
    expect(disk.get(CUR - 3600)?.markets.map((m) => m[0])).toEqual(['Allflame', 'Standard'])
    expect(store.lastHour()).toBe(CUR - 3600)
    // повтор в течение 10 минут — без сети
    await store.refresh('Allflame')
    expect(urls).toHaveLength(FIRST_HOURS)
  })

  it('неделя: остальное — в фоне, от свежих к старым', async () => {
    const { store, urls } = setup()
    const updates: number[] = []
    store.onUpdate(() => updates.push(store.hours('Allflame').length))
    await store.refresh('Allflame', 48)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    // фон дотягивает 24 часа
    for (let i = 0; i < 50 && store.hours('Allflame', 168).length < 48; i++) await new Promise((r) => setTimeout(r, 0))
    expect(store.hours('Allflame', 168)).toHaveLength(48)
    expect(urls[FIRST_HOURS]).toBe(`https://web.poecdn.com/api/currency-exchange/${CUR - 25 * 3600}`)
    expect(updates.length).toBeGreaterThan(0)
  })

  it('последний час ещё не опубликован (404) — не ошибка; без сети — данные с диска и признак проблемы', async () => {
    const a = setup({ missingLatest: true })
    expect(await a.store.refresh('Allflame')).toBe(true)
    expect(a.store.lastHour()).toBe(CUR - 7200)
    const disk: FullHour[] = [{ hour: CUR - 7200, markets: [['Allflame', 'A', 'B', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]] }]
    const b = setup({ offline: true, disk })
    expect(await b.store.refresh('Allflame')).toBe(false)
    expect(b.store.hasProblem()).toBe(true)
    expect(b.store.hours('Allflame')).toHaveLength(1)
  })

  it('старше недели — удаляется с диска', async () => {
    const old: FullHour = { hour: CUR - 200 * 3600, markets: [] }
    const { store, removed } = setup({ disk: [old] })
    await store.refresh('Allflame')
    expect(removed).toContain(old.hour)
  })

  it('две лиги одновременно (окно цены и флиппинг) — рынки обеих в памяти', async () => {
    const { store } = setup()
    const [a, b] = await Promise.all([store.refresh('Standard'), store.refresh('Allflame', 24)])
    expect(a && b).toBe(true)
    expect(store.hours('Allflame').every((h) => h.markets.length === 1)).toBe(true)
    expect(store.hours('Standard').every((h) => h.markets.length === 1)).toBe(true)
  })

  it('часовое обновление: в начале следующего часа + 5…9 мин; stop — без таймера', () => {
    const { store } = setup()
    expect(store.nextAt()).toBeNull()
    store.start(async () => 'Allflame')
    const at = store.nextAt()!
    expect(at).toBeGreaterThanOrEqual((CUR + 3600) * 1000 + 5 * 60_000)
    expect(at).toBeLessThanOrEqual((CUR + 3600) * 1000 + 9 * 60_000)
    store.stop()
    expect(store.nextAt()).toBeNull()
  })

  it('новая лига — её рынки перечитываются с диска без сети', async () => {
    const { store, urls } = setup()
    await store.refresh('Allflame')
    const n = urls.length
    await store.refresh('Standard')
    expect(store.hours('Standard')).toHaveLength(24)
    expect(urls.length).toBe(n)
  })
})
