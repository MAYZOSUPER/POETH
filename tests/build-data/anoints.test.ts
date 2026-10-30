import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import {
  BUILD_ANOINTS_FILE,
  anointByName,
  anointByOils,
  anointCost,
  anointLine,
  anointOils,
  anointsWithOils,
  buildAnoint,
  costView,
  oilsKey,
  parseAnointData,
  searchAnoints,
  setAnointName,
  type AnointData
} from '@shared/build/anoints'
import { BUILD_TREE_FILE, nodeName, parseTreeData } from '@shared/build/data'
import { parseCurrencyTable } from '@shared/currency'
import type { TreeData } from '@shared/build/types'
import { importPobCode } from '@shared/pob/import'
import { resolveStages } from '@shared/pob/stages'
import { fixtureCode } from '../pob/fixtures'

// Анойнт PoE1 3.29 (S54): resources/data/poe1/build/anoints.json (генератор tools/build-data/anoints.mjs — поле
// `recipe` выгрузки дерева GGG + тиры масел из таблицы клиента). Известные рецепты; сверка всех рецептов и RU-имён
// с независимым источником — данными APT (stats.ndjson: «Allocates X» с hash ноды в id трейда и маслами);
// обратный поиск; стоимость по ценам-фикстурам; анойнт амулета из настоящих кодов PoB; RU = EN.

const DATA = resolve(__dirname, '../../resources/data/poe1')
const raw = JSON.parse(readFileSync(resolve(DATA, BUILD_ANOINTS_FILE), 'utf8'))
const data = parseAnointData(raw) as AnointData
const tree = parseTreeData(JSON.parse(readFileSync(resolve(DATA, BUILD_TREE_FILE), 'utf8'))) as TreeData

const oil = (en: string): number => data.oils.findIndex((o) => o.en === en)
const recipeOf = (name: string): string[] => anointOils(data, anointByName(data, tree, name)!)!.map((o) => o.en)
const hashOf = (name: string): number => anointByName(data, tree, name)!

interface AptStat {
  ref: string
  anointments?: { oils: string }[]
  matchers: { string: string }[]
  trade?: { ids?: { enchant?: string[] } }
}

/** «Allocates X» из stats.ndjson APT: hash ноды (id трейда `…|hash`) → [масла по тиру, текст матчера]. */
function aptAnoints(lang: 'en' | 'ru'): Map<number, { oils: number[]; text: string }> {
  const out = new Map<number, { oils: number[]; text: string }>()
  for (const line of readFileSync(resolve(DATA, lang, 'stats.ndjson'), 'utf8').split('\n')) {
    if (!line.includes('"ref":"Allocates ') || !line.includes('anointments')) continue
    // одинаковый текст в клиенте у нескольких статов APT пишет одной строкой { resolve, stats: […] }
    const r = JSON.parse(line) as AptStat | { stats: AptStat[] }
    for (const s of 'stats' in r ? r.stats : [r]) {
      if (!s.ref.startsWith('Allocates ') || s.anointments?.length !== 1) continue
      for (const id of s.trade?.ids?.enchant ?? []) {
        const m = /\|(\d+)$/.exec(id)
        // у APT масла — индексы по тиру (Prismatic 0 … Golden 13), как у нас
        if (m) out.set(Number(m[1]), { oils: s.anointments[0].oils.split(',').map(Number).sort((a, b) => a - b), text: s.matchers[0].string })
      }
    }
  }
  return out
}

describe('anoints.json', () => {
  it('разбирается; формат новее приложения или чужой файл — null', () => {
    expect(data).not.toBeNull()
    expect(data.recipes.size).toBe(data.meta.recipes)
    expect(data.recipes.size).toBe(472)
    expect(data.byOils.size).toBe(472) // у каждой ноты свой набор масел
    expect(parseAnointData({ ...raw, v: 2 })).toBeNull()
    expect(parseAnointData([])).toBeNull()
    expect(parseAnointData({ ...raw, oils: [['ClearOil', 1, 'clear-oil']] })).toBeNull()
  })

  it('масла по тиру: Prismatic, Clear … Golden; tradeTag для данных APT', () => {
    expect(data.oils.map((o) => o.en)).toEqual([
      'Prismatic Oil',
      'Clear Oil',
      'Sepia Oil',
      'Amber Oil',
      'Verdant Oil',
      'Teal Oil',
      'Azure Oil',
      'Indigo Oil',
      'Violet Oil',
      'Crimson Oil',
      'Black Oil',
      'Opalescent Oil',
      'Silver Oil',
      'Golden Oil'
    ])
    expect(data.oils[1]).toEqual({ index: 1, id: 'ClearOil', en: 'Clear Oil', tag: 'clear-oil' })
  })

  it('у каждого масла есть имя и иконка в данных APT (EN и RU) по tradeTag, английское имя = цена у Фаустуса', () => {
    for (const lang of ['en', 'ru'] as const) {
      const table = parseCurrencyTable(readFileSync(resolve(DATA, lang, 'items.ndjson'), 'utf8').replace(/\r\n/g, '\n'))
      for (const o of data.oils) {
        const e = table.get(o.tag)
        expect(e, `${lang} ${o.tag}`).toBeDefined()
        expect(e!.refName).toBe(o.en)
        expect(e!.icon).toMatch(/^https:\/\/web\.poecdn\.com\//)
      }
    }
    const ru = parseCurrencyTable(readFileSync(resolve(DATA, 'ru', 'items.ndjson'), 'utf8').replace(/\r\n/g, '\n'))
    expect(ru.get('golden-oil')?.name).toBe('Золотое масло')
    const ids = JSON.parse(readFileSync(resolve(DATA, 'wealth', 'exchange-ids.json'), 'utf8')) as { names: Record<string, string> }
    const feedNames = new Set(Object.values(ids.names))
    for (const o of data.oils) expect(feedNames.has(o.en), o.en).toBe(true)
  })

  it('все ноты анойнта есть в tree.json и это нотаблы (один кейстоун — только анойнтом)', () => {
    const kinds = new Map<string, number>()
    for (const hash of data.recipes.keys()) {
      const n = tree.nodes.get(hash)
      expect(n, String(hash)).toBeDefined()
      kinds.set(n!.kind, (kinds.get(n!.kind) ?? 0) + 1)
    }
    expect(Object.fromEntries(kinds)).toEqual({ notable: 471, keystone: 1 })
    expect(data.only.size).toBe(30)
  })
})

describe('рецепты: нота → масла', () => {
  it('известные рецепты', () => {
    expect(recipeOf('Whispers of Doom')).toEqual(['Golden Oil', 'Golden Oil', 'Golden Oil'])
    expect(recipeOf('Charisma')).toEqual(['Opalescent Oil', 'Golden Oil', 'Golden Oil'])
    expect(recipeOf('Spirit Void')).toEqual(['Verdant Oil', 'Verdant Oil', 'Verdant Oil'])
    expect(recipeOf('Twin Terrors')).toEqual(['Clear Oil', 'Azure Oil', 'Black Oil'])
    expect(recipeOf('Ash, Frost and Storm')).toEqual(['Sepia Oil', 'Crimson Oil', 'Crimson Oil'])
    // нота только для анойнта: в рецепте Prismatic Oil
    expect(recipeOf('Vengeant Cascade')).toEqual(['Prismatic Oil', 'Indigo Oil', 'Opalescent Oil'])
    expect(data.only.has(hashOf('Vengeant Cascade'))).toBe(true)
    expect(data.only.has(hashOf('Whispers of Doom'))).toBe(false)
  })

  it('не нота анойнта — null', () => {
    expect(anointOils(data, 999_999)).toBeNull()
    expect(anointByName(data, tree, 'Life')).toBeNull()
    expect(anointByName(data, tree, '')).toBeNull()
  })

  it('все 472 рецепта совпадают с независимым источником — данными APT (EN и RU)', () => {
    for (const lang of ['en', 'ru'] as const) {
      const apt = aptAnoints(lang)
      expect(apt.size).toBe(data.recipes.size)
      for (const [hash, recipe] of data.recipes) expect(apt.get(hash)?.oils, `${lang} ${hash}`).toEqual([...recipe])
    }
  })
})

describe('обратный поиск: масла → нота', () => {
  it('любой порядок масел и повторы; каждый рецепт находится', () => {
    const wod = hashOf('Whispers of Doom')
    const g = oil('Golden Oil')
    expect(anointByOils(data, [g, g, g])).toBe(wod)
    const tt = hashOf('Twin Terrors')
    const [c, a, b] = [oil('Clear Oil'), oil('Azure Oil'), oil('Black Oil')]
    for (const order of [[c, a, b], [b, a, c], [a, c, b]]) expect(anointByOils(data, order)).toBe(tt)
    for (const [hash, recipe] of data.recipes) expect(anointByOils(data, [...recipe].reverse())).toBe(hash)
  })

  it('не три масла или такого рецепта нет — null', () => {
    const g = oil('Golden Oil')
    expect(anointByOils(data, [g, g])).toBeNull()
    expect(anointByOils(data, [g, g, g, g])).toBeNull()
    // наборов из трёх масел 14 видов — 560, рецептов 472: остальные ничего не дают
    let none = 0
    for (let a = 0; a < 14; a++) for (let b = a; b < 14; b++) for (let c = b; c < 14; c++) if (anointByOils(data, [a, b, c]) === null) none++
    expect(none).toBe(560 - 472)
    expect(oilsKey([3, 1, 2])).toBe('1,2,3')
  })

  it('выбраны не все масла — какие ноты ещё возможны', () => {
    const g = oil('Golden Oil')
    const two = anointsWithOils(data, [g, g])
    expect(two).toContain(hashOf('Whispers of Doom'))
    expect(two).toContain(hashOf('Charisma'))
    for (const h of two) expect([...data.recipes.get(h)!].filter((i) => i === g).length).toBeGreaterThanOrEqual(2)
    expect(anointsWithOils(data, [])).toEqual([])
  })
})

describe('поиск ноты по имени: RU = EN', () => {
  it('одно и то же по EN и RU имени, регистр и «ё» не важны', () => {
    const wod = hashOf('Whispers of Doom')
    expect(nodeName(tree.nodes.get(wod)!, 'ru')).toBe('Шепот рока')
    expect(anointByName(data, tree, 'Шепот рока')).toBe(wod)
    expect(anointByName(data, tree, 'шёпот РОКА')).toBe(wod)
    expect(anointByName(data, tree, 'whispers of doom')).toBe(wod)
    expect(searchAnoints(data, tree, 'Whispers', 'ru')[0].hash).toBe(wod)
    expect(searchAnoints(data, tree, 'Шёпот', 'en')[0].hash).toBe(wod)
    expect(searchAnoints(data, tree, 'рока', 'ru').map((h) => h.hash)).toContain(wod)
  })

  it('порядок: имя с начала, слово с начала, часть имени, статы; предел', () => {
    const hits = searchAnoints(data, tree, 'charisma', 'en')
    expect(hits[0]).toEqual({ hash: hashOf('Charisma'), by: 'start' })
    const frost = searchAnoints(data, tree, 'frost', 'en')
    expect(frost.find((h) => h.hash === hashOf('Ash, Frost and Storm'))?.by).toBe('word')
    const ranks = { start: 0, word: 1, part: 2, stat: 3 }
    const many = searchAnoints(data, tree, 'mana', 'en', 50)
    expect(many.length).toBeGreaterThan(8)
    expect(many.some((h) => h.by === 'stat')).toBe(true)
    for (let i = 1; i < many.length; i++) expect(ranks[many[i].by]).toBeGreaterThanOrEqual(ranks[many[i - 1].by])
    expect(searchAnoints(data, tree, 'mana', 'en')).toHaveLength(8)
    expect(searchAnoints(data, tree, 'ма', 'ru').every((h) => h.by !== 'stat')).toBe(true) // статы — от 3 букв
    expect(searchAnoints(data, tree, '   ', 'ru')).toEqual([])
  })

  it('RU-имена нот = имена в RU-данных APT («Активирует <нота>»)', () => {
    const apt = aptAnoints('ru')
    let checked = 0
    for (const hash of data.recipes.keys()) {
      const text = apt.get(hash)!.text
      const m = /^Активирует (.+)$/.exec(text)
      expect(m, text).not.toBeNull()
      expect(tree.nodes.get(hash)!.ru.replace(/ё/g, 'е'), String(hash)).toBe(m![1].replace(/ё/g, 'е'))
      checked++
    }
    expect(checked).toBe(472)
  })

  it('одинаковые RU-имена у разных нот: поиск отдаёт обе', () => {
    const byRu = new Map<string, number[]>()
    for (const h of data.recipes.keys()) {
      const ru = tree.nodes.get(h)!.ru.toLowerCase()
      byRu.set(ru, [...(byRu.get(ru) ?? []), h])
    }
    const twins = [...byRu.values()].filter((l) => l.length > 1)
    expect(twins.length).toBeGreaterThan(0)
    for (const pair of twins) {
      const name = tree.nodes.get(pair[0])!.ru
      expect(searchAnoints(data, tree, name, 'ru').map((h) => h.hash)).toEqual(expect.arrayContaining(pair))
      // EN-имена у них разные — по ним PoB и гайды однозначны
      expect(new Set(pair.map((h) => tree.nodes.get(h)!.en)).size).toBe(pair.length)
    }
  })
})

describe('стоимость по ценам масел', () => {
  const prices = new Map([
    ['golden-oil', 120],
    ['opalescent-oil', 8.5],
    ['clear-oil', 0.2]
  ])

  it('сумма по трём маслам; повторы считаются', () => {
    const charisma = anointOils(data, hashOf('Charisma'))!
    expect(anointCost(charisma, prices)).toEqual({ each: [8.5, 120, 120], total: 248.5 })
    const wod = anointOils(data, hashOf('Whispers of Doom'))!
    expect(anointCost(wod, prices).total).toBe(360)
  })

  it('нет цены хотя бы у одного масла — без суммы; цен нет — без цены', () => {
    const tt = anointOils(data, hashOf('Twin Terrors'))!
    expect(anointCost(tt, prices)).toEqual({ each: [0.2, null, null], total: null })
    expect(anointCost(tt, null)).toEqual({ each: [null, null, null], total: null })
    expect(anointCost(tt, new Map([['clear-oil', 0], ['azure-oil', Number.NaN], ['black-oil', 3]])).total).toBeNull()
  })

  it('как показать: chaos с одним знаком до 10, от 1 div — в divine', () => {
    expect(costView(0.6, 200)).toEqual({ unit: 'chaos', n: 0.6 })
    expect(costView(9.94, 200)).toEqual({ unit: 'chaos', n: 9.9 })
    expect(costView(48.5, 200)).toEqual({ unit: 'chaos', n: 49 })
    expect(costView(360, 200)).toEqual({ unit: 'divine', n: 1.8 })
    expect(costView(2400, 200)).toEqual({ unit: 'divine', n: 12 })
    expect(costView(360, null)).toEqual({ unit: 'chaos', n: 360 })
  })
})

describe('анойнт амулета из билда PoB', () => {
  function load(name: string) {
    const res = importPobCode(fixtureCode(name), inflateNode)
    if (!res.ok) throw new Error(`${name}: ${res.error}`)
    return { build: res.build, plan: resolveStages(res.build) }
  }

  it('строка «Allocates X»: созданная или зачарованная; Forbidden Flame/Flesh и обычный мод — не анойнт', () => {
    expect(anointLine([{ text: 'Allocates Charisma', crafted: true }])).toBe('Charisma')
    expect(anointLine([{ text: 'Allocates Ash, Frost and Storm', enchant: true }])).toBe('Ash, Frost and Storm')
    expect(anointLine([{ text: 'Allocates Impact if you have the matching modifier on Forbidden Flesh', crafted: true }])).toBeNull()
    expect(anointLine([{ text: 'Allocates Charisma' }])).toBeNull()
    expect(anointLine([{ text: '+20 to Strength', crafted: true }])).toBeNull()
  })

  it('этапы с разными амулетами: у этапа — свой анойнт', () => {
    const { build, plan } = load('pobbin-leveling-ranges')
    expect(buildAnoint(build, plan, 0)).toEqual({ name: 'Graceful Assault', stage: 0, here: true })
    expect(buildAnoint(build, plan, 7)).toEqual({ name: 'Charisma', stage: 7, here: true })
    expect(anointByName(data, tree, 'Graceful Assault')).not.toBeNull()
  })

  it('на этапе амулет без анойнта — ближайший этап автора с анойнтом', () => {
    const { build, plan } = load('pobbin-short-acts')
    expect(setAnointName(build, plan.stages[0].items)).toBeNull()
    expect(buildAnoint(build, plan, 0)).toEqual({ name: 'Ash, Frost and Storm', stage: 11, here: false })
    expect(buildAnoint(build, plan, 13)).toEqual({ name: 'Ash, Frost and Storm', stage: 13, here: true })
  })

  it('анойнта у автора нет — null (ничего не выдумываем)', () => {
    for (const name of ['pobbin-acts-all-axes', 'pastebin-acts-lv', 'pobbin-guardian', 'pobbin-crit']) {
      const { build, plan } = load(name)
      for (let i = 0; i < Math.max(plan.stages.length, 1); i++) expect(buildAnoint(build, plan, i), name).toBeNull()
    }
  })

  it('все анойнты фикстур — ноты анойнта (EN-имя PoB находится)', () => {
    for (const name of ['pob-spec-occvortex', 'pobbin-death-oath-328', 'pobbin-huge', 'pobbin-leveling-endgame-variants', 'pobbin-three-trees', 'pobbin-two-variants', 'pobcodes-nightblade', 'poedb-deadeye']) {
      const { build, plan } = load(name)
      const a = buildAnoint(build, plan, 0)
      expect(a, name).not.toBeNull()
      expect(anointByName(data, tree, a!.name), `${name}: ${a!.name}`).not.toBeNull()
    }
    const { build, plan } = load('pobcodes-nightblade')
    expect(recipeOf(buildAnoint(build, plan, 0)!.name)).toEqual(['Prismatic Oil', 'Silver Oil', 'Silver Oil']) // Incorporeal
  })
})

describe('tools/build-data/anoints.mjs', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = (): Promise<any> => import(pathToFileURL(resolve(__dirname, '../../tools/build-data/anoints.mjs')).href)
  const oilRows = [
    { UseType: '1', Tier: '0', NameShort: 'Tainted' },
    { UseType: '0', Tier: '2', NameShort: 'Sepia' },
    { UseType: '0', Tier: '0', NameShort: 'Prismatic' },
    { UseType: '0', Tier: '1', NameShort: 'Clear' }
  ]
  const exp = {
    nodes: {
      '30': { name: 'Second', recipe: ['SepiaOil', 'ClearOil', 'ClearOil'] },
      '7': { name: 'First', recipe: ['PrismaticOil', 'ClearOil', 'SepiaOil'], isBlighted: true },
      '9': { name: 'No recipe' }
    }
  }

  it('масла по тиру без Tainted/Reflective, рецепты по тиру, только анойнтом; детерминизм', async () => {
    const { buildAnoints, oilTag } = await load()
    const { data: out, report } = buildAnoints({ exp, oilRows, meta: { tree: 't' } })
    expect(out.oils).toEqual([
      ['PrismaticOil', 'Prismatic Oil', 'prismatic-oil'],
      ['ClearOil', 'Clear Oil', 'clear-oil'],
      ['SepiaOil', 'Sepia Oil', 'sepia-oil']
    ])
    expect(out.recipes).toEqual({ '7': [0, 1, 2], '30': [1, 1, 2] })
    expect(out.only).toEqual([7])
    expect(out.meta).toEqual({ tree: 't', recipes: 2 })
    expect(report).toEqual({ unknownOils: [], bad: [], duplicates: [] })
    const again = buildAnoints({ exp: { nodes: Object.fromEntries(Object.entries(exp.nodes).reverse()) }, oilRows: [...oilRows].reverse(), meta: { tree: 't' } })
    expect(JSON.stringify(again.data)).toBe(JSON.stringify(out))
    expect(parseAnointData(out)?.recipes.size).toBe(2)
    expect(oilTag('Opalescent Oil')).toBe('opalescent-oil')
  })

  it('неизвестное масло, не три масла, одинаковые наборы — в отчёт', async () => {
    const { buildAnoints } = await load()
    const bad = {
      nodes: {
        '1': { name: 'A', recipe: ['ClearOil', 'ClearOil', 'GreenOil'] },
        '2': { name: 'B', recipe: ['ClearOil', 'ClearOil'] },
        '3': { name: 'C', recipe: ['ClearOil', 'SepiaOil', 'ClearOil'] },
        '4': { name: 'D', recipe: ['SepiaOil', 'ClearOil', 'ClearOil'] }
      }
    }
    const { report } = buildAnoints({ exp: bad, oilRows, meta: {} })
    expect(report.unknownOils).toHaveLength(1)
    expect(report.bad).toHaveLength(1)
    expect(report.duplicates).toEqual(['1,1,2: C и D'])
  })
})
