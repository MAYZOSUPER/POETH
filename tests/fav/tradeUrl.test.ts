import { describe, expect, it } from 'vitest'
import { buildTradeUrl, parseTradeUrl } from '@shared/favorites'

// Адреса сайта трейда: www/ru, search/exchange, лиги с пробелами, PoE2 (trade2/poe2).

describe('parseTradeUrl', () => {
  it('поиск PoE1 на www', () => {
    expect(parseTradeUrl('https://www.pathofexile.com/trade/search/Standard/Lk9a2bQ')).toEqual({
      host: 'www.pathofexile.com',
      game: 'poe1',
      type: 'search',
      league: 'Standard',
      slug: 'Lk9a2bQ'
    })
  })

  it('обмен на ru, лига с пробелом, хвост ?q и #', () => {
    expect(parseTradeUrl('https://ru.pathofexile.com/trade/exchange/Hardcore%20Mercenaries/8YkX3Pz?q=1#x')).toEqual({
      host: 'ru.pathofexile.com',
      game: 'poe1',
      type: 'exchange',
      league: 'Hardcore Mercenaries',
      slug: '8YkX3Pz'
    })
  })

  it('страница без сохранённого поиска — slug null', () => {
    expect(parseTradeUrl('https://www.pathofexile.com/trade/search/Standard')?.slug).toBeNull()
    expect(parseTradeUrl('https://www.pathofexile.com/trade/search/Standard/')?.slug).toBeNull()
  })

  it('PoE2: trade2 + realm poe2', () => {
    expect(parseTradeUrl('https://www.pathofexile.com/trade2/search/poe2/Standard/abc123')).toMatchObject({
      game: 'poe2',
      type: 'search',
      league: 'Standard',
      slug: 'abc123'
    })
    expect(parseTradeUrl('https://www.pathofexile.com/trade2/search/Standard/abc123')).toBeNull()
  })

  it('не сайт трейда — null', () => {
    for (const url of [
      'http://www.pathofexile.com/trade/search/Standard/Lk9a2bQ',
      'https://pathofexile.com.evil.com/trade/search/Standard/Lk9a2bQ',
      'https://www.pathofexile.com/forum/view-thread/1',
      'https://www.pathofexile.com/trade/about',
      'https://www.pathofexile.com/trade/search/Standard/bad-slug',
      'https://www.pathofexile.com/trade/search/Standard/Lk9a2bQ/extra',
      'https://www.pathofexile.com/trade/search/%E0%A4%A',
      'не url',
      42
    ]) {
      expect(parseTradeUrl(url), String(url)).toBeNull()
    }
  })

  it('туда-обратно через buildTradeUrl', () => {
    const cases = [
      ['www.pathofexile.com', 'poe1', 'search', 'Standard', 'Lk9a2bQ'],
      ['ru.pathofexile.com', 'poe1', 'exchange', 'Hardcore Mercenaries', 'X1'],
      ['www.pathofexile.com', 'poe2', 'search', 'Dawn of the Hunt', 'Ab9'],
      ['www.pathofexile.com', 'poe1', 'search', 'SSF Standard', null]
    ] as const
    for (const [host, game, type, league, slug] of cases) {
      const url = buildTradeUrl(host, game, type, league, slug)
      expect(parseTradeUrl(url), url).toEqual({ host, game, type, league, slug })
    }
    expect(buildTradeUrl('www.pathofexile.com', 'poe1', 'search', 'Hardcore Mercenaries', 'Lk9')).toBe(
      'https://www.pathofexile.com/trade/search/Hardcore%20Mercenaries/Lk9'
    )
  })
})
