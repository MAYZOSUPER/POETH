// S47: фильтры прайс-чека и тело запроса trade2 для PoE2 (порт Exiled Exchange 2) — по каждой фикстуре.
import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe2Data, Poe2Lang } from '@shared/poe2/data'
import { ItemCategory, createVirtualItem, parseClipboard, parseItem, registeredStatRefs, type ParsedItem } from '@shared/poe2/parser'
import {
  DEFAULT_BULK_HAVE,
  LISTING_TYPES,
  buildRequest,
  createPriceCheck,
  fallbackToFilter,
  type BulkRequest,
  type FilterPreset,
  type PriceCheckOptions,
  type PriceCheckRequest,
  type StatFilter,
  type TradeRequest
} from '@shared/poe2/pricecheck'
import { fixtureNames, readFixture, store } from './helpers'

let data: Record<Poe2Lang, Poe2Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

const LEAGUE = 'Standard'

/** Как окно цены: язык по строке класса; у мета-камней её нет — данными языка фикстуры. */
function parse(lang: Poe2Lang, name: string): ParsedItem {
  const text = readFixture(lang, name)
  let res = parseItem(text, data)
  if (!res.ok && res.error === 'item.unknown_lang') res = parseClipboard(text, data[lang])
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error} ${res.detail ?? ''}`)
  return res.value
}

function check(lang: Poe2Lang, name: string, opts: Partial<PriceCheckOptions> = {}) {
  const item = parse(lang, name)
  const pc = createPriceCheck(item, data[lang], { league: LEAGUE, ...opts })
  return { item, ...pc, preset: pc.presets.find((p) => p.id === pc.active)! }
}

/** То, что реально уходит в сеть (JSON без undefined). */
function json<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function request(lang: Poe2Lang, name: string, opts: Partial<PriceCheckOptions> = {}, presetId?: string): PriceCheckRequest {
  const { item, presets, preset } = check(lang, name, opts)
  const p = presetId ? presets.find((x) => x.id === presetId)! : preset
  return json(buildRequest(item, data[lang], p))
}

function trade(lang: Poe2Lang, name: string, opts: Partial<PriceCheckOptions> = {}, presetId?: string): TradeRequest {
  const req = request(lang, name, opts, presetId)
  if (req.api !== 'trade') throw new Error(`${name}: ожидался поиск trade2, а не ${req.api}`)
  return req.body
}

/**
 * Всё, что не зависит от языка: тела запросов всех пресетов и «скелет» фильтров (ref, trade id, роллы).
 * `drop` — фильтры, выкинутые до сборки запроса (известные пробелы RU-данных).
 */
function languageFree(lang: Poe2Lang, name: string, drop: readonly string[] = []) {
  const { item, presets, active } = check(lang, name)
  for (const p of presets) p.stats = p.stats.filter((s) => !drop.includes(s.statRef))
  return json({
    active,
    presets: presets.map((p) => ({
      id: p.id,
      request: buildRequest(item, data[lang], p),
      stats: p.stats.map((s) => ({
        statRef: s.statRef,
        tradeId: s.tradeId,
        tag: s.tag,
        disabled: s.disabled,
        hidden: s.hidden,
        option: s.option,
        roll: s.roll && { value: s.roll.value, min: s.roll.min, max: s.roll.max, bounds: s.roll.bounds }
      }))
    }))
  })
}

const stat = (p: FilterPreset, ref: string): StatFilter => {
  const f = p.stats.find((s) => s.statRef === ref)
  if (!f) throw new Error(`нет фильтра «${ref}»: ${p.stats.map((s) => s.statRef).join(' | ')}`)
  return f
}

const EN = fixtureNames('en')
const PAIRS = EN.filter((name) => fixtureNames('ru').includes(name))

/**
 * Пробелы RU-данных EE2 (resources/data/poe2/ru/stats.ndjson), из-за которых RU-фильтр отсутствует или с другими
 * trade id: в RU нет статов «Leeches #% of Physical Damage as Life / Mana» (строка остаётся нераспознанной), у
 * «#% increased Experience gain» в RU нет explicit.stat_57434274. Такие фильтры сравниваем без них; когда данные
 * починят — тест «пробел ещё есть» упадёт и напомнит убрать исключение.
 */
const KNOWN_RU_DATA_GAPS: Record<string, readonly string[]> = {
  'ee2-bow-three-runes': ['Leeches #% of Physical Damage as Life'],
  'ee2-crossbow-all-types': ['Leeches #% of Physical Damage as Mana'],
  'sk-tablet-rare': ['#% increased Experience gain']
}

describe('запрос по каждой фикстуре', () => {
  it.each(EN)('%s: снапшот тела запроса активного пресета', (name) => {
    const { presets, active } = check('en', name)
    expect({ presets: presets.map((p) => p.id), active, request: request('en', name) }).toMatchSnapshot()
  })

  it('у каждой EN-фикстуры есть RU-близнец', () => {
    expect(PAIRS).toEqual(EN)
  })

  it.each(PAIRS)('%s: EN и RU дают одинаковые запросы и фильтры (только английские имена и trade id)', (name) => {
    const drop = KNOWN_RU_DATA_GAPS[name] ?? []
    const en = languageFree('en', name, drop)
    const ru = languageFree('ru', name, drop)
    expect(ru).toEqual(en)
    expect(JSON.stringify(ru.presets.map((p) => p.request))).not.toMatch(/[А-Яа-яЁё]/)
  })

  it.each(Object.entries(KNOWN_RU_DATA_GAPS))('%s: пробел RU-данных ещё есть (%j) — иначе убрать исключение', (name) => {
    expect(languageFree('ru', name)).not.toEqual(languageFree('en', name))
  })
})

describe('статус листингов', () => {
  it('по умолчанию available (мгновенный выкуп + продавцы в игре), со схлопыванием аккаунтов', () => {
    for (const lang of ['en', 'ru'] as const) {
      const body = trade(lang, 'ee2-ring-implicit')
      expect(body.query.status).toEqual({ option: 'available' })
      expect(body.query.filters.trade_filters?.filters.collapse).toEqual({ option: 'true' })
    }
  })

  it.each(LISTING_TYPES)('переключатель trade2: %s', (listingType) => {
    expect(trade('ru', 'ee2-ring-implicit', { listingType }).query.status).toEqual({ option: listingType })
  })

  it('обмен: мгновенного выкупа нет — available/securable → online, any → any', () => {
    const status = (listingType: PriceCheckOptions['listingType']) =>
      (request('ru', 'sk-currency-essence', { listingType }).body as BulkRequest).query.status.option
    expect(status(undefined)).toBe('online')
    expect(status('securable')).toBe('online')
    expect(status('online')).toBe('online')
    expect(status('any')).toBe('any')
  })

  it('валюта цены и «не схлопывать» (collapseListings: app)', () => {
    const body = trade('en', 'ee2-ring-implicit', { currency: 'exalted', collapseListings: 'app' })
    expect(body.query.filters.trade_filters?.filters).toEqual({ price: { option: 'exalted' } })
  })
})

describe('пресеты', () => {
  it.each([
    ['ee2-amulet-desecrated', ['filters.preset_pseudo', 'filters.preset_base_item']],
    ['ee2-focus-unique', ['filters.preset_pseudo']],
    ['ee2-helmet-normal', ['filters.preset_exact']],
    ['ee2-boots-unidentified', ['filters.preset_exact']],
    ['sk-flask-life-plain', ['filters.preset_exact']],
    ['sk-tablet-rare', ['filters.preset_exact']],
    ['ee2-waystone', ['filters.preset_pseudo', 'filters.preset_base_item']],
    ['sk-currency-essence', ['filters.preset_pseudo']]
  ] as const)('%s → %j', (name, ids) => {
    const { presets, active } = check('en', name)
    expect(presets.map((p) => p.id)).toEqual(ids)
    expect(active).toBe(ids[0])
  })

  it('тексты фильтров — на языке предмета, statRef — английский', () => {
    const ru = check('ru', 'ee2-ring-implicit').preset
    const en = check('en', 'ee2-ring-implicit').preset
    const ref = '#% total Elemental Resistance'
    expect(stat(en, ref).text).toMatch(/Elemental Resistance/)
    expect(stat(ru, ref).text).toMatch(/[А-Яа-яЁё]/)
  })

  it('данные другого языка — ошибка', () => {
    expect(() => createPriceCheck(parse('ru', 'ee2-ring-implicit'), data.en, { league: LEAGUE })).toThrow()
  })
})

describe('фильтры модов', () => {
  it('±10 % от ролла по умолчанию (в пределах диапазона), ±5 % — уже', () => {
    const dps = (range?: number) => stat(check('en', 'ee2-bow-rare', { searchStatRange: range }).preset, 'Total DPS: #')
    expect(dps().roll).toMatchObject({ value: 173, min: 155 })
    expect(dps(5).roll!.min).toBe(164)
    expect(trade('en', 'ee2-bow-rare').query.filters.equipment_filters?.filters.dps).toEqual({ min: 155 })

    const evasion = stat(check('ru', 'ee2-ring-implicit').preset, '# to Evasion Rating')
    expect(evasion.roll).toMatchObject({ value: 143, min: 128 })
    // шире диапазона тира не ищем: 143 ± 30 % → нижняя граница тира 124
    const wide = stat(check('ru', 'ee2-ring-implicit', { searchStatRange: 30 }).preset, '# to Evasion Rating')
    expect(wide.roll!.min).toBe(124)
  })

  it('псевдо-статы: сумма сопротивлений и здоровья включены, отдельные моды — выключены', () => {
    const belt = check('en', 'ee2-belt-charm-slots').preset
    expect(stat(belt, '#% total Elemental Resistance')).toMatchObject({ disabled: false, tradeId: ['pseudo.pseudo_total_elemental_resistance'] })
    expect(stat(belt, '+# total maximum Life')).toMatchObject({ disabled: false, roll: { value: 227 } })
    expect(stat(belt, '# to Stun Threshold').disabled).toBe(true)
    const body = trade('en', 'ee2-belt-charm-slots')
    expect(body.query.stats[0].filters.filter((f) => !f.disabled).map((f) => f.id)).toEqual([
      'pseudo.pseudo_total_elemental_resistance',
      'pseudo.pseudo_total_life'
    ])
  })

  it('уменьшающие моды: ролл показан положительным, в запросе — max отрицательный', () => {
    const f = stat(check('en', 'ee2-body-armour-runes').preset, '#% increased Duration of Bleeding on You')
    expect(f.roll).toMatchObject({ value: 48, min: 46, isNegated: true, tradeInvert: true })
    const q = trade('en', 'ee2-body-armour-runes').query.stats[0].filters.find((x) => x.id === 'explicit.stat_1692879867')
    expect(q?.value).toEqual({ max: -46 })
  })

  it('стат с несколькими trade id → группа count ≥ 1', () => {
    const groups = trade('en', 'ee2-ring-implicit').query.stats.filter((g) => g.type === 'count' && g.value?.min === 1 && !g.value.max)
    expect(groups.map((g) => g.filters.map((f) => f.id))).toContainEqual(['explicit.stat_2144192055', 'explicit.stat_53045048'])
  })

  it('пустой аффикс → count по псевдо-стату пустых модов', () => {
    const base = trade('en', 'ee2-ring-implicit', {}, 'filters.preset_base_item')
    expect(base.query.stats).toContainEqual({
      type: 'count',
      value: { min: 1, max: 1 },
      disabled: false,
      filters: [{ id: 'pseudo.pseudo_number_of_empty_prefix_mods', value: { min: 2 }, disabled: false }]
    })
  })

  it('зачарование (Allocates #) — trade id с вариантом через «|»', () => {
    const body = trade('en', 'sk-jewel-unique-enchant')
    expect(body.query.stats[0].filters).toEqual([
      { id: 'enchant.stat_2954116742|62310', value: {}, disabled: false },
      { id: 'enchant.stat_2954116742|40990', value: {}, disabled: false }
    ])
  })
})

describe('руны и гнёзда', () => {
  it('лишнее гнездо (3 из 2) → rune_sockets ≥ 3 включён; стат руны — фильтр rune.*', () => {
    expect(trade('en', 'ee2-body-armour-runes').query.filters.equipment_filters?.filters.rune_sockets).toEqual({ min: 3 })
    const three = check('en', 'ee2-bow-three-runes').preset
    expect(stat(three, 'Bow Attacks fire # additional Arrows')).toMatchObject({ tag: 'rune', tradeId: ['rune.stat_3885405204'] })
    expect(trade('en', 'ee2-bow-three-runes').query.filters.equipment_filters?.filters.rune_sockets).toEqual({ min: 3 })
  })

  it('обычное число гнёзд не ищется; пустые гнёзда — без фильтра', () => {
    const { preset } = check('en', 'ee2-crossbow-runes')
    expect(preset.filters.augmentSockets).toEqual({ value: 2, disabled: true })
    expect(trade('en', 'ee2-crossbow-runes').query.filters.equipment_filters?.filters.rune_sockets).toBeUndefined()
    expect(check('en', 'ee2-bow-rare').preset.filters.augmentSockets).toBeUndefined()
  })

  it('руна в свойствах: % брони от руны входит в «Armour: #», отдельного фильтра нет', () => {
    const { preset } = check('ru', 'ee2-body-armour-runes')
    expect(stat(preset, 'Armour: #')).toMatchObject({ tag: 'property', disabled: false })
    expect(preset.stats.some((s) => s.statRef === '#% increased Armour, Evasion and Energy Shield')).toBe(false)
  })

  it('уник с руной: стат руны выключен и скрыт, гнездо — в запросе (осквернён)', () => {
    const { preset } = check('en', 'sk-boots-unique-plain')
    expect(stat(preset, '#% to Fire Resistance')).toMatchObject({ tag: 'rune', disabled: true, hidden: 'filters.hide_const_roll' })
    expect(trade('en', 'sk-boots-unique-plain').query.filters.equipment_filters?.filters.rune_sockets).toEqual({ min: 1 })
  })
})

describe('тип предмета', () => {
  it('уник — по имени и базе (англ.), без категории и редкости', () => {
    for (const lang of ['en', 'ru'] as const) {
      const body = trade(lang, 'ee2-focus-unique')
      expect(body.query.name).toBe('The Eternal Spark')
      expect(body.query.type).toBe('Crystal Focus')
      expect(body.query.filters.type_filters).toBeUndefined()
    }
  })

  it('редкий — по категории (без базы), редкость nonunique', () => {
    const body = trade('ru', 'ee2-amulet-desecrated')
    expect(body.query.type).toBeUndefined()
    expect(body.query.filters.type_filters?.filters).toEqual({ category: { option: 'accessory.amulet' }, rarity: { option: 'nonunique' } })
  })

  it('валюта и стакаемое → обмен trade2 (want — trade tag, платим divine / exalted / chaos)', () => {
    for (const lang of ['en', 'ru'] as const) {
      expect(request(lang, 'sk-currency-essence')).toEqual({
        api: 'bulk',
        league: LEAGUE,
        body: {
          engine: 'new',
          query: { have: [...DEFAULT_BULK_HAVE], want: ['essence-of-enhancement'], status: { option: 'online' } },
          sort: { have: 'asc' }
        }
      })
      expect(request(lang, 'ee2-gem-uncut-skill')).toMatchObject({ api: 'bulk', body: { query: { want: ['uncut-skill-gem-19'] } } })
    }
  })

  it('обмен: за саму себя валюту не покупают (как EE2), стопка → minimum', () => {
    const info = data.en.itemByRef('ITEM', 'Divine Orb')![0]
    const divine = createVirtualItem({ info, category: ItemCategory.Currency, stackSize: { value: 12, max: 20 } })
    const pc = createPriceCheck(divine, data.en, { league: LEAGUE, activateStockFilter: true })
    const req = json(buildRequest(divine, data.en, pc.presets[0]))
    expect(req).toMatchObject({ api: 'bulk', body: { query: { have: ['exalted', 'chaos'], want: ['divine'], minimum: 12 } } })
    // явный список: сама валюта выкидывается
    expect((buildRequest(divine, data.en, pc.presets[0], ['divine', 'exalted']).body as BulkRequest).query.have).toEqual(['exalted'])
  })

  it('путевой камень: категория map и точный тир, свойства — выключены', () => {
    for (const lang of ['en', 'ru'] as const) {
      const body = trade(lang, 'ee2-waystone')
      expect(body.query.type).toBeUndefined()
      expect(body.query.filters.type_filters?.filters.category).toEqual({ option: 'map' })
      expect(body.query.filters.map_filters?.filters.map_tier).toEqual({ min: 14, max: 14 })
      expect(body.query.stats[0].filters.every((f) => f.disabled)).toBe(true)
    }
    // включённое свойство → map_filters
    const { item, preset } = check('en', 'ee2-waystone-all-props')
    stat(preset, 'Waystone Drop Chance: #%').disabled = false
    const body = json(buildRequest(item, data.en, preset)).body as TradeRequest
    expect(body.query.filters.map_filters?.filters).toEqual({ map_tier: { min: 16, max: 16 }, map_bonus: { min: 90 } })
  })

  it('камни: база по имени, уровень / качество / гнёзда', () => {
    const body = trade('ru', 'sk-gem-skill')
    expect(body.query.type).toBe('Herald of Ice')
    expect(body.query.filters.misc_filters?.filters).toMatchObject({ gem_sockets: { min: 4 }, corrupted: { option: 'false' } })
    expect(body.query.filters.misc_filters?.filters.gem_level).toBeUndefined() // 18 < 19
    expect(body.query.filters.type_filters?.filters.quality).toEqual({ min: 20 })
    const meta = check('ru', 'ee2-gem-meta').preset
    expect(meta.filters.searchExact.baseTypeTrade).toBe('Mirage Archer')
    expect(meta.filters.gemLevel).toEqual({ value: 14, disabled: true })
  })

  it('ilvl — в пресете «база»; качество амулета — нет; качество талисмана ≥ 10 — да', () => {
    const base = trade('en', 'ee2-amulet-desecrated', {}, 'filters.preset_base_item')
    expect(base.query.type).toBe('Gold Amulet')
    expect(base.query.filters.type_filters?.filters.ilvl).toEqual({ min: 81 })
    expect(trade('en', 'ee2-amulet-desecrated').query.filters.type_filters?.filters.ilvl).toBeUndefined()
    expect(trade('ru', 'ee2-charm-quality').query.filters.type_filters?.filters.quality).toEqual({ min: 14 })
  })

  it('осквернённость: целый предмет — corrupted=false; осквернённый — без фильтра', () => {
    expect(trade('en', 'ee2-ring-implicit').query.filters.misc_filters?.filters.corrupted).toEqual({ option: 'false' })
    const corrupted = trade('en', 'ee2-bow-three-runes').query.filters.misc_filters?.filters
    expect(corrupted?.corrupted).toBeUndefined()
    expect(corrupted?.sanctified).toBeUndefined()
  })
})

describe('фолбэк по data/stats сайта', () => {
  it('фильтр «с сайта»: выключен, ролл −10 %, trade id как есть', () => {
    const item = parse('en', 'ee2-waystone')
    const f = fallbackToFilter(
      { text: '+26% to Monster Critical Damage Bonus', tradeId: 'explicit.stat_2506820610', type: 'explicit', label: '#% to Monster Critical Damage Bonus', value: 26 },
      item,
      10
    )
    expect(f).toMatchObject({
      tradeId: ['explicit.stat_2506820610'],
      text: '#% to Monster Critical Damage Bonus',
      tag: 'explicit',
      fromSite: true,
      disabled: true,
      roll: { value: 26, min: 23 }
    })
  })
})

it('все ref, на которые ссылается код прайс-чека (stat()), есть в данных en и ru', () => {
  const refs = registeredStatRefs()
  expect(refs.length).toBeGreaterThan(40)
  for (const lang of ['en', 'ru'] as const) {
    for (const ref of refs) expect(data[lang].statByRef(ref), `${lang}: ${ref}`).toBeDefined()
  }
})
