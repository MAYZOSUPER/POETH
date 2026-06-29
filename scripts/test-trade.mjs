// Unit tests for the pure trade-core (item parser, search-body builder, price
// summary, rate limiter, league filter). tradeCore.ts has no electron imports,
// so we transpile it with esbuild (already a transitive dep) and exercise it in
// plain Node. Run: `npm run test:trade`.

import esbuild from 'esbuild'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const srcPath = path.resolve('src/main/services/tradeCore.ts')
const { code } = esbuild.transformSync(fs.readFileSync(srcPath, 'utf8'), {
  loader: 'ts',
  format: 'esm'
})
const tmp = path.join(os.tmpdir(), `tradeCore.${process.pid}.mjs`)
fs.writeFileSync(tmp, code)
const M = await import(pathToFileURL(tmp).href)

let pass = 0
let fail = 0
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) pass++
  else {
    fail++
    console.error(`FAIL ${msg}\n  expected ${e}\n  actual   ${a}`)
  }
}
function ok(cond, msg) {
  if (cond) pass++
  else {
    fail++
    console.error(`FAIL ${msg}`)
  }
}

// ---- fixtures (real PoE2 clipboard shapes, EN + RU) ----
const UNIQUE_EN = `Item Class: Foci
Rarity: Unique
The Eternal Spark
Crystal Focus
--------
Energy Shield: 44 (augmented)
--------
Requires: Level 26, 43 (augmented) Int
--------
Item Level: 81
--------
56(50-70)% increased Energy Shield
--------
A flash of blue, a stormcloud's kiss
`

const RARE_RU = `Класс предмета: Луки
Редкость: Редкий
Коготь Бури
Зловещий лук
--------
Физический урон: 32-61
--------
Уровень предмета: 74
--------
Неопознано
`

const CURRENCY_EN = `Item Class: Stackable Currency
Rarity: Currency
Exalted Orb
--------
Stack Size: 12/10
--------
Grants additional currency modifiers
`

const GEM_EN = `Item Class: Skill Gems
Rarity: Gem
Lightning Arrow
--------
Lightning, Projectile, Attack
Level: 20
--------
`

const UNCUT_RARITY_ONLY = `Rarity: Currency
Uncut Support Gem
--------
Place into an item socket
`

const CORRUPTED_EN =
  UNIQUE_EN +
  `--------
Corrupted
`

// ---- parseItem ----
const u = M.parseItem(UNIQUE_EN)
eq(
  { r: u.rarity, k: u.kind, n: u.name, b: u.baseType, c: u.itemClass, il: u.itemLevel, id: u.identified, co: u.corrupted },
  { r: 'Unique', k: 'unique', n: 'The Eternal Spark', b: 'Crystal Focus', c: 'Foci', il: 81, id: true, co: false },
  'parse unique EN'
)

const r = M.parseItem(RARE_RU)
eq(
  { r: r.rarity, k: r.kind, n: r.name, b: r.baseType, c: r.itemClass, il: r.itemLevel, id: r.identified },
  { r: 'Rare', k: 'rare', n: 'Коготь Бури', b: 'Зловещий лук', c: 'Луки', il: 74, id: false },
  'parse rare RU (unidentified)'
)

const c = M.parseItem(CURRENCY_EN)
eq({ r: c.rarity, k: c.kind, n: c.name, b: c.baseType }, { r: 'Currency', k: 'currency', n: 'Exalted Orb', b: undefined }, 'parse currency EN')

const g = M.parseItem(GEM_EN)
eq({ k: g.kind, n: g.name, gl: g.gemLevel, cls: g.itemClass }, { k: 'gem', n: 'Lightning Arrow', gl: 20, cls: 'Skill Gems' }, 'parse gem EN (gem level)')

const uo = M.parseItem(UNCUT_RARITY_ONLY)
ok(uo && uo.kind === 'currency' && uo.name === 'Uncut Support Gem', 'parse rarity-only lead (no Item Class)')

const co = M.parseItem(CORRUPTED_EN)
ok(co.corrupted === true, 'detect corrupted')

ok(M.parseItem('just some random clipboard text\nnot an item') === null, 'reject non-item')
ok(M.parseItem('') === null, 'reject empty')

// ---- buildSearchBody ----
const bu = M.buildSearchBody(u)
eq(bu.query.name, 'The Eternal Spark', 'unique body uses name')
eq(bu.query.type, 'Crystal Focus', 'unique body uses base type')
eq(bu.query.stats, [{ type: 'and', filters: [] }], 'unique body has empty stats group')
eq(bu.sort, { price: 'asc' }, 'unique body sort price asc')
ok(bu.query.name !== undefined && bu.query.filters && Object.keys(bu.query.filters).length === 0, 'unique body has no extra filters')

const br = M.buildSearchBody(r)
eq(br.query.type, 'Зловещий лук', 'rare body searches by base type')
ok(br.query.name === undefined, 'rare body has no name')
eq(br.query.filters.type_filters.filters.rarity, { option: 'nonunique' }, 'rare body rarity nonunique')
eq(br.query.filters.type_filters.filters.ilvl, { min: 72 }, 'rare body ilvl min = itemLevel-2')

const bc = M.buildSearchBody(c)
eq(bc.query.type, 'Exalted Orb', 'currency body searches by type/name')
ok(bc.query.name === undefined, 'currency body has no name')

const bg = M.buildSearchBody(g)
eq(bg.query.type, 'Lightning Arrow', 'gem body type = name')
eq(bg.query.filters.type_filters.filters.category, { option: 'gem.activegem' }, 'gem body category activegem')
eq(bg.query.filters.misc_filters.filters.gem_level, { min: 20 }, 'gem body gem_level min')

const magic = M.parseItem(`Item Class: Rings
Rarity: Magic
Sapphire Ring of the Whelpling
--------
Item Level: 50
`)
const bm = M.buildSearchBody(magic)
eq(bm.query.filters.type_filters.filters.rarity, { option: 'magic' }, 'magic body rarity option')

// ---- summarizeListings ----
const listings = [
  { amount: 5, currency: 'exalted' },
  { amount: 3, currency: 'exalted' },
  { amount: 10, currency: 'exalted' },
  { amount: 1, currency: 'divine' }
]
const sum = M.summarizeListings(listings)
eq(sum.min, { amount: 3, currency: 'exalted' }, 'summary min uses modal currency')
eq(sum.median, { amount: 5, currency: 'exalted' }, 'summary median (lower-mid of 3,5,10)')
eq(sum.display.length, 3, 'summary display only modal currency')
ok(M.summarizeListings([]).min === undefined, 'summary empty -> no min')

// ---- filterLeagues ----
eq(
  M.filterLeagues(['Standard', 'Hardcore', 'Standard (PL1)', 'HC Ruthless', 'Rise of the Abyssal']),
  ['Standard', 'Hardcore', 'Rise of the Abyssal'],
  'filter private/ruthless leagues'
)

// ---- RateLimiter ----
const rl = new M.RateLimiter(2, 1000)
await rl.take()
await rl.take()
let third = false
const p = rl.take().then(() => (third = true))
await new Promise((res) => setTimeout(res, 50))
ok(third === false, 'rate limiter blocks 3rd take within window')
await p
ok(third === true, 'rate limiter releases after window')

rl.syncFromState(8, 10, 1)
ok(rl.max === 8 && rl.windowMs === 10500, 'rate limiter syncs from headers')

console.log(`\n${pass} passed, ${fail} failed`)
fs.unlinkSync(tmp)
process.exit(fail ? 1 : 0)
