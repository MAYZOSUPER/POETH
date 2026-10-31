import { describe, expect, it } from 'vitest'
import {
  KIND_GROUPS,
  LOW_LISTINGS,
  Poe2PriceTable,
  isHardcoreLeague,
  isPricesStale,
  loadPoe2Prices,
  parsePoe2PriceIndex,
  parsePoe2PriceSnapshot,
  pickLeague,
  priceKey,
  privateBaseOf,
  softcoreOf,
  type Poe2PriceIndex
} from '@shared/poe2/prices'
import { buildSnapshot, reduceCore, reduceExchange, reduceItems } from '../../../tools/data/ninja-snapshot-poe2.mjs'
import { CURRENCY, DELIRIUM, RUNES, UNIQUE_ACCESSORIES, UNIQUE_WEAPONS } from './fixtures'

const AT = Date.UTC(2026, 9, 31, 20, 0)

function snapshot(league = 'Runes of Aldur') {
  const lines = [
    ...reduceExchange('Currency', CURRENCY),
    ...reduceExchange('Delirium', DELIRIUM),
    ...reduceExchange('Runes', RUNES),
    ...reduceItems('UniqueAccessories', UNIQUE_ACCESSORIES),
    ...reduceItems('UniqueWeapons', UNIQUE_WEAPONS)
  ]
  return JSON.parse(JSON.stringify(buildSnapshot({ league, at: AT, core: reduceCore(CURRENCY)!, lines })))
}
const table = () => new Poe2PriceTable(parsePoe2PriceSnapshot(snapshot())!)

describe('цены PoE 2: формат снимка (недоверенные данные)', () => {
  it('битые строки и курсы отбрасываются, остальное читается', () => {
    const raw = snapshot()
    raw.lines.push(
      { id: 'x', name: 'X', kind: 'Unknown', value: 1 },
      { id: 'y', name: 'Y', kind: 'Runes', value: -1 },
      { id: 'z', kind: 'Runes', value: 1 },
      'мусор',
      { id: 'w', name: 'W', kind: 'Runes', value: 1e9 }
    )
    raw.rates = { exalted: 560, chaos: 9.5, 'BAD KEY': 3, divine2: -1, huge: 1e9 }
    const s = parsePoe2PriceSnapshot(raw)!
    expect(s.lines).toHaveLength(snapshot().lines.length)
    expect(s.rates).toEqual({ exalted: 560, chaos: 9.5 })
  })

  it('не тот формат — null', () => {
    for (const bad of [null, [], 'x', { ...snapshot(), v: 2 }, { ...snapshot(), primary: 'Divine Orb!' }, { ...snapshot(), lines: {} }, { ...snapshot(), at: 0 }]) {
      expect(parsePoe2PriceSnapshot(bad)).toBeNull()
    }
  })

  it('index.json: файл лиги — только простое имя', () => {
    const idx = parsePoe2PriceIndex({
      v: 1,
      at: AT,
      leagues: [
        { league: 'Runes of Aldur', file: 'Runes_20of_20Aldur.json', at: AT, lines: 10 },
        { league: 'Evil', file: '../../settings.json', at: AT },
        { league: 'Evil2', file: 'sub/x.json', at: AT },
        { league: 'NoAt', file: 'NoAt.json' }
      ]
    })
    expect(idx?.leagues.map((l) => l.league)).toEqual(['Runes of Aldur'])
    expect(parsePoe2PriceIndex({ v: 1 })).toBeNull()
  })
})

describe('цены PoE 2: выбор лиги', () => {
  const idx: Poe2PriceIndex = {
    v: 1,
    source: 'poe.ninja',
    at: AT,
    leagues: ['Forbidden Rites', 'Runes of Aldur', 'Standard'].map((league) => ({ league, file: `${league.replace(/ /g, '_')}.json`, at: AT, lines: 1 }))
  }

  it('своя лига, хардкор → софткор-пара, остальное → текущая временная', () => {
    expect(pickLeague(idx, 'Runes of Aldur')).toMatchObject({ entry: { league: 'Runes of Aldur' }, match: 'exact' })
    expect(pickLeague(idx, 'runes of aldur ')).toMatchObject({ match: 'exact' })
    expect(pickLeague(idx, 'HC Runes of Aldur')).toMatchObject({ entry: { league: 'Runes of Aldur' }, match: 'softcore' })
    expect(pickLeague(idx, 'Hardcore')).toMatchObject({ entry: { league: 'Standard' }, match: 'softcore' })
    for (const l of ['auto', '', null, undefined, 'My Private League (PL12345)']) {
      expect(pickLeague(idx, l), String(l)).toMatchObject({ entry: { league: 'Forbidden Rites' }, match: 'current' })
    }
    expect(pickLeague({ ...idx, leagues: [] }, 'Standard')).toBeNull()
  })

  it('частная лига «… (PL123)»: цены лиги без суффикса; хардкор — её софткор-пары', () => {
    expect(pickLeague(idx, 'Runes of Aldur (PL12345)')).toMatchObject({ entry: { league: 'Runes of Aldur' }, match: 'private' })
    expect(pickLeague(idx, 'runes of aldur(pl7)')).toMatchObject({ entry: { league: 'Runes of Aldur' }, match: 'private' })
    expect(pickLeague(idx, 'HC Runes of Aldur (PL9)')).toMatchObject({ entry: { league: 'Runes of Aldur' }, match: 'softcore' })
    expect(pickLeague(idx, 'Наша лига (PL1)')).toMatchObject({ entry: { league: 'Forbidden Rites' }, match: 'current' })
    expect(privateBaseOf('Runes of Aldur (PL12345)')).toBe('Runes of Aldur')
    expect(privateBaseOf('Runes of Aldur')).toBeNull()
    expect(privateBaseOf('PL (PLX)')).toBeNull()
  })

  it('хардкор и его пара', () => {
    expect(isHardcoreLeague('HC Forbidden Rites')).toBe(true)
    expect(isHardcoreLeague('Hardcore')).toBe(true)
    expect(isHardcoreLeague('Runes of Aldur')).toBe(false)
    expect(softcoreOf('HC Forbidden Rites')).toBe('Forbidden Rites')
    expect(softcoreOf('SSF HC Runes of Aldur')).toBe('Runes of Aldur')
    expect(softcoreOf('Standard')).toBeNull()
  })
})

describe('цены PoE 2: поиск по снимку', () => {
  it('ключ имени: «Liquid Paranoia» = «liquid-paranoia» = «LiquidParanoia»', () => {
    expect(priceKey('Liquid Paranoia')).toBe('liquidparanoia')
    expect(priceKey('liquid-paranoia')).toBe('liquidparanoia')
    expect(priceKey('LiquidParanoia')).toBe('liquidparanoia')
    expect(priceKey("Aldur's Legacy")).toBe('aldurslegacy')
    expect(priceKey('Mjölner')).toBe('mjölner')
  })

  it('эмоции для «Вложения»: по имени, id обмена и id рецепта GGG; цена в divine, exalted, chaos', () => {
    const t = table()
    const p = t.byName('LiquidParanoia', { kinds: KIND_GROUPS.emotions })!
    expect(p).toMatchObject({ id: 'liquid-paranoia', name: 'Liquid Paranoia', kind: 'Delirium', divine: 0.004996 })
    expect(p.exalted).toBeCloseTo(0.004996 * 560, 6)
    expect(p.chaos).toBeCloseTo(0.004996 * 9.5, 6)
    expect(t.byName('liquid-paranoia')?.id).toBe('liquid-paranoia')
    expect(t.byName('Diluted Liquid Greed')?.value).toBe(0.001147)
    expect(t.byName('Liquid Paranoia', { kinds: KIND_GROUPS.runes })).toBeNull()
    expect(t.byName('Liquid Despair')).toBeNull()
  })

  it('руны, валюта, курс exalted за divine', () => {
    const t = table()
    expect(t.byName("Aldur's Legacy", { kinds: KIND_GROUPS.runes })?.divine).toBe(207.9)
    expect(t.byId('divine')?.exalted).toBe(560)
    expect(t.byId('chaos')?.divine).toBe(0.1053)
    expect(t.exaltedPerDivine).toBe(560)
    expect(t.convert(2, 'chaos')).toBe(19)
    expect(t.convert(2, 'annul')).toBeNull()
  })

  it('уник с несколькими базами: без базы — с наибольшим числом лотов, с базой — именно она', () => {
    const t = table()
    expect(t.byName('Quill Rain')?.base).toBe('Shortbow')
    expect(t.byName('Quill Rain', { base: 'Runeforged Shortbow' })?.divine).toBe(3.2)
    expect(t.byName('Quill Rain', { base: 'Composite Bow' })).toBeNull()
    expect(t.byName('mjolner')).toBeNull()
    expect(t.byName('Mjölner')?.variant).toBe('2 sockets')
  })

  it('порча: без запроса — непорченый, по запросу — порченый', () => {
    const t = table()
    expect(t.byName('Headhunter')?.corrupted).toBeUndefined()
    expect(t.byName('Headhunter', { corrupted: true })?.divine).toBe(40)
  })

  it('«мало данных»: уник с малым числом лотов, валюта с малым оборотом', () => {
    const t = table()
    expect(t.byName('The Gnashing Sash')?.low).toBe(true)
    expect(t.byName('The Gnashing Sash')!.listings!).toBeLessThan(LOW_LISTINGS)
    expect(t.byName('Mageblood')?.low).toBe(false)
    expect(t.byName('Ancient Concentrated Liquid Suffering')?.low).toBe(true)
    expect(t.byName('Liquid Paranoia')?.low).toBe(false)
    expect(t.byId('mirror')?.low).toBe(false)
  })

  it('списки по группам', () => {
    const t = table()
    expect(t.all(KIND_GROUPS.emotions).map((p) => p.id)).toHaveLength(4)
    expect(t.all(KIND_GROUPS.uniques).every((p) => p.listings !== undefined)).toBe(true)
    expect(t.size).toBe(t.all().length)
  })
})

describe('цены PoE 2: загрузка из данных (loadPoe2Prices)', () => {
  const files = (over: Record<string, string | null> = {}): Record<string, string | null> => ({
    'prices/index.json': JSON.stringify({
      v: 1,
      source: 'poe.ninja',
      at: AT,
      leagues: [
        { league: 'Forbidden Rites', file: 'Forbidden_20Rites.json', at: AT, lines: 3 },
        { league: 'Runes of Aldur', file: 'Runes_20of_20Aldur.json', at: AT, lines: 3 }
      ]
    }),
    'prices/Forbidden_20Rites.json': JSON.stringify(snapshot('Forbidden Rites')),
    'prices/Runes_20of_20Aldur.json': JSON.stringify(snapshot('Runes of Aldur')),
    ...over
  })
  const reader = (f: Record<string, string | null>) => {
    const asked: string[] = []
    const read = async (rel: string) => (asked.push(rel), f[rel] ?? null)
    return { read, asked }
  }

  it('лига игрока; HC — софткор; auto — текущая', async () => {
    const r = reader(files())
    const p = await loadPoe2Prices(r.read, 'HC Runes of Aldur')
    expect(p).toMatchObject({ league: 'Runes of Aldur', requested: 'HC Runes of Aldur', match: 'softcore', at: AT })
    expect(p?.table.byName('Mageblood')?.divine).toBe(200)
    expect(r.asked).toEqual(['prices/index.json', 'prices/Runes_20of_20Aldur.json'])
    expect((await loadPoe2Prices(r.read, 'auto'))?.league).toBe('Forbidden Rites')
  })

  it('нет снимка, битый index или файл лиги — null без исключений', async () => {
    expect(await loadPoe2Prices(reader({}).read, 'Standard')).toBeNull()
    expect(await loadPoe2Prices(reader(files({ 'prices/index.json': '{не json' })).read, 'Standard')).toBeNull()
    expect(await loadPoe2Prices(reader(files({ 'prices/Forbidden_20Rites.json': null })).read, 'auto')).toBeNull()
    const throwing = async () => {
      throw new Error('EACCES')
    }
    expect(await loadPoe2Prices(throwing, 'auto')).toBeNull()
  })

  it('устаревание: старше недели', () => {
    expect(isPricesStale(AT, AT + 6 * 864e5)).toBe(false)
    expect(isPricesStale(AT, AT + 8 * 864e5)).toBe(true)
  })
})
