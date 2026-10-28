import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { FlipManager, sanitizeFilters } from '../../src/main/games/poe1/flip/manager'
import { leagueHour, parseFeedHour, type FullHour } from '../../src/shared/flip/feed'
import { DEFAULT_FILTERS } from '../../src/shared/flip/routes'
import type { FlipAlert, FlipState } from '../../src/shared/types/flip'
import type { FullMarket } from '../../src/shared/flip/feed'
import { CHAOS_ID, DIVINE_ID } from '../../src/shared/wealth/exchange'

const ROOT = join(__dirname, '../..')
const names = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/wealth/exchange-ids.json'), 'utf8')).names
const fees = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/flip/gold-fees.json'), 'utf8'))
const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/allflame-24h.json'), 'utf8')) as Array<{ hour: number; json: unknown }>
const hours: FullHour[] = raw.map((h) => leagueHour(parseFeedHour(h.hour, h.json)!, 'Allflame'))

function setup(feedHours: FullHour[] = hours) {
  const states: FlipState[] = []
  const alerts: FlipAlert[] = []
  let saved: unknown = null
  const listeners = new Set<() => void>()
  const refreshes: Array<[string, number | undefined]> = []
  const m = new FlipManager({
    feed: {
      refresh: async (league, want) => {
        refreshes.push([league, want])
        return true
      },
      hours: (league) => (league === 'Allflame' ? feedHours : []),
      onUpdate: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      hasProblem: () => false,
      nextAt: () => 1_800_000_000_000
    },
    league: async () => 'Allflame',
    loadNames: async () => names,
    loadFees: async () => fees,
    loadConfig: async () => saved,
    saveConfig: async (c) => {
      saved = c
    },
    emit: (s) => states.push(s),
    alert: (a) => alerts.push(a)
  })
  return { m, states, alerts, refreshes, saved: () => saved, update: () => listeners.forEach((cb) => cb()) }
}

describe('менеджер флиппинга', () => {
  it('старт: неделя фида, маршруты и курс по часам лиги', async () => {
    const { m, refreshes } = setup()
    await m.start()
    await new Promise((r) => setTimeout(r, 0))
    const s = m.state()
    expect(s.supported).toBe(true)
    expect(s.league).toBe('Allflame')
    expect(s.hours).toBe(24)
    expect(s.divine?.current).toBeGreaterThan(100)
    expect(s.routes.length).toBeGreaterThan(0)
    expect(s.feesFrom).toContain('poedb.tw')
    expect(refreshes[0]).toEqual(['Allflame', 168])
  })

  it('фильтры: сохраняются, в разумных пределах, пересчёт', async () => {
    const { m, saved } = setup()
    await m.start()
    const before = m.state().routes.length
    const s = await m.setFilters({ minActiveHours: 99, minSpread: 0.5, maxSpread: 0.1, budgetDiv: -5 })
    expect(s.filters.minActiveHours).toBe(24)
    expect(s.filters.maxSpread).toBe(0.5)
    expect(s.filters.budgetDiv).toBe(0.1)
    expect((saved() as { filters: unknown }).filters).toEqual(s.filters)
    expect(s.routes.length).toBeLessThan(before)
    expect(sanitizeFilters('мусор')).toEqual(DEFAULT_FILTERS)
  })

  it('маршруты «только тренд» — в общем списке (для чипа «Без тренда»), но не в топе по умолчанию', async () => {
    const { m } = setup()
    await m.start()
    const s = await m.setFilters({ maxTrend: 0 })
    const trendy = s.routes.filter((r) => r.rejects.includes('trend'))
    expect(trendy.length).toBeGreaterThan(0)
    expect(trendy.every((r) => r.rejects.length === 1)).toBe(true)
    expect(s.rejected.every((r) => !(r.rejects.length === 1 && r.rejects[0] === 'trend'))).toBe(true)
    expect(s.nextUpdateAt).toBe(1_800_000_000_000)
  })

  it('курс вышел из коридора недели — тост, если включено; один раз на час фида', async () => {
    const H = 1_793_142_000
    const hour = (i: number, chaos: number): FullHour => ({
      hour: H - i * 3600,
      markets: [['Allflame', CHAOS_ID, DIVINE_ID, chaos, 10, 0, 0, 0, 0, 0, 0, 0, 0] as FullMarket]
    })
    const feed = [...Array.from({ length: 10 }, (_, i) => hour(10 - i, 3000 + i * 10)), hour(0, 4000)]
    const off = setup(feed)
    await off.m.start()
    expect(off.alerts).toEqual([])
    const on = setup(feed)
    await on.m.start()
    await on.m.setOptions({ divineAlert: true })
    // включили, когда курс уже вне коридора, — тост сразу, а не со следующим часом фида
    expect(on.alerts).toHaveLength(1)
    on.update()
    on.update()
    expect(on.alerts).toEqual([{ dir: 'above', rate: 400, lo: 300, hi: 309, hour: H * 1000 }])
    expect(on.m.state().options.divineAlert).toBe(true)
    // баннер под графиком: «тост уже отправлен» / «включите уведомление»
    expect(on.m.state().alertSent).toBe(true)
    expect(off.m.state().alertSent).toBe(false)
    expect(off.m.state().divine?.outside).toBe('above')
    expect((on.saved() as { alertedHour?: number }).alertedHour).toBe(H * 1000)
  })

  it('PoE2 — нет поддержки; обновление фида — пересчёт', async () => {
    const { m, states, update } = setup()
    await m.start()
    const n = states.length
    update()
    expect(states.length).toBe(n + 1)
    m.stop()
    expect(m.state().supported).toBe(false)
  })
})
