import { describe, expect, it } from 'vitest'
import { FALLBACK_LEAGUES, filterTradeLeagues, pickAutoLeague, resolveLeague } from '../../src/main/net/leagueRules'

// Ответ www.pathofexile.com/api/trade/data/leagues (2026-10-28, сокращён) + приватная лига.
const RAW = [
  { id: 'Allflame', realm: 'pc', text: 'Allflame' },
  { id: 'Hardcore Allflame', realm: 'pc', text: 'Hardcore Allflame' },
  { id: 'Ruthless Allflame', realm: 'pc', text: 'Ruthless Allflame' },
  { id: 'HC Ruthless Allflame', realm: 'pc', text: 'HC Ruthless Allflame' },
  { id: 'Standard', realm: 'pc', text: 'Standard' },
  { id: 'Hardcore', realm: 'pc', text: 'Hardcore' },
  { id: 'Ruthless', realm: 'pc', text: 'Ruthless' },
  { id: 'Hardcore Ruthless', realm: 'pc', text: 'Hardcore Ruthless' },
  { id: 'My League (PL12345)', realm: 'pc', text: 'My League (PL12345)' },
  { id: 'Allflame', realm: 'xbox', text: 'Allflame' },
  { id: 'Standard', realm: 'sony', text: 'Standard' }
]

describe('лиги PoE1', () => {
  it('только realm pc, без Ruthless и приватных', () => {
    expect(filterTradeLeagues(RAW).map((l) => l.id)).toEqual(['Allflame', 'Hardcore Allflame', 'Standard', 'Hardcore'])
  })

  it('мусор во входе не ломает', () => {
    expect(filterTradeLeagues(null)).toEqual([])
    expect(filterTradeLeagues([{ id: 5 }, null, { id: ' ' }, { id: 'Standard' }])).toEqual([
      { id: 'Standard', text: 'Standard' }
    ])
  })

  it('auto = текущая челлендж-лига (софткор, не постоянная)', () => {
    expect(pickAutoLeague(filterTradeLeagues(RAW))).toBe('Allflame')
  })

  it('13.11: появилась новая лига — auto переключается сама', () => {
    const next = [
      { id: 'Keepers 3.30', realm: 'pc', text: 'Keepers 3.30' },
      { id: 'Hardcore Keepers 3.30', realm: 'pc', text: 'Hardcore Keepers 3.30' },
      ...RAW
    ]
    expect(pickAutoLeague(filterTradeLeagues(next))).toBe('Keepers 3.30')
  })

  it('между лигами (только постоянные) — Standard', () => {
    expect(pickAutoLeague(filterTradeLeagues(RAW.slice(4)))).toBe('Standard')
    expect(pickAutoLeague(FALLBACK_LEAGUES)).toBe('Standard')
    expect(pickAutoLeague([{ id: 'HC SSF Allflame', text: '' }, { id: 'Hardcore', text: '' }])).toBe('HC SSF Allflame')
  })

  it("выбор пользователя: 'auto', своя лига, пропавшая лига → auto (stale)", () => {
    const list = filterTradeLeagues(RAW)
    expect(resolveLeague('auto', list, 'Allflame')).toEqual({ effective: 'Allflame', stale: false })
    expect(resolveLeague('Hardcore', list, 'Allflame')).toEqual({ effective: 'Hardcore', stale: false })
    expect(resolveLeague('Settlers', list, 'Allflame')).toEqual({ effective: 'Allflame', stale: true })
    // список не с сервера (нет сети) — выбор пользователя не перечим
    expect(resolveLeague('Settlers', FALLBACK_LEAGUES, 'Standard', false)).toEqual({
      effective: 'Settlers',
      stale: false
    })
  })
})

// Ответ www.pathofexile.com/api/trade2/data/leagues (S47, 30.10.2026): realm у всех poe2.
const RAW2 = [
  { id: 'Forbidden Rites', realm: 'poe2', text: 'Forbidden Rites' },
  { id: 'HC Forbidden Rites', realm: 'poe2', text: 'HC Forbidden Rites' },
  { id: 'Runes of Aldur', realm: 'poe2', text: 'Runes of Aldur' },
  { id: 'HC Runes of Aldur', realm: 'poe2', text: 'HC Runes of Aldur' },
  { id: 'Standard', realm: 'poe2', text: 'Standard' },
  { id: 'Hardcore', realm: 'poe2', text: 'Hardcore' }
]

describe('лиги PoE2 (trade2)', () => {
  it('realm poe2: фильтр PoE1 (pc) их отбрасывает, свой — оставляет', () => {
    expect(filterTradeLeagues(RAW2)).toEqual([])
    expect(filterTradeLeagues(RAW2, 'poe2').map((l) => l.id)).toEqual(RAW2.map((l) => l.id))
    expect(filterTradeLeagues(RAW, 'poe2')).toEqual([])
  })

  it('auto = первая софткор-лига (как у PoE1)', () => {
    expect(pickAutoLeague(filterTradeLeagues(RAW2, 'poe2'))).toBe('Forbidden Rites')
  })
})
