import { gunzipSync, gzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { buildTradeUrl, parseTradeUrl } from '@shared/favorites'
import {
  QUERY_JSON_MAX,
  innerQuery,
  lotQuery,
  lotSearchQuery,
  queryParam,
  searchStateId,
  targetQuery
} from '@shared/favorites/lot'

// «Открыть лот» (S21): адрес …/search/<лига>/<состояние>, состояние — gzip + base64url запроса, как у сайта.
// В rc.7 лот открывался запросом с именем предмета — у редкого оно случайное, API отвечает 400 «Unknown item
// name», и сайт пишет «Failed to load search state. The search is no longer valid.».

const gzip = (json: string): Uint8Array => gzipSync(json)
/** Обратная операция — как сервер сайта разбирает состояние из адреса. */
function decodeState(id: string): unknown {
  return JSON.parse(gunzipSync(Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'))
}

/** Тело поиска окна цены (createTradeRequest): редкий пояс, свойства, статус «купить сразу». */
const SEARCH = {
  query: {
    status: { option: 'available' },
    stats: [{ type: 'and', filters: [{ id: 'explicit.stat_3299347043', value: { min: 70 }, disabled: false }] }],
    filters: {
      type_filters: { filters: { category: { option: 'accessory.belt' }, rarity: { option: 'nonunique' } } },
      misc_filters: { filters: { corrupted: { option: 'false' } } },
      trade_filters: { filters: { collapse: { option: 'true' } }, disabled: true }
    }
  },
  sort: { price: 'asc' }
}

const RARE = { account: 'tehchopi#1140', name: 'Apocalypse Lash', typeLine: 'Leather Belt', ilvl: 83, rarity: 'rare' } as const

describe('исходный поиск, суженный до лота', () => {
  it('тот же запрос + продавец с #, ilvl лота и статус «Все»; имени нет', () => {
    const q = lotSearchQuery(SEARCH, RARE)!
    expect(q).toEqual({
      status: { option: 'any' },
      stats: SEARCH.query.stats,
      filters: {
        type_filters: SEARCH.query.filters.type_filters,
        misc_filters: { filters: { corrupted: { option: 'false' }, ilvl: { min: 83, max: 83 } } },
        // группа включена, свёртку по аккаунту сайт и так покажет
        trade_filters: { filters: { collapse: { option: 'true' }, account: { input: 'tehchopi#1140' } } }
      }
    })
    expect(JSON.stringify(q)).not.toContain('Apocalypse Lash')
    // исходный запрос не тронут
    expect(SEARCH.query.status.option).toBe('available')
    expect(SEARCH.query.filters.trade_filters).toHaveProperty('disabled', true)
  })

  it('без фильтров и без ilvl; сам query без обёртки', () => {
    expect(lotSearchQuery({ status: { option: 'securable' }, type: 'Leather Belt' }, { account: 'A#0001', typeLine: 'Leather Belt' })).toEqual({
      status: { option: 'any' },
      type: 'Leather Belt',
      filters: { trade_filters: { filters: { account: { input: 'A#0001' } } } }
    })
  })

  it('без продавца не сузить → null (откроется исходный поиск)', () => {
    expect(lotSearchQuery(SEARCH, { typeLine: 'Leather Belt' })).toBeNull()
    expect(lotSearchQuery(SEARCH, { account: '  ', typeLine: 'Leather Belt' })).toBeNull()
    expect(lotSearchQuery(null, RARE)).toBeNull()
    expect(lotSearchQuery({ query: 'x' }, RARE)).toBeNull()
  })
})

describe('лот без исходного поиска (live)', () => {
  it('база + продавец + ilvl + редкость; имя не уходит в запрос', () => {
    expect(lotQuery(RARE)).toEqual({
      status: { option: 'any' },
      type: 'Leather Belt',
      filters: {
        type_filters: { filters: { rarity: { option: 'rare' } } },
        trade_filters: { filters: { account: { input: 'tehchopi#1140' } } },
        misc_filters: { filters: { ilvl: { min: 83, max: 83 } } }
      }
    })
    // уник — тоже без имени: его отличает редкость
    expect(lotQuery({ account: 'B#2', name: 'Umbilicus Immortalis', typeLine: 'Leather Belt', rarity: 'unique' })).not.toHaveProperty('name')
  })

  it('магический — база (не typeLine с аффиксами); RU-база как есть; без базы — null', () => {
    expect(lotQuery({ account: 'M#3', typeLine: 'Sapphire Ring', rarity: 'magic', ilvl: 1 })?.type).toBe('Sapphire Ring')
    expect(lotQuery({ typeLine: '  Кожаный   пояс ' })).toEqual({ status: { option: 'any' }, type: 'Кожаный пояс' })
    expect(lotQuery({ typeLine: '' })).toBeNull()
    expect(lotQuery({ typeLine: 'X', ilvl: 0 })).not.toHaveProperty('filters')
    expect(lotQuery({ typeLine: 'X', ilvl: 1.5 })).not.toHaveProperty('filters')
    expect(lotQuery({ typeLine: 'X', rarity: 'gem' as never })).not.toHaveProperty('filters')
  })
})

describe('цель трейд-окна → запрос', () => {
  it('лот + поиск → суженный поиск; только лот → lotQuery; только запрос → он сам', () => {
    expect(targetQuery({ lot: RARE, query: SEARCH })).toEqual(lotSearchQuery(SEARCH, RARE))
    expect(targetQuery({ lot: RARE })).toEqual(lotQuery(RARE))
    expect(targetQuery({ query: SEARCH })).toEqual(SEARCH.query)
    expect(targetQuery({})).toBeNull()
  })

  it('лот без продавца при исходном поиске и слишком длинный запрос → null (откроется url)', () => {
    expect(targetQuery({ lot: { typeLine: 'Leather Belt' }, query: SEARCH })).toBeNull()
    const huge = { query: { type: 'x', stats: [{ type: 'and', filters: [{ id: 'x'.repeat(QUERY_JSON_MAX) }] }] } }
    expect(targetQuery({ lot: RARE, query: huge })).toBeNull()
  })
})

describe('состояние поиска в адресе — как у сайта', () => {
  it('gzip + base64url от query: сервер разбирает обратно, без +/= в адресе', () => {
    const id = searchStateId(lotSearchQuery(SEARCH, RARE), gzip)!
    expect(id).toMatch(/^H4sI[A-Za-z0-9_-]+$/)
    expect(decodeState(id)).toEqual(lotSearchQuery(SEARCH, RARE))
    // обёртку {query, sort} сайт в состояние не кладёт
    expect(decodeState(searchStateId(SEARCH, gzip)!)).toEqual(SEARCH.query)
  })

  it('id из ответа API читается тем же способом (проверено на живом API 29.10)', () => {
    // POST /api/trade/search/Allflame {"query":{"status":{"option":"any"},"type":"Leather Belt"}} → id
    expect(decodeState('H4sIAAAAAAAAA6tWKi5JLCktVrKqVsovKMnMz1OyUkrMq1Sq1VEqqSxIBfJ8UhNLMlKLFJxSc0qUagHxxm0xMQAAAA')).toEqual({
      status: { option: 'any' },
      type: 'Leather Belt'
    })
  })

  it('адрес лота: лига закодирована, # продавца — внутри сжатого состояния', () => {
    const id = searchStateId(lotSearchQuery(SEARCH, RARE), gzip)!
    const url = buildTradeUrl('www.pathofexile.com', 'poe1', 'search', 'Hardcore Allflame', id)
    expect(url).toBe(`https://www.pathofexile.com/trade/search/Hardcore%20Allflame/${id}`)
    expect(url).not.toContain('#')
    expect(url).not.toContain('?')
    expect(new URL(url).pathname.split('/').pop()).toBe(id)
  })

  it('не объект или слишком длинный → null', () => {
    expect(searchStateId(null, gzip)).toBeNull()
    expect(searchStateId({ q: 'x'.repeat(QUERY_JSON_MAX) }, gzip)).toBeNull()
  })
})

describe('помощники', () => {
  it('innerQuery: тело → query, query → он сам', () => {
    expect(innerQuery(SEARCH)).toBe(SEARCH.query)
    expect(innerQuery(SEARCH.query)).toBe(SEARCH.query)
    expect(innerQuery([1])).toBeNull()
    expect(innerQuery({ query: null })).toBeNull()
  })

  it('queryParam: только объект и не длиннее предела', () => {
    expect(queryParam(null)).toBeNull()
    expect(queryParam([1])).toBeNull()
    expect(queryParam('x')).toBeNull()
    expect(queryParam({ q: 'x'.repeat(QUERY_JSON_MAX) })).toBeNull()
    expect(queryParam({ query: {} })).toBe('{"query":{}}')
  })

  it('адрес поиска с id из base64url (с - и _) строится как есть', () => {
    const url = buildTradeUrl('ru.pathofexile.com', 'poe1', 'search', 'Allflame', 'H4sI_a-b')
    expect(url).toBe('https://ru.pathofexile.com/trade/search/Allflame/H4sI_a-b')
    // разбор таких id — отдельная задача избранного (SLUG_RE без - и _)
    expect(parseTradeUrl('https://ru.pathofexile.com/trade/search/Allflame')).toMatchObject({ slug: null })
  })
})
