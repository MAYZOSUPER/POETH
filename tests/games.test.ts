import { describe, expect, it } from 'vitest'
import { GAMES, GAME_IDS, apiUrl, getGameDef, isGameId, liveUrl, siteUrl } from '@shared/games'

const poe1 = GAMES.poe1
const poe2 = GAMES.poe2
const WWW = 'www.pathofexile.com'
const RU = 'ru.pathofexile.com'

describe('GameDef', () => {
  it('таблица согласована', () => {
    expect(GAME_IDS).toEqual(['poe1', 'poe2'])
    for (const id of GAME_IDS) {
      expect(getGameDef(id).id).toBe(id)
      expect(getGameDef(id).dataDir).toBe(id)
      expect(getGameDef(id).logSubdirs.length).toBeGreaterThan(0)
    }
    expect(poe1.windowTitle).toBe('Path of Exile')
    expect(poe2.windowTitle).toBe('Path of Exile 2')
    expect(poe1.tradeSeg).toBe('trade')
    expect(poe2.tradeSeg).toBe('trade2')
  })

  it('функции по играм: кампания только PoE2, трейд-фичи v0.1 — PoE1', () => {
    expect(poe1.features).toEqual({
      campaign: false,
      priceCheck: true,
      live: true,
      regex: true,
      deals: true,
      wealth: true,
      flip: true,
      // прокачка по маршруту (S14) — вкладка «Кампания» в PoE 1
      leveling: true,
      // советник «что фармить» (S16) в v0.1.0 скрыт (в разработке — POETH_ADVISOR=1)
      advisor: false,
      // вкладка «Билд» (S39) — v0.2, в v0.1.0 скрыта (в разработке — POETH_BUILD=1)
      build: false
    })
    expect(GAMES.poe2.features.leveling).toBe(false)
    expect(poe2.features.campaign).toBe(true)
    expect(poe2.features.priceCheck).toBe(true)
    expect(poe2.features.wealth).toBe(false)
    expect(poe2.features.flip).toBe(false)
    expect(poe2.features.advisor).toBe(false)
    expect(poe2.features.build).toBe(false)
  })

  it('isGameId', () => {
    expect(isGameId('poe1')).toBe(true)
    expect(isGameId('poe2')).toBe(true)
    expect(isGameId('poe3')).toBe(false)
    expect(isGameId(undefined)).toBe(false)
  })
})

describe('siteUrl', () => {
  it('PoE1: /trade/search/<league>/<id>', () => {
    expect(siteUrl(poe1, WWW, 'Standard', 'Ab3dEf')).toBe(
      'https://www.pathofexile.com/trade/search/Standard/Ab3dEf'
    )
    expect(siteUrl(poe1, RU, 'Hardcore Mercenaries', 'x1')).toBe(
      'https://ru.pathofexile.com/trade/search/Hardcore%20Mercenaries/x1'
    )
    expect(siteUrl(poe1, WWW, 'Standard', 'q9', 'exchange')).toBe(
      'https://www.pathofexile.com/trade/exchange/Standard/q9'
    )
    expect(siteUrl(poe1, WWW, 'Standard')).toBe('https://www.pathofexile.com/trade/search/Standard')
  })

  it('PoE2: /trade2/search/poe2/<league>/<id> (как в tradeClient компаса)', () => {
    const league = 'Dawn of the Hunt'
    const id = 'abc'
    expect(siteUrl(poe2, WWW, league, id)).toBe(
      `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(id)}`
    )
  })
})

describe('apiUrl', () => {
  it('PoE1: /api/trade/...', () => {
    expect(apiUrl(poe1, WWW, 'search', 'Standard')).toBe(
      'https://www.pathofexile.com/api/trade/search/Standard'
    )
    expect(apiUrl(poe1, RU, 'fetch', 'a,b,c?query=Q1')).toBe(
      'https://ru.pathofexile.com/api/trade/fetch/a,b,c?query=Q1'
    )
    expect(apiUrl(poe1, WWW, 'exchange', encodeURIComponent('Hardcore Settlers'))).toBe(
      'https://www.pathofexile.com/api/trade/exchange/Hardcore%20Settlers'
    )
    expect(apiUrl(poe1, WWW, 'data/leagues')).toBe(
      'https://www.pathofexile.com/api/trade/data/leagues'
    )
    expect(apiUrl(poe1, WWW, '/data/stats/', '?realm=pc')).toBe(
      'https://www.pathofexile.com/api/trade/data/stats?realm=pc'
    )
  })

  it('PoE2: /api/trade2/... без realm (строки совпадают с tradeClient компаса)', () => {
    const league = 'Dawn of the Hunt'
    const host = 'https://www.pathofexile.com'
    expect(apiUrl(poe2, WWW, 'data/leagues')).toBe(`${host}/api/trade2/data/leagues`)
    expect(apiUrl(poe2, WWW, 'search', encodeURIComponent(league))).toBe(
      `${host}/api/trade2/search/${encodeURIComponent(league)}`
    )
    const ids = ['h1', 'h2']
    expect(apiUrl(poe2, WWW, 'fetch', `${ids.join(',')}?query=${encodeURIComponent('S1')}`)).toBe(
      `${host}/api/trade2/fetch/${ids.join(',')}?query=${encodeURIComponent('S1')}`
    )
    expect(apiUrl(poe2, WWW, 'search', 'x')).not.toContain('realm')
  })
})

describe('liveUrl', () => {
  it('PoE1: wss://<host>/api/trade/live/<league>/<id>', () => {
    expect(liveUrl(poe1, WWW, 'Standard', 'Zx9')).toBe(
      'wss://www.pathofexile.com/api/trade/live/Standard/Zx9'
    )
    expect(liveUrl(poe1, RU, 'Hardcore Mercenaries', 'q')).toBe(
      'wss://ru.pathofexile.com/api/trade/live/Hardcore%20Mercenaries/q'
    )
  })
})
