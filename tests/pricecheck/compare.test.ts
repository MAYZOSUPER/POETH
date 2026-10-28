import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import {
  compareLot,
  dataValueReader,
  modValue,
  playerStatsOf,
  statKey,
  type LotComparison,
  type PlayerStat
} from '@shared/poe1/pricecheck/compare'
import { normalizeListing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { readFixture, store } from '../poe1/helpers'

// S21: «что продаёт продавец и похоже ли на ваш» — по stat id, без новых запросов. Ответы fetch синтетические,
// по форме ответа сайта от 29.10.2026 (моды — объекты с hash и domain) и по классической (строки + extended.hashes).

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function parse(lang: Poe1Lang, name: string): ParsedItem {
  const res = parseItem(readFixture(lang, name), data)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  return res.value
}

type Mod = [text: string, hash: string, domain?: string]
const mod = ([description, hash, domain]: Mod) => ({ description, hash: `stat.${hash}`, domain: domain ?? hash.split('.')[0] })

/** Лот в форме ответа сайта: implicitMods/explicitMods — объекты, crafted и fractured — внутри explicitMods. */
function siteLot(id: string, implicit: Mod[], explicit: Mod[], over: Partial<NonNullable<TradeFetchItem['item']>> = {}): TradeFetchItem {
  return {
    id,
    listing: { price: { amount: 1, currency: 'divine' }, fee: 2000, account: { name: 'tehchopi#1140', online: null } },
    item: {
      frameType: 2,
      identified: true,
      name: 'Dragon Knot',
      typeLine: 'Coral Ring',
      baseType: 'Coral Ring',
      ilvl: 84,
      implicitMods: implicit.map(mod),
      explicitMods: explicit.map(mod),
      ...over
    }
  }
}

// adv-ring: +24 здоровья (имплицит), +64 здоровья, 21% к урону от молнии, +33% к огню, +120 меткости, +25% к холоду (крафт)
const RING_EN = siteLot(
  'r-en',
  [['+25 to maximum Life', 'implicit.stat_3299347043']],
  [
    ['+70 to maximum Life', 'explicit.stat_3299347043'],
    ['15% increased Lightning Damage', 'explicit.stat_2231156303'],
    ['+20 to Strength', 'explicit.stat_4080418644'],
    ['+40% to Fire Resistance', 'fractured.stat_3372524247'],
    ['+30% to Cold Resistance', 'crafted.stat_4220027924']
  ]
)
const RING_RU = siteLot(
  'r-ru',
  [['+25 к максимуму здоровья', 'implicit.stat_3299347043']],
  [
    ['+70 к максимуму здоровья', 'explicit.stat_3299347043'],
    ['15% увеличение урона от молнии', 'explicit.stat_2231156303'],
    ['+20 к силе', 'explicit.stat_4080418644'],
    ['+40% к сопротивлению огню', 'fractured.stat_3372524247'],
    ['+30% к сопротивлению холоду', 'crafted.stat_4220027924']
  ],
  { name: 'Драконьи узы', typeLine: 'Кольцо с кораллом', baseType: 'Кольцо с кораллом' }
)

function summary(c: LotComparison) {
  return c.rows.map((r) => [r.status, r.lot?.text ?? r.mine?.text, r.theirs])
}

describe('моды лота из ответа fetch', () => {
  it('новая форма: hash и domain у мода; crafted и fractured — по domain', () => {
    const l = normalizeListing(RING_EN)
    expect(l.rarity).toBe('rare')
    expect(l.mods).toEqual([
      { kind: 'implicit', text: '+25 to maximum Life', stat: 'implicit.stat_3299347043' },
      { kind: 'explicit', text: '+70 to maximum Life', stat: 'explicit.stat_3299347043' },
      { kind: 'explicit', text: '15% increased Lightning Damage', stat: 'explicit.stat_2231156303' },
      { kind: 'explicit', text: '+20 to Strength', stat: 'explicit.stat_4080418644' },
      { kind: 'fractured', text: '+40% to Fire Resistance', stat: 'fractured.stat_3372524247' },
      { kind: 'crafted', text: '+30% to Cold Resistance', stat: 'crafted.stat_4220027924' }
    ])
  })

  it('классическая форма: строки + extended.hashes по порядку; зачарование сверху; разметка сайта снята', () => {
    const l = normalizeListing({
      id: 'c',
      item: {
        frameType: 3,
        enchantMods: ['Adds 1 to 2 [Fire|Fire] Damage'],
        implicitMods: ['+30 to maximum Life'],
        explicitMods: ['<<set:MS>>+10 to Strength', 'Cannot be Frozen'],
        craftedMods: ['+20% to Cold Resistance'],
        extended: {
          hashes: {
            enchant: [['enchant.stat_1', [0]]],
            implicit: [['implicit.stat_3299347043', [0]]],
            explicit: [['explicit.stat_4080418644', [0]]],
            crafted: [['crafted.stat_4220027924', [0]]]
          }
        }
      }
    })
    expect(l.rarity).toBe('unique')
    expect(l.mods).toEqual([
      { kind: 'enchant', text: 'Adds 1 to 2 Fire Damage', stat: 'enchant.stat_1' },
      { kind: 'implicit', text: '+30 to maximum Life', stat: 'implicit.stat_3299347043' },
      { kind: 'explicit', text: '+10 to Strength', stat: 'explicit.stat_4080418644' },
      // у второго explicit нет пары в hashes — мод без stat id (только показать)
      { kind: 'explicit', text: 'Cannot be Frozen' },
      { kind: 'crafted', text: '+20% to Cold Resistance', stat: 'crafted.stat_4220027924' }
    ])
  })

  it('гнёзда как в игре, «не опознан», редкость по frameType', () => {
    const l = normalizeListing({
      id: 's',
      item: {
        frameType: 9,
        identified: false,
        sockets: [
          { group: 0, sColour: 'R' },
          { group: 0, sColour: 'G' },
          { group: 0, attr: 'I' },
          { group: 1, sColour: 'W' },
          null
        ]
      }
    })
    expect(l).toMatchObject({ rarity: 'relic', sockets: 'R-G-B W', unidentified: true, links: 3, mods: [] })
    expect(normalizeListing({ id: 'x', listing: {} }).mods).toBeUndefined()
  })
})

describe('сравнение с предметом игрока по stat id', () => {
  it.each([
    ['en', RING_EN],
    ['ru', RING_RU]
  ] as const)('%s: кольцо — 4 из 6, хуже молния, нет меткости, сила — лишняя', (lang, raw) => {
    const mine = playerStatsOf(parse(lang, 'adv-ring'))
    const lot = normalizeListing(raw)
    // моды сайта на его языке, предмет — на языке клиента: сопоставляем по id
    for (const c of [compareLot(mine, lot.mods!), compareLot(mine, lot.mods!, dataValueReader(data[lang]))]) {
      expect(c.total).toBe(6)
      expect(c.matched).toBe(4)
      expect(c.rows.map((r) => r.status)).toEqual(['match', 'match', 'worse', 'extra', 'match', 'match', 'missing'])
      expect(c.rows[2]).toMatchObject({ theirs: 15, mine: { value: 21 } })
      // крафт холода у игрока и у лота — одно свойство, огонь fractured у лота ↔ explicit у игрока
      expect(c.rows[4]).toMatchObject({ theirs: 40, mine: { value: 33 } })
      expect(c.rows[6].mine?.value).toBe(120)
    }
  })

  it('язык сайта не тот, что у клиента: RU-предмет и EN-ответ сайта — тот же итог', () => {
    const c = compareLot(playerStatsOf(parse('ru', 'adv-ring')), normalizeListing(RING_EN).mods!, dataValueReader(data.en))
    expect([c.matched, c.total]).toEqual([4, 6])
    expect(summary(c)[6]).toEqual(['missing', '# к меткости', undefined])
  })

  it('булава: «от # до #» — среднее, локальные моды — свои id, fractured лота ↔ fractured игрока', () => {
    for (const lang of ['en', 'ru'] as const) {
      const mine = playerStatsOf(parse(lang, 'adv-weapon'))
      const lot = normalizeListing(
        siteLot(
          'w',
          [[lang === 'en' ? '15% reduced Enemy Stun Threshold' : '15% снижение порога оглушения врагов', 'implicit.stat_1443060084']],
          [
            [lang === 'en' ? 'Adds 4 to 10 Physical Damage' : 'Добавляет от 4 до 10 физического урона', 'fractured.stat_1940865751'],
            [lang === 'en' ? '120% increased Physical Damage' : '120% увеличение физического урона', 'explicit.stat_1509134228'],
            [lang === 'en' ? '+35 to Strength' : '+35 к силе', 'explicit.stat_4080418644']
          ]
        )
      )
      for (const read of [undefined, dataValueReader(data[lang])]) {
        const c = compareLot(mine, lot.mods!, read)
        expect(summary(c).map((r) => [r[0], r[2]])).toEqual([
          ['match', 15],
          // (4+10)/2 = 7 < (5+11)/2 = 8
          ['worse', 7],
          ['match', 120],
          ['match', 35],
          ['missing', undefined]
        ])
        expect([c.matched, c.total]).toEqual([3, 5])
      }
    }
  })

  it('«reduced»: меньше уменьшения — лучше; значение со знаком, как у парсера', () => {
    for (const lang of ['en', 'ru'] as const) {
      const mine = playerStatsOf(parse(lang, 'flask-01'))
      const amount = mine.find((p) => p.keys[0] === 'explicit:stat_700317374')!
      expect(amount).toMatchObject({ value: -30, negated: true })
      const text = (n: number) => (lang === 'en' ? `${n}% reduced Amount Recovered` : `${n}% уменьшение объёма восстановления`)
      for (const read of [undefined, dataValueReader(data[lang])]) {
        const better = compareLot([amount], [{ kind: 'explicit', text: text(20), stat: 'explicit.stat_700317374' }], read)
        const worse = compareLot([amount], [{ kind: 'explicit', text: text(40), stat: 'explicit.stat_700317374' }], read)
        expect(better.rows[0]).toMatchObject({ status: 'match', theirs: -20 })
        expect(worse.rows[0]).toMatchObject({ status: 'worse', theirs: -40 })
      }
      // у лота другой перевод того же стата («increased»): по числам знак не угадать, по данным языка — да
      const inc = lang === 'en' ? '10% increased Amount Recovered' : '10% увеличение объёма восстановления'
      const c = compareLot([amount], [{ kind: 'explicit', text: inc, stat: 'explicit.stat_700317374' }], dataValueReader(data[lang]))
      expect(c.rows[0]).toMatchObject({ status: 'match', theirs: 10 })
    }
  })

  it('свойство без значения — засчитывается наличие; моды без stat id — нейтральные', () => {
    const mine: PlayerStat[] = [{ keys: ['explicit:stat_9'], text: 'Cannot be Frozen', better: 1, negated: false }]
    const c = compareLot(mine, [
      { kind: 'explicit', text: 'Cannot be Frozen', stat: 'explicit.stat_9' },
      { kind: 'explicit', text: 'Something new' }
    ])
    expect(c.rows.map((r) => r.status)).toEqual(['match', 'extra'])
    expect([c.matched, c.total]).toEqual([1, 1])
  })

  it('несравнимый стат: другое значение — «хуже» с пометкой differs; два мода одного стата — сумма', () => {
    const fixed: PlayerStat = { keys: ['explicit:stat_1'], text: 'Socketed Gems are Supported by Level # X', value: 20, better: 0, negated: false }
    expect(compareLot([fixed], [{ kind: 'explicit', text: 'Socketed Gems are Supported by Level 18 X', stat: 'explicit.stat_1' }]).rows[0]).toMatchObject({
      status: 'worse',
      differs: true
    })
    const life: PlayerStat = { keys: ['explicit:stat_3299347043'], text: '# to maximum Life', value: 80, better: 1, negated: false }
    const c = compareLot([life], [
      { kind: 'explicit', text: '+60 to maximum Life', stat: 'explicit.stat_3299347043' },
      { kind: 'crafted', text: '+25 to maximum Life', stat: 'crafted.stat_3299347043' }
    ])
    expect(c.rows.map((r) => [r.status, r.theirs])).toEqual([
      ['match', 85],
      ['match', 85]
    ])
    expect(c.matched).toBe(1)
  })

  it('меньше — лучше (NegativeRoll): больше значение у лота — хуже', () => {
    const cost: PlayerStat = { keys: ['explicit:stat_2'], text: '#% increased Mana Cost', value: 10, better: -1, negated: false }
    const read = (n: number) => compareLot([cost], [{ kind: 'explicit', text: `${n}% increased Mana Cost`, stat: 'explicit.stat_2' }]).rows[0].status
    expect(read(5)).toBe('match')
    expect(read(15)).toBe('worse')
  })

  it('без модов у игрока (валюта, карта без свойств) — 0 из 0, все моды лота нейтральные', () => {
    const c = compareLot([], normalizeListing(RING_EN).mods!)
    expect([c.matched, c.total]).toEqual([0, 0])
    expect(c.rows.every((r) => r.status === 'extra')).toBe(true)
  })
})

describe('помощники', () => {
  it('statKey: домены explicit/crafted/fractured — одна группа; псевдо и свойства базы — нет', () => {
    expect(statKey('explicit.stat_1')).toBe('explicit:stat_1')
    expect(statKey('stat.crafted.stat_1')).toBe('explicit:stat_1')
    expect(statKey('{div_by_100}fractured.stat_1')).toBe('explicit:stat_1')
    expect(statKey('implicit.stat_1')).toBe('implicit:stat_1')
    expect(statKey('enchant.stat_1')).toBe('enchant:stat_1')
    expect(statKey('pseudo.pseudo_total_life')).toBeNull()
    expect(statKey('item.armour')).toBeNull()
    expect(statKey('bad')).toBeNull()
  })

  it('modValue: константы шаблона не значение, два числа — среднее, десятичные с точкой и запятой', () => {
    expect(modValue('1% increased Damage per 15 Strength', '#% increased Damage per 15 Strength')).toBe(1)
    expect(modValue('Добавляет от 5 до 11 физического урона', 'Добавляет от # до # физического урона')).toBe(8)
    expect(modValue('Регенерация 3.5 здоровья в секунду')).toBe(3.5)
    expect(modValue('Regenerate 3,5 Life per second')).toBe(3.5)
    expect(modValue('-5% to Fire Resistance')).toBe(-5)
    expect(modValue('30% reduced Duration', '#% reduced Duration', true)).toBe(-30)
    expect(modValue('Cannot be Frozen')).toBeUndefined()
  })
})
