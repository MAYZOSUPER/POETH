import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import {
  SUMS,
  compareLot,
  dataValueReader,
  modValue,
  otherBase,
  playerStatsOf,
  statKey,
  type LotComparison,
  type PlayerStat
} from '@shared/poe1/pricecheck/compare'
import { modTextString } from '@shared/poe1/pricecheck/filters/mod-text'
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
  ] as const)('%s: кольцо — 2 из 4: суммы сопротивлений и здоровья, хуже молния, нет меткости, сила — лишняя', (lang, raw) => {
    const mine = playerStatsOf(parse(lang, 'adv-ring'))
    const lot = normalizeListing(raw)
    // моды сайта на его языке, предмет — на языке клиента: сопоставляем по id
    for (const c of [compareLot(mine, lot.mods!), compareLot(mine, lot.mods!, dataValueReader(data[lang]))]) {
      // S23: сопротивления и здоровье — суммами, как псевдо-статы окна: 4 свойства, а не 6
      expect(c.total).toBe(4)
      expect(c.matched).toBe(2)
      expect(c.rows.map((r) => [r.status, r.sum ?? r.mine?.sum])).toEqual([
        ['match', 'eleRes'],
        ['match', 'life'],
        ['match', 'life'],
        ['match', 'life'],
        ['worse', undefined],
        ['extra', undefined],
        ['match', 'eleRes'],
        ['match', 'eleRes'],
        ['missing', undefined]
      ])
      // огонь fractured + крафт холода у лота (40 + 30) против огня и крафта холода у игрока (33 + 25)
      expect(c.rows[0]).toMatchObject({ theirs: 70, mine: { value: 58 } })
      // имплицит + explicit здоровья: 25 + 70 против 24 + 64
      expect(c.rows[1]).toMatchObject({ theirs: 95, mine: { value: 88 } })
      expect(c.rows[4]).toMatchObject({ theirs: 15, mine: { value: 21 } })
      expect(c.rows[8].mine?.value).toBe(120)
    }
  })

  it('язык сайта не тот, что у клиента: RU-предмет и EN-ответ сайта — тот же итог', () => {
    const c = compareLot(playerStatsOf(parse('ru', 'adv-ring')), normalizeListing(RING_EN).mods!, dataValueReader(data.en))
    expect([c.matched, c.total]).toEqual([2, 4])
    expect(summary(c)[8]).toEqual(['missing', '# к меткости', undefined])
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

// S23: пример из живой проверки rc.8 — кольцо пользователя (Unset Ring) и лот Two-Stone Ring при «Любой базе»
// получил «свойств: 1 из 7»: гибрид огня и молнии не засчитывался в сопротивления, гнездо базы — «пропавший мод».
const TWO_STONE = (lang: Poe1Lang) =>
  siteLot(
    'two-stone',
    [[lang === 'en' ? '+12% to Fire and Lightning Resistances' : '+12% к сопротивлению огню и молнии', 'implicit.stat_3441501978']],
    [
      [lang === 'en' ? '+39 to Intelligence' : '+39 к интеллекту', 'explicit.stat_328541901'],
      [lang === 'en' ? '14% increased Cast Speed' : '14% повышение скорости сотворения чар', 'explicit.stat_2891184298'],
      [lang === 'en' ? '+20 to maximum Energy Shield' : '+20 к максимуму энергетического щита', 'explicit.stat_3489782002'],
      [lang === 'en' ? '+42% to Cold Resistance' : '+42% к сопротивлению холоду', 'explicit.stat_4220027924']
    ],
    { name: 'Rage Grasp', typeLine: 'Two-Stone Ring', baseType: lang === 'en' ? 'Two-Stone Ring' : 'Кольцо с двумя камнями', ilvl: 81 }
  )

describe('S23: суммы как псевдо-статы и другая база', () => {
  it.each(['en', 'ru'] as const)('%s: кольцо пользователя против Two-Stone Ring — 1 из 5 и строка «другая база»', (lang) => {
    const item = parse(lang, 'rare-ring')
    const mine = playerStatsOf(item)
    // суммы первыми: сопротивления (36 + 35) и мана; затем гнездо, молния, уклонение, скорость чар
    expect(mine.map((p) => p.sum ?? p.keys[0])).toEqual([
      'eleRes',
      'mana',
      'implicit:stat_4077843608',
      'explicit:stat_1754445556',
      'explicit:stat_2144192055',
      'explicit:stat_2891184298'
    ])
    expect(mine[0]).toMatchObject({ value: 71 })
    const lot = normalizeListing(TWO_STONE(lang))
    expect(otherBase(item, lot.baseType)).toBe(lot.baseType)
    for (const read of [undefined, dataValueReader(data[lang])]) {
      const c = compareLot(mine, lot.mods!, read)
      // гибрид ×2: 12·2 + 42 = 66 < 71 — хуже; скорость чар 14 ≥ 11
      expect(c.rows[0]).toMatchObject({ status: 'worse', theirs: 66, mine: { sum: 'eleRes', value: 71 } })
      expect(c.rows.find((r) => r.lot?.stat === 'implicit.stat_3441501978')).toMatchObject({ status: 'worse', sum: 'eleRes' })
      expect(c.rows.find((r) => r.lot?.stat === 'explicit.stat_2891184298')).toMatchObject({ status: 'match', theirs: 14 })
      // другая база (ни одного имплицита игрока у лота): гнездо Unset Ring — свойство базы, а не пропавший мод
      expect([c.matched, c.total]).toEqual([1, 5])
      expect(c.rows.filter((r) => r.status === 'missing').map((r) => r.mine?.sum ?? r.mine?.keys[0])).toEqual([
        'mana',
        'explicit:stat_1754445556',
        'explicit:stat_2144192055'
      ])
    }
  })

  it('та же база — без строки «другая база» (сайт пишет базу на своём языке)', () => {
    expect(otherBase(parse('en', 'rare-ring'), 'Unset Ring')).toBeUndefined()
    expect(otherBase(parse('ru', 'rare-ring'), 'Кольцо без камня')).toBeUndefined()
    expect(otherBase(parse('ru', 'rare-ring'), 'Unset Ring')).toBeUndefined()
    expect(otherBase(parse('en', 'rare-ring'), undefined)).toBeUndefined()
    // та же база — гнездо у лота есть и сравнивается как обычно
    const mine = playerStatsOf(parse('en', 'rare-ring'))
    const same = compareLot(mine, [{ kind: 'implicit', text: 'Has 1 Socket', stat: 'implicit.stat_4077843608' }])
    expect([same.matched, same.total]).toEqual([1, 6])
    expect(same.rows[0]).toMatchObject({ status: 'match', mine: { keys: ['implicit:stat_4077843608'] } })
  })

  it('свойства игрока — как в игре: числа «от # до #» и «+»', () => {
    for (const [lang, adds, evasion] of [
      ['en', 'Adds 3 to 34 Lightning Damage to Attacks', '+40 to Evasion Rating'],
      ['ru', 'Добавляет от 3 до 34 урона от молнии к атакам', '+40 к уклонению']
    ] as const) {
      const shown = playerStatsOf(parse(lang, 'rare-ring')).flatMap((p) => (p.shown ? [modTextString(p.shown, String)] : []))
      expect(shown).toEqual(expect.arrayContaining([adds, evasion]))
    }
  })

  it('id сумм совпадают с данными: гибрид двух стихий ×2, «ко всем» ×3', () => {
    const expected: Record<string, Record<string, number>> = {
      eleRes: {
        '+#% to Fire Resistance': 1,
        '+#% to Cold Resistance': 1,
        '+#% to Lightning Resistance': 1,
        '+#% to all Elemental Resistances': 3,
        '+#% to All Resistances': 3,
        '+#% to Fire and Lightning Resistances': 2,
        '+#% to Fire and Cold Resistances': 2,
        '+#% to Cold and Lightning Resistances': 2,
        '+#% to Fire and Chaos Resistances': 1,
        '+#% to Cold and Chaos Resistances': 1,
        '+#% to Lightning and Chaos Resistances': 1
      },
      chaosRes: {
        '+#% to Chaos Resistance': 1,
        '+#% to All Resistances': 1,
        '+#% to Fire and Chaos Resistances': 1,
        '+#% to Cold and Chaos Resistances': 1,
        '+#% to Lightning and Chaos Resistances': 1
      },
      life: { '+# to maximum Life': 1 },
      mana: { '+# to maximum Mana': 1 },
      es: { '+# to maximum Energy Shield': 1 }
    }
    for (const [sum, refs] of Object.entries(expected)) {
      const got: Record<string, number> = {}
      for (const [id, mult] of Object.entries(SUMS[sum as keyof typeof SUMS].parts)) {
        const stat = [...data.en.statsIterator(`"explicit.${id}"`)].find((s) => s.trade.ids.explicit?.includes(`explicit.${id}`))
        expect(stat, `${sum}: ${id}`).toBeDefined()
        got[stat!.ref] = mult
      }
      expect(got, sum).toEqual(refs)
      expect(data.en.pseudoStatByRef(SUMS[sum as keyof typeof SUMS].ref), sum).toBeDefined()
    }
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
