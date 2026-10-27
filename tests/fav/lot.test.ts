import { describe, expect, it } from 'vitest'
import { QUERY_JSON_MAX, buildQueryUrl, lotQuery, parseTradeUrl, queryParam } from '@shared/favorites'

// «Открыть лот»: запрос сайта, сужающий выдачу до одного предмета продавца, — в адресе ?q=<JSON>.

describe('lotQuery', () => {
  it('продавец + имя + база + уровень предмета', () => {
    expect(lotQuery({ account: 'Seller#1234', name: 'Doom Stride', typeLine: 'Leather Boots', ilvl: 84 })).toEqual({
      query: {
        status: { option: 'any' },
        type: 'Leather Boots',
        name: 'Doom Stride',
        filters: {
          trade_filters: { filters: { account: { input: 'Seller#1234' } } },
          misc_filters: { filters: { ilvl: { min: 84, max: 84 } } }
        }
      },
      sort: { price: 'asc' }
    })
  })

  it('без имени и продавца — только база; без базы — null', () => {
    expect(lotQuery({ typeLine: '  Кожаные   сапоги ' })).toEqual({
      query: { status: { option: 'any' }, type: 'Кожаные сапоги' },
      sort: { price: 'asc' }
    })
    expect(lotQuery({ typeLine: '' })).toBeNull()
    expect(lotQuery({ typeLine: 'X', ilvl: 0 })?.query).not.toHaveProperty('filters')
    expect(lotQuery({ typeLine: 'X', ilvl: 1.5 })?.query).not.toHaveProperty('filters')
  })
})

describe('адрес с запросом', () => {
  it('?q=<JSON> на странице лиги, разбирается обратно', () => {
    const json = queryParam(lotQuery({ account: 'A', typeLine: 'Leather Boots' }))!
    const url = buildQueryUrl('ru.pathofexile.com', 'poe1', 'search', 'Hardcore Mercenaries', json)
    expect(url.startsWith('https://ru.pathofexile.com/trade/search/Hardcore%20Mercenaries?q=')).toBe(true)
    expect(JSON.parse(new URL(url).searchParams.get('q')!)).toEqual(JSON.parse(json))
    expect(parseTradeUrl(url)).toMatchObject({ league: 'Hardcore Mercenaries', slug: null, type: 'search' })
  })

  it('queryParam: только объект и не длиннее предела', () => {
    expect(queryParam(null)).toBeNull()
    expect(queryParam([1])).toBeNull()
    expect(queryParam('x')).toBeNull()
    expect(queryParam({ q: 'x'.repeat(QUERY_JSON_MAX) })).toBeNull()
    expect(queryParam({ query: {} })).toBe('{"query":{}}')
  })
})
