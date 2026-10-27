import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, registeredStatRefs, type ParsedItem } from '@shared/poe1/parser'
import {
  TRADE_STATUSES,
  buildRequest,
  bulkOffersByCurrency,
  createPriceCheck,
  localizeTradeRequest,
  type BulkSearchResult,
  type TradeRequest,
  type FilterGroup,
  type FilterPreset,
  type PriceCheckOptions,
  type StatFilter
} from '@shared/poe1/pricecheck'
import { fixtureNames, readFixture, store } from '../poe1/helpers'

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function parse(lang: Poe1Lang, name: string): ParsedItem {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  return res.value
}

const LEAGUE = 'Standard'

function check(lang: Poe1Lang, name: string, opts: Partial<PriceCheckOptions> = {}) {
  const item = parse(lang, name)
  const pc = createPriceCheck(item, data[lang], { league: LEAGUE, ...opts })
  return { item, ...pc, preset: pc.presets.find((p) => p.id === pc.active)! }
}

/** То, что реально уходит в сеть (JSON без undefined). */
function requests(lang: Poe1Lang, name: string, opts: Partial<PriceCheckOptions> = {}) {
  const { item, presets, active } = check(lang, name, opts)
  return JSON.parse(
    JSON.stringify({
      active,
      presets: presets.map((p) => ({ id: p.id, timeless: p.timeless, request: buildRequest(item, data[lang], p) }))
    })
  )
}

const timelessGroup = (p: FilterPreset) =>
  p.stats.find((s): s is FilterGroup => s.group === 'one' && s.kind === 'timeless')!

const NAMES = fixtureNames('en')

describe('запрос по каждой фикстуре', () => {
  it.each(NAMES)('%s: снапшот JSON запроса', (name) => {
    expect(requests('en', name)).toMatchSnapshot()
  })

  it.each(NAMES)('%s: EN и RU дают одинаковый запрос (только английские имена и trade id)', (name) => {
    const en = requests('en', name)
    const ru = requests('ru', name)
    expect(ru).toEqual(en)
    expect(JSON.stringify(ru)).not.toMatch(/[А-Яа-яЁё]/)
  })
})

describe('статус листингов', () => {
  it('по умолчанию available (instant buyout + in person), со схлопыванием аккаунтов', () => {
    const body = requests('en', 'jewellery-01').presets[0].request.body
    expect(body.query.status).toEqual({ option: 'available' })
    expect(body.query.filters.trade_filters.filters.collapse).toEqual({ option: 'true' })
  })

  it.each(TRADE_STATUSES)('переключатель: %s', (status) => {
    const body = requests('ru', 'jewellery-01', { status }).presets[0].request.body
    expect(body.query.status).toEqual({ option: status })
    // мерчант-листинги не схлопываются (у каждого своя цена выкупа)
    expect(Boolean(body.query.filters.trade_filters?.filters.collapse)).toBe(status !== 'securable')
  })
})

describe('фильтры модов', () => {
  it('±10% от ролла по умолчанию, в пределах диапазона тира; goodness по тиру', () => {
    const { preset } = check('ru', 'adv-ring')
    const accuracy = preset.stats.find((s): s is StatFilter => !s.group && s.statRef === '+# to Accuracy Rating')!
    expect(accuracy.roll).toMatchObject({ value: 120, min: 108, bounds: { min: 100, max: 130 } })
    expect(accuracy.roll!.goodness).toBeCloseTo(2 / 3)
    // шире диапазона тира не ищем
    const wide = check('ru', 'adv-ring', { searchStatRange: 30 }).preset
    expect(wide.stats.find((s): s is StatFilter => !s.group && s.statRef === '+# to Accuracy Rating')!.roll!.min).toBe(100)
  })

  it('псевдо-статы: сумма сопротивлений и здоровья', () => {
    const { preset } = check('en', 'adv-ring')
    const refs = preset.stats.filter((s): s is StatFilter => !s.group).map((s) => s.statRef)
    expect(refs).toContain('+#% total Elemental Resistance')
    expect(refs).toContain('+# total maximum Life')
  })

  it('пресеты: редкий предмет с влиянием — pseudo + base_item; уник — только pseudo; валюта — exact', () => {
    expect(check('en', 'jewellery-01').presets.map((p) => p.id)).toEqual(['filters.preset_pseudo', 'filters.preset_base_item'])
    expect(check('en', 'unique-01').presets.map((p) => p.id)).toEqual(['filters.preset_pseudo'])
    expect(check('en', 'manual-currency-01').presets.map((p) => p.id)).toEqual(['filters.preset_exact'])
    expect(check('en', 'map-01').presets.map((p) => p.id)).toEqual(['filters.preset_bulk'])
  })

  it('тексты фильтров — на языке предмета, ref — английский', () => {
    const ru = check('ru', 'adv-ring').preset
    const filter = ru.stats.find((s): s is StatFilter => !s.group && s.statRef === '+# to Accuracy Rating')!
    expect(filter.text).toBe('# к меткости')
  })

  it('данные другого языка — ошибка', () => {
    expect(() => createPriceCheck(parse('ru', 'adv-ring'), data.en, { league: LEAGUE })).toThrow()
  })
})

describe('timeless-джуэлы', () => {
  it('Elegant Hubris: count по сиду, по умолчанию точный завоеватель, legacy Chitus в группе', () => {
    for (const lang of ['en', 'ru'] as const) {
      const { preset } = check(lang, 'timeless-01')
      expect(preset.timeless).toMatchObject({
        jewel: 'EH',
        seed: 159200,
        conqueror: 'Cadiro',
        legacy: false,
        mode: 'exact',
        vilsolUrl: 'https://vilsol.github.io/timeless-jewels/tree?jewel=5&conqueror=Cadiro&seed=159200&mode=seed',
        emptyResultKey: 'pc1.timeless.noExact'
      })
      const group = timelessGroup(preset)
      expect(group.stats.map((f) => [f.tradeId[0], f.disabled])).toEqual([
        ['explicit.pseudo_timeless_jewel_cadiro', false],
        ['explicit.pseudo_timeless_jewel_victario', true],
        ['explicit.pseudo_timeless_jewel_caspiro', true],
        ['explicit.pseudo_timeless_jewel_chitus', true]
      ])
      expect(group.stats.every((f) => f.roll?.min === 159200 && f.roll?.max === 159200)).toBe(true)
    }
  })

  it('режим «любой завоеватель»: все id включены, в калькулятор — Any', () => {
    const { preset } = check('ru', 'timeless-01', { timelessConqueror: 'any' })
    expect(timelessGroup(preset).stats.every((f) => !f.disabled)).toBe(true)
    expect(preset.timeless?.vilsolUrl).toBe('https://vilsol.github.io/timeless-jewels/tree?jewel=5&conqueror=Any&seed=159200&mode=seed')
    const count = requests('ru', 'timeless-01', { timelessConqueror: 'any' }).presets[0].request.body.query.stats[1]
    expect(count).toMatchObject({ type: 'count', value: { min: 1 }, disabled: false })
    expect(count.filters).toHaveLength(4)
  })

  it('Lethal Pride: по умолчанию «любой завоеватель» (с legacy Kiloava)', () => {
    const { preset } = check('ru', 'timeless-08')
    expect(preset.timeless).toMatchObject({ jewel: 'LP', conqueror: 'Rakiata', mode: 'any' })
    expect(timelessGroup(preset).stats.map((f) => f.tradeId[0])).toContain('explicit.pseudo_timeless_jewel_kiloava')
    expect(timelessGroup(preset).stats.every((f) => !f.disabled)).toBe(true)
  })

  it('legacy-завоеватель Venarius (нет в данных APT): точный поиск по своему id', () => {
    for (const lang of ['en', 'ru'] as const) {
      const { preset } = check(lang, 'timeless-02')
      expect(preset.timeless).toMatchObject({ jewel: 'MF', seed: 2085, conqueror: 'Venarius', legacy: true, mode: 'exact' })
      const enabled = timelessGroup(preset).stats.filter((f) => !f.disabled)
      expect(enabled.map((f) => f.tradeId[0])).toEqual(['explicit.pseudo_timeless_jewel_venarius'])
      expect(enabled[0].roll).toMatchObject({ min: 2085, max: 2085 })
    }
  })

  it('Militant Faith: моды преданности — видимые опциональные фильтры', () => {
    const { preset } = check('ru', 'timeless-09')
    const devotion = preset.stats.filter((s): s is StatFilter => !s.group && / per 10 Devotion$/.test(s.statRef))
    expect(devotion).toHaveLength(2)
    expect(devotion.every((f) => f.disabled && !f.hidden)).toBe(true)
  })

  it('Abyss-джуэл: калькулятора нет — подсказка про PoB', () => {
    const item = parse('en', 'timeless-01')
    const kurgal = data.en.statByRefV2('Subjugating # souls in the thrall of Kurgal')
    if (!kurgal || 'stats' in kurgal) throw new Error('нет стата Kurgal')
    const calc = item.statsByType.find((c) => c.stat.ref.startsWith('Commissioned'))!
    const abyss: ParsedItem = {
      ...item,
      statsByType: item.statsByType.map((c) => (c === calc ? { ...c, stat: kurgal } : c))
    }
    const preset = createPriceCheck(abyss, data.en, { league: LEAGUE }).presets[0]
    expect(preset.timeless).toMatchObject({ jewel: 'ABYSS', conqueror: 'Kurgal', pobHint: true, mode: 'any' })
    expect(preset.timeless?.vilsolUrl).toBeUndefined()
    expect(timelessGroup(preset).stats.map((f) => f.tradeId[0])).toContain('explicit.pseudo_timeless_jewel_zorath')
  })
})

describe('имена под хост трейда', () => {
  // adv-ring ищется по категории (без имени), map-01 — по id области (от языка не зависит)
  it.each([
    ['unique-01', true],
    ['gem-01', true],
    ['card-01', true],
    ['flask-01', true],
    ['timeless-01', true],
    ['adv-ring', false],
    ['map-01', false]
  ] as const)(
    '%s: ru.pathofexile.com — русские имена, одинаковые для EN и RU предмета; id статов те же',
    (name, hasNames) => {
      const www = requests('en', name).presets[0].request
      const fromEn = localizeTradeRequest(requests('en', name).presets[0].request.body as TradeRequest, data.ru)
      const fromRu = localizeTradeRequest(requests('ru', name).presets[0].request.body as TradeRequest, data.ru)
      expect(fromRu).toEqual(fromEn)
      expect(fromEn.query.stats).toEqual(www.body.query.stats)
      const names = JSON.stringify([fromEn.query.name, fromEn.query.type])
      if (hasNames) expect(names).toMatch(/[А-Яа-яЁё]/)
      else expect(names).not.toMatch(/[A-Za-z]{4,} [A-Za-z]/)
      expect(localizeTradeRequest(www.body as TradeRequest, data.en)).toEqual(www.body)
    }
  )

  it('уник: name и type — как в RU-клиенте', () => {
    const ru = localizeTradeRequest(requests('en', 'unique-01').presets[0].request.body as TradeRequest, data.ru)
    expect(ru.query.name).toBe('Дыхание Ши')
    expect(ru.query.type).toBe('Амулет из ракушек')
  })
})

describe('bulk-обмен', () => {
  it('валюта → /api/trade/exchange, want = trade tag, платим не той же валютой', () => {
    for (const lang of ['en', 'ru'] as const) {
      const req = requests(lang, 'manual-currency-01').presets[0].request
      expect(req).toEqual({
        api: 'bulk',
        league: LEAGUE,
        body: {
          engine: 'new',
          query: { have: ['divine'], want: ['chaos'], status: { option: 'online' } },
          sort: { have: 'asc' }
        }
      })
    }
  })

  it('статус any и фильтр стопки → minimum', () => {
    const req = requests('ru', 'manual-currency-01', { status: 'any', activateStockFilter: true }).presets[0].request
    expect(req.body.query).toMatchObject({ status: { option: 'any' }, minimum: 7 })
  })

  it('разбор ответа: курс по валюте, от дешёвых', () => {
    const offer = (id: string, currency: string, amount: number, items: number) => ({
      id,
      listing: {
        indexed: '2026-10-28T00:00:00Z',
        offers: [{ exchange: { currency, amount }, item: { amount: items, stock: 100 } }],
        account: { name: `acc-${id}`, lastCharacterName: `char-${id}`, online: {} }
      }
    })
    const res: BulkSearchResult = {
      id: 'q',
      total: 3,
      result: { a: offer('a', 'chaos', 10, 1), b: offer('b', 'chaos', 15, 2), c: offer('c', 'divine', 1, 200) }
    }
    const by = bulkOffersByCurrency(res, ['divine', 'chaos'])
    expect(by.chaos.map((o) => o.id)).toEqual(['b', 'a'])
    expect(by.divine[0]).toMatchObject({ itemAmount: 200, accountStatus: 'online' })
  })
})

it('все ref, на которые ссылается код прайс-чека (stat()), есть в данных en и ru', () => {
  const refs = registeredStatRefs()
  expect(refs.length).toBeGreaterThan(60)
  for (const lang of ['en', 'ru'] as const) {
    for (const ref of refs) expect(data[lang].statByRefV2(ref), `${lang}: ${ref}`).toBeDefined()
  }
})
