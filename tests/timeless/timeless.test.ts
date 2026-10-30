import { readFileSync } from 'fs'
import { resolve } from 'path'
import { inflateSync } from 'zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { nodePosition, parseTreeData } from '@shared/build/data'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import { buildRequest, createPriceCheck, type FilterGroup, type TimelessSearch } from '@shared/poe1/pricecheck'
import {
  TIMELESS_KINDS,
  TIMELESS_UNKNOWN,
  inflateZlib,
  makeTable,
  outcomeAt,
  parseTimelessData,
  type TimelessDataKind,
  type TimelessDataRaw,
  type TimelessTable
} from '@shared/poe1/timeless/data'
import { dataKindOf, dataSeedOf, evaluateSeed, findAnalogs, itemSeedOf, seedScore } from '@shared/poe1/timeless/evaluate'
import { MAX_ANALOG_FILTERS, analogConquerors, analogPreset, maxAnalogSeeds } from '@shared/poe1/timeless/query'
import { readFixture, store } from '../poe1/helpers'

// «Умная оценка» timeless-самоцветов (S45): данные tools/timeless/build.mjs (лукапы PoB, MIT), исход сида по гнёздам,
// правила лучшего гнезда, сиды-аналоги и count-запрос на трейд. Эталон — калькулятор Vilsol (только числа исхода,
// открытый сайт; код не используется).

const DATA = resolve(__dirname, '../../resources/data/poe1/build')
const data = parseTimelessData(JSON.parse(readFileSync(resolve(DATA, 'timeless.json'), 'utf8'))) as TimelessDataRaw
const tables = new Map<TimelessDataKind, TimelessTable>()
function table(kind: TimelessDataKind): TimelessTable {
  let t = tables.get(kind)
  if (!t) {
    const j = data.jewels[kind]
    t = makeTable(kind, j, data.rows.length, new Uint8Array(inflateSync(readFileSync(resolve(DATA, j.file)))))!
    tables.set(kind, t)
  }
  return t
}
const socketOf = (id: number) => data.sockets.find((s) => s.id === id)!

/** Исход нотаблов гнезда: «строка описания [имя замены]» → сколько раз. */
function outcomeCounts(kind: TimelessDataKind, seed: number, socket: number): Record<string, number> {
  const j = data.jewels[kind]
  const out: Record<string, number> = {}
  for (const row of socketOf(socket).notables) {
    const code = outcomeAt(table(kind), row, seed)
    const o = j.outcomes[code]
    const key = code === TIMELESS_UNKNOWN ? '?' : o.lines.map((l) => l[0]).join(' / ') + (o.rep ? ` [${o.name![0]}]` : '')
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

describe('timeless.json', () => {
  it('разбирается; чужой формат — null', () => {
    expect(data).not.toBeNull()
    expect(parseTimelessData({ v: 99 })).toBeNull()
    expect(parseTimelessData(null)).toBeNull()
    expect(Object.keys(data.jewels).sort()).toEqual([...TIMELESS_KINDS].sort())
  })

  it('21 гнездо; ноды в радиусе 1800 совпадают с координатами дерева S36 (nodePosition)', () => {
    expect(data.sockets).toHaveLength(21)
    expect(data.meta.radius).toBe(1800)
    const tree = parseTreeData(JSON.parse(readFileSync(resolve(DATA, 'tree.json'), 'utf8')))!
    for (const s of data.sockets) {
      const p0 = nodePosition(tree, tree.nodes.get(s.id)!)!
      const expected = [...tree.nodes.values()]
        .filter((n) => n.kind === 'notable' && !n.asc && !n.proxy && !n.bloodline)
        .filter((n) => {
          const p = nodePosition(tree, n)!
          return Math.hypot(p.x - p0.x, p.y - p0.y) <= 1800
        })
        .map((n) => n.hash)
        .sort((a, b) => a - b)
      expect(s.notables.map((r) => data.rows[r]).sort((a, b) => a - b)).toEqual(expected)
      expect(data.names[s.near]).toBeDefined()
    }
  })

  it('исходы с текстами EN и RU; у заменённых нотаблов есть имя', () => {
    for (const kind of TIMELESS_KINDS) {
      for (const o of data.jewels[kind].outcomes) {
        expect(o.lines.length).toBeGreaterThan(0)
        for (const [en, ru] of o.lines) expect(en && ru).toBeTruthy()
        if (o.rep) expect(o.name?.[1]).toBeTruthy()
      }
    }
  })

  it('лукап: размер = нотаблы × сиды, коды исходов в пределах списка', () => {
    for (const kind of TIMELESS_KINDS) {
      const t = table(kind)
      const n = data.jewels[kind].outcomes.length
      expect(t.bytes.every((c) => c < n || c === TIMELESS_UNKNOWN)).toBe(true)
    }
  })

  it('распаковка средствами платформы (DecompressionStream) = zlib Node', async () => {
    const j = data.jewels.MF
    const viaStream = await inflateZlib(readFileSync(resolve(DATA, j.file)))
    expect(viaStream).toEqual(table('MF').bytes)
  })
})

describe('исход на эталонных сидах (калькулятор Vilsol, гнездо 26725)', () => {
  it('Militant Faith 2000: 22 нотабла, Stamina и Barbarism заменены', () => {
    expect(outcomeCounts('MF', 2000, 26725)).toEqual({
      '+5 to Devotion': 20,
      '15% of Physical Damage Converted to Cold Damage while you have at least 150 Devotion [Calming Devotion]': 1,
      'Immune to Elemental Ailments while on Consecrated Ground if you have at least 150 Devotion [Cloistered]': 1
    })
    const names = (row: number) => data.names[data.rows[row]][0]
    const s = socketOf(26725)
    const replaced = s.notables.filter((r) => data.jewels.MF.outcomes[outcomeAt(table('MF'), r, 2000)].rep).map(names).sort()
    expect(replaced).toEqual(['Barbarism', 'Stamina'])
  })

  it('Lethal Pride 12345', () => {
    expect(outcomeCounts('LP', 12345, 26725)).toEqual({
      '5% chance to deal Double Damage': 2,
      '20% increased Burning Damage': 2,
      '+20% to Fire Resistance': 2,
      'Ignites you inflict deal Damage 10% faster': 2,
      'You take 10% reduced Extra Damage from Critical Strikes': 2,
      '20% increased Armour': 2,
      '+1 to maximum Fortification': 1,
      '20% increased Physical Damage': 1,
      '5% increased Strength': 1,
      '4% increased maximum Life': 1,
      '30% increased Melee Critical Strike Chance': 1,
      '0.4% of Attack Damage Leeched as Life': 1,
      '5% chance to gain an Endurance Charge on Kill': 1,
      '20% increased Melee Damage': 1,
      '20% increased Stun Duration on Enemies': 1,
      'Regenerate 1% of Life per second': 1
    })
  })

  it('Elegant Hubris 60000 монет (сид 3000 в данных)', () => {
    expect(dataSeedOf(data, 'EH', 60000)).toBe(3000)
    const c = outcomeCounts('EH', 3000, 26725)
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(22)
    expect(c).toMatchObject({
      '8% increased Evasion Rating per Frenzy Charge [Eternal Adaptiveness]': 2,
      '80% increased Evasion Rating [Shadowy Streets]': 2,
      '80% chance to Avoid being Chilled [Rites of Solaris]': 2,
      '+40% to Critical Strike Multiplier [Brutal Execution]': 1,
      '80% increased Spell Critical Strike Chance [Gemling Ambush]': 1,
      '50% increased Damage with Bleeding / Bleeding you inflict deals Damage 10% faster [Geofri\'s End]': 1
    })
  })
})

describe('сиды', () => {
  it('Elegant Hubris — «монеты» ÷ 20; вне диапазона и не кратные — null', () => {
    expect(dataSeedOf(data, 'EH', 159200)).toBe(7960)
    expect(itemSeedOf(data, 'EH', 7960)).toBe(159200)
    expect(dataSeedOf(data, 'EH', 159210)).toBeNull()
    expect(dataSeedOf(data, 'EH', 1000)).toBeNull()
    expect(dataSeedOf(data, 'LP', 9999)).toBeNull()
    expect(dataSeedOf(data, 'LP', 18000)).toBe(18000)
  })

  it('Glorious Vanity и Abyss — оценки нет', () => {
    expect(dataKindOf('GV')).toBeNull()
    expect(dataKindOf('ABYSS')).toBeNull()
    expect(dataKindOf('HT')).toBe('HT')
  })
})

describe('лучшее гнездо', () => {
  it('Militant Faith: Преданность = атрибутные ×10 + мелкие ×5 + незаменённые нотаблы ×5', () => {
    const ev = evaluateSeed(data, table('MF'), 2000)
    const s = ev.sockets.find((x) => data.sockets[x.socket].id === 26725)!
    const sock = socketOf(26725)
    expect(s.theme).toBe('devotion')
    expect(s.score).toBe(sock.attr * 10 + sock.small * 5 + 20 * 5)
    expect(s.notes.map((n) => data.jewels.MF.outcomes[n.code].name![0]).sort()).toEqual(['Calming Devotion', 'Cloistered'])
    expect(ev.best!.score).toBe(Math.max(...ev.sockets.map((x) => x.score)))
    expect(ev.sockets).toHaveLength(21)
  })

  it('Lethal Pride: счёт гнезда — нотаблы лучшей темы; гнёзда по убыванию', () => {
    const ev = evaluateSeed(data, table('LP'), 12345)
    const s = ev.sockets.find((x) => data.sockets[x.socket].id === 26725)!
    // в гнезде 26725: двойной урон ×2, жизнь 4% ×1 + реген ×1, крит ближнего боя ×1, физ ×2+… — лучшая тема набирает ≥ 2
    expect(s.score).toBeGreaterThanOrEqual(2)
    expect(s.notes.reduce((a, n) => a + n.count, 0)).toBe(s.score)
    for (let i = 1; i < ev.sockets.length; i++) expect(ev.sockets[i - 1].score).toBeGreaterThanOrEqual(ev.sockets[i].score)
    expect(ev.best).toBe(ev.sockets[0])
  })

  it('счёт по теме лучшего гнезда = seedScore', () => {
    for (const [kind, seed] of [['LP', 12345], ['BR', 6375], ['EH', 3000], ['HT', 4000], ['MF', 5528]] as const) {
      const ev = evaluateSeed(data, table(kind), seed)
      expect(ev.best).not.toBeNull()
      expect(seedScore(data, table(kind), seed, ev.best!.theme)).toBe(ev.best!.score)
    }
  })
})

describe('аналоги: сиды с таким же или лучшим исходом', () => {
  it('свой сид первый, не больше лимита, все не хуже', () => {
    const t = table('LP')
    const ev = evaluateSeed(data, t, 12810)
    const a = findAnalogs(data, t, ev, 45)
    expect(a.seeds[0]).toBe(12810)
    expect(a.seeds.length).toBeLessThanOrEqual(45)
    expect(a.total).toBe(8001)
    expect(a.qualifying).toBeGreaterThanOrEqual(a.seeds.length)
    for (const s of a.seeds) expect(seedScore(data, t, s, ev.best!.theme)).toBeGreaterThanOrEqual(ev.best!.score)
    // сначала с таким же счётом
    const scores = a.seeds.slice(1).map((s) => seedScore(data, t, s, ev.best!.theme))
    expect([...scores].sort((x, y) => x - y)).toEqual(scores)
  })

  it('оценить нельзя — аналогов нет', () => {
    const ev = { ...evaluateSeed(data, table('BR'), 600), best: null }
    expect(findAnalogs(data, table('BR'), ev, 100).seeds).toEqual([])
  })
})

let pdata: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  pdata = await store.ensureAll()
})
function check(lang: Poe1Lang, name: string, mode?: 'any' | 'exact') {
  const res = parseItem(readFixture(lang, name), pdata)
  if (!res.ok) throw new Error(`${lang}/${name}: ${res.error}`)
  const item: ParsedItem = res.value
  const pc = createPriceCheck(item, pdata[lang], { league: 'Standard', timelessConqueror: mode })
  return { item, preset: pc.presets.find((p) => p.id === pc.active)! }
}

describe('count-запрос аналогов', () => {
  it('точный завоеватель: до 180 сидов, stat id завоевателя, значения как на предмете (EH ×20)', () => {
    const { item, preset } = check('en', 'timeless-01')
    const info = preset.timeless as TimelessSearch
    expect(analogConquerors(info)).toEqual(['Cadiro'])
    expect(maxAnalogSeeds(info)).toBe(MAX_ANALOG_FILTERS)
    const seeds = Array.from({ length: 200 }, (_, i) => itemSeedOf(data, 'EH', 100 + i))
    const req = buildRequest(item, pdata.en, analogPreset(preset, info, seeds))
    const body = req.body as { query: { stats: { type: string; filters: { id: string; value: { min: number; max: number } }[] }[] } }
    const count = body.query.stats.find((g) => g.type === 'count')!
    expect(count.filters).toHaveLength(180)
    expect(new Set(count.filters.map((f) => f.id))).toEqual(new Set(['explicit.pseudo_timeless_jewel_cadiro']))
    expect(count.filters[0].value).toEqual({ min: 2000, max: 2000 })
    expect(count.filters.every((f) => f.value.min === f.value.max && f.value.min % 20 === 0)).toBe(true)
    // основной пресет не тронут
    const own = preset.stats.find((s): s is FilterGroup => s.group === 'one')!
    expect(own.stats).toHaveLength(4)
  })

  it('любой завоеватель: сиды × все завоеватели (с legacy) ≤ 180', () => {
    const { item, preset } = check('ru', 'timeless-08')
    const info = preset.timeless as TimelessSearch
    expect(info.mode).toBe('any')
    expect(analogConquerors(info)).toEqual(['Kaom', 'Rakiata', 'Akoya', 'Kiloava'])
    expect(maxAnalogSeeds(info)).toBe(45)
    const seeds = Array.from({ length: 80 }, (_, i) => 10000 + i)
    const body = buildRequest(item, pdata.ru, analogPreset(preset, info, seeds)).body as {
      query: { stats: { type: string; filters: { id: string }[] }[] }
    }
    const count = body.query.stats.find((g) => g.type === 'count')!
    expect(count.filters).toHaveLength(180)
    expect(count.filters.slice(0, 4).map((f) => f.id)).toEqual([
      'explicit.pseudo_timeless_jewel_kaom',
      'explicit.pseudo_timeless_jewel_rakiata',
      'explicit.pseudo_timeless_jewel_akoya',
      'explicit.pseudo_timeless_jewel_kiloava'
    ])
  })

  it('RU и EN предмет дают одинаковые оценку и запрос аналогов', () => {
    for (const name of ['timeless-01', 'timeless-02', 'timeless-07', 'timeless-08', 'timeless-09']) {
      const en = check('en', name)
      const ru = check('ru', name)
      const ie = en.preset.timeless as TimelessSearch
      const ir = ru.preset.timeless as TimelessSearch
      const kind = dataKindOf(ie.jewel)!
      expect(dataKindOf(ir.jewel)).toBe(kind)
      const se = dataSeedOf(data, kind, ie.seed)!
      expect(dataSeedOf(data, kind, ir.seed)).toBe(se)
      const ev = evaluateSeed(data, table(kind), se)
      expect(evaluateSeed(data, table(kind), dataSeedOf(data, kind, ir.seed)!)).toEqual(ev)
      const seeds = findAnalogs(data, table(kind), ev, maxAnalogSeeds(ie)).seeds.map((s) => itemSeedOf(data, kind, s))
      const qe = buildRequest(en.item, pdata.en, analogPreset(en.preset, ie, seeds)).body as { query: { stats: unknown[] } }
      const qr = buildRequest(ru.item, pdata.ru, analogPreset(ru.preset, ir, seeds)).body as { query: { stats: unknown[] } }
      expect(qr.query.stats).toEqual(qe.query.stats)
    }
  })
})
