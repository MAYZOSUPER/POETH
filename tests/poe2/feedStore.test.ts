import { describe, expect, it } from 'vitest'
import { FEED_URL, FEED_URL_POE2, FeedStore } from '../../src/main/games/poe1/exchange/feedStore'
import type { FullHour } from '../../src/shared/flip/feed'

// S61: тот же FeedStore для фида PoE 2 — свой адрес (realm poe2) и меньше часов «сразу» (час PoE 2 ~2 МБ).

const M = 'Metadata/Items/'
const NOW = 1_793_473_260_000
const CUR = Math.floor(NOW / 3_600_000) * 3600

function feedJson(): unknown {
  return {
    next_change_id: 0,
    markets: [
      {
        league: 'Forbidden Rites',
        market_pair: [`${M}Currency/CurrencyModValues`, `${M}Currency/CurrencyAddModToRare`],
        volume_traded: { [`${M}Currency/CurrencyModValues`]: 10, [`${M}Currency/CurrencyAddModToRare`]: 6900 },
        lowest_ratio: {},
        highest_ratio: {},
        lowest_stock: {},
        highest_stock: {}
      }
    ]
  }
}

function setup(firstHours?: number) {
  const disk = new Map<number, FullHour>()
  const urls: string[] = []
  const store = new FeedStore({
    url: FEED_URL_POE2,
    ...(firstHours ? { firstHours } : {}),
    getJson: async (url) => {
      urls.push(url)
      const hour = Number(url.split('/').pop())
      return hour >= CUR ? { status: 404, json: null } : { status: 200, json: feedJson() }
    },
    readHour: async (h) => disk.get(h) ?? null,
    writeHour: async (h) => void disk.set(h.hour, h),
    listHours: async () => [...disk.keys()],
    removeHour: async (h) => void disk.delete(h),
    now: () => NOW,
    sleep: async () => undefined
  })
  return { store, urls }
}

describe('фид обмена PoE 2', () => {
  it('адрес — …/currency-exchange/poe2/<час>', () => {
    expect(FEED_URL_POE2).toBe(`${FEED_URL}/poe2`)
  })

  it('сразу — только firstHours свежих часов, остальные до want — фоном', async () => {
    const { store, urls } = setup(3)
    expect(await store.refresh('Forbidden Rites', 12)).toBe(true)
    // три часа — до возврата из refresh, дальше фон (sleep в тесте мгновенный)
    expect(urls.slice(0, 3)).toEqual([1, 2, 3].map((i) => `${FEED_URL_POE2}/${CUR - i * 3600}`))
    await new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < 20 && store.hours('Forbidden Rites').length < 12; i++) await new Promise((r) => setTimeout(r, 0))
    expect(store.hours('Forbidden Rites')).toHaveLength(12)
    expect(new Set(urls).size).toBe(12)
    expect(urls.every((u) => u.startsWith(`${FEED_URL_POE2}/`))).toBe(true)
  })

  it('без firstHours — как у PoE 1: сразу до 24 часов', async () => {
    const { store, urls } = setup()
    await store.refresh('Forbidden Rites', 6)
    expect(urls).toHaveLength(6)
  })
})
