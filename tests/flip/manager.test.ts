import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { FlipManager, sanitizeFilters } from '../../src/main/games/poe1/flip/manager'
import { leagueHour, parseFeedHour, type FullHour } from '../../src/shared/flip/feed'
import { DEFAULT_FILTERS } from '../../src/shared/flip/routes'
import type { FlipState } from '../../src/shared/types/flip'

const ROOT = join(__dirname, '../..')
const names = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/wealth/exchange-ids.json'), 'utf8')).names
const fees = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/flip/gold-fees.json'), 'utf8'))
const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/allflame-24h.json'), 'utf8')) as Array<{ hour: number; json: unknown }>
const hours: FullHour[] = raw.map((h) => leagueHour(parseFeedHour(h.hour, h.json)!, 'Allflame'))

function setup() {
  const states: FlipState[] = []
  let saved: unknown = null
  const listeners = new Set<() => void>()
  const refreshes: Array<[string, number | undefined]> = []
  const m = new FlipManager({
    feed: {
      refresh: async (league, want) => {
        refreshes.push([league, want])
        return true
      },
      hours: (league) => (league === 'Allflame' ? hours : []),
      onUpdate: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      hasProblem: () => false
    },
    league: async () => 'Allflame',
    loadNames: async () => names,
    loadFees: async () => fees,
    loadConfig: async () => saved,
    saveConfig: async (c) => {
      saved = c
    },
    emit: (s) => states.push(s)
  })
  return { m, states, refreshes, saved: () => saved, update: () => listeners.forEach((cb) => cb()) }
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
