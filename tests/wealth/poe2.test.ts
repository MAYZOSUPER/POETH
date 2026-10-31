import path from 'path'
import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { diffSnapshots, qtyProfit } from '@shared/wealth/snapshot'
import { recognizeStash } from '@shared/screen/recognize'
import type { ScreenCell, ScreenRead } from '@shared/types/screen'
import type { Poe2Sources } from '@shared/types/wealth'
import {
  acceptSession,
  addToSession,
  addValuable,
  buildPoe2Snapshot,
  cardTotal,
  cleanValuableInput,
  dropFromSession,
  editCardLine,
  emptySources,
  MANUAL_TAB,
  manualRows,
  needsCheck,
  parsePoe2CurrencyList,
  poe2PriceIndex,
  poe2Totals,
  removeValuable,
  sanitizeSources,
  screenCardTab,
  setGold,
  setManual,
  STALE_MS,
  VALUABLES_TAB,
  type Poe2PriceOf
} from '@shared/wealth/poe2'
import { readPng } from '../ocr/png'
import { embed, FIX, loadIcons, loadLayouts, loadTruth, ROOT } from '../screen/helpers'

// «Богатство PoE 2» (S70): ручной ввод, ценные предметы и снимок вкладки (настоящий эталон S68) → один снимок
// кодом PoE 1 (buildSnapshot), разница и прибыль — qtyProfit / diffSnapshots.

const PRICES: Record<string, number> = {
  'Divine Orb': 600,
  'Exalted Orb': 1,
  'Chaos Orb': 70,
  'Regal Orb': 2.5,
  'Orb of Annulment': 230,
  'Perfect Exalted Orb': 1900,
  'Greater Exalted Orb': 20
}
const priceOf: Poe2PriceOf = (name) => (PRICES[name] ? { unit: PRICES[name], source: 'ange' } : null)
const index = poe2PriceIndex(priceOf, 1)
const L = 'Forbidden Rites'
const T0 = 1_793_000_000_000

const snap = (s: Poe2Sources, id: string, at = T0) => buildPoe2Snapshot({ id, at, league: L, sources: s, index, exPerDivine: 600 })

const cell = (item: string | null, count: number | null, extra: Partial<ScreenCell> = {}): ScreenCell => ({
  rect: { x: 0, y: 0, width: 70, height: 70 },
  item,
  present: true,
  count,
  countSure: true,
  match: 0.9,
  ...extra
})

const read = (cells: ScreenCell[], tab: string | null = 'orbs', at = T0): ScreenRead => ({
  game: 'poe2',
  window: 'stash',
  tab,
  scale: 1,
  client: { width: 2560, height: 1440 },
  cells,
  at,
  ms: { find: 0, match: 0, ocr: 0, total: 0 }
})

/** Настоящий эталон «Орбы» PoE 2 (S68) → ScreenRead; числа — из разметки (распознаватель чисел здесь не нужен). */
function orbsRead(): ScreenRead {
  const shot = embed(readPng(path.join(FIX, 'poe2/p2p-orbs-1440-gray.png')), 2560, 1440, 40, 240)
  const r = recognizeStash({ img: shot, clientHeight: 1440, icons: loadIcons('poe2'), layouts: loadLayouts('poe2') })
  const truth = new Map(loadTruth('poe2/p2p-orbs-1440-gray.json').cells.map((c) => [c.slot, c.count]))
  // Exalted — «неуверенно», остальное прочитано
  const cells = r.cells.map((c) => {
    const count = c.slot !== undefined ? (truth.get(c.slot) ?? null) : null
    return { ...c, count, countSure: c.item !== 'Exalted Orb' }
  })
  return read(cells, r.tab)
}

describe('список валюты для ручного ввода', () => {
  it('данные: div, ex, chaos + 5–8 ходовых, у всех есть цена в фиде PoE 2 и имя RU', () => {
    const list = parsePoe2CurrencyList(JSON.parse(readFileSync(path.join(ROOT, 'resources/data/poe2/wealth/currency.json'), 'utf8')))!
    expect(list.main.map((r) => r.name)).toEqual(['Divine Orb', 'Exalted Orb', 'Chaos Orb'])
    expect(list.common.length).toBeGreaterThanOrEqual(5)
    expect(list.common.length).toBeLessThanOrEqual(8)
    const feed = new Set(
      Object.values(
        JSON.parse(readFileSync(path.join(ROOT, 'resources/data/poe2/exchange/exchange-ids.json'), 'utf8')).names as Record<string, string>
      )
    )
    const ru = readFileSync(path.join(ROOT, 'resources/data/poe2/ru/items.ndjson'), 'utf8')
    for (const r of [...list.main, ...list.common]) {
      expect(feed.has(r.name)).toBe(true)
      expect(ru.includes(`"refName": "${r.name}"`)).toBe(true)
      expect(r.tag).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('битый файл — null, дубли и мусор отброшены', () => {
    expect(parsePoe2CurrencyList(null)).toBeNull()
    expect(parsePoe2CurrencyList({ version: 2, main: [{ name: 'Divine Orb' }] })).toBeNull()
    const l = parsePoe2CurrencyList({
      version: 1,
      main: [{ name: 'Divine Orb', tag: 'BAD TAG' }, { name: 'Divine Orb' }],
      common: [{ name: 'Divine Orb' }, { name: 1 }, { name: 'Vaal Orb', tag: 'vaal' }]
    })!
    expect(l.main).toEqual([{ name: 'Divine Orb' }])
    expect(l.common).toEqual([{ name: 'Vaal Orb', tag: 'vaal' }])
  })
})

describe('источники', () => {
  it('ручной ввод: целые штуки, 0 убирает строку, время правки', () => {
    let s = setManual(emptySources(), 'Divine Orb', 3.4, T0)
    expect(s.manual).toEqual({ 'Divine Orb': 3 })
    expect(s.manualAt).toBe(T0)
    s = setManual(s, 'Divine Orb', -5, T0 + 1)
    expect(s.manual).toEqual({})
    expect(setManual(s, 'Divine Orb', 0, T0 + 2)).toBe(s)
    expect(setGold(s, 125_000.6, T0).gold).toBe(125_001)
  })

  it('ценный предмет из окна цены — недоверенный ввод проверяется', () => {
    expect(cleanValuableInput({ name: 'Mageblood', unit: 0 })).toBeNull()
    expect(cleanValuableInput({ name: '', unit: 5 })).toBeNull()
    expect(cleanValuableInput({ name: 'x'.repeat(500), unit: 5 })).toBeNull()
    expect(
      cleanValuableInput({ name: 'Headhunter', base: 'Leather Belt', kind: 'unique', unit: 12000.123, source: 'trade', qty: 0, evil: 1 })
    ).toEqual({
      name: 'Headhunter',
      base: 'Leather Belt',
      kind: 'unique',
      unit: 12000.12,
      source: 'trade',
      qty: 1
    })
  })

  it('файл источников: битое отброшено, лимиты', () => {
    const s = sanitizeSources({
      manual: { 'Divine Orb': 2, '': 5, 'Chaos Orb': 'x' },
      gold: -1,
      valuables: [
        { id: 'v1', name: 'Mageblood', unit: 1e5, source: 'trade', at: T0 },
        { id: 'v1', name: 'dup', unit: 1, at: T0 },
        { id: '../x', name: 'bad', unit: 1, at: T0 }
      ],
      screen: [
        {
          id: 'screen:poe2:stash:orbs',
          layout: 'orbs',
          at: T0,
          items: [
            { name: 'Divine Orb', qty: 3, sure: true },
            { name: 'X', qty: 0 }
          ]
        },
        { id: 'evil', at: T0 }
      ]
    })
    expect(s.manual).toEqual({ 'Divine Orb': 2 })
    expect(s.gold).toBe(0)
    expect(s.valuables.map((v) => v.id)).toEqual(['v1'])
    expect(s.screen).toEqual([
      { id: 'screen:poe2:stash:orbs', layout: 'orbs', at: T0, items: [{ name: 'Divine Orb', qty: 3, sure: true }] }
    ])
    expect(sanitizeSources('garbage')).toEqual(emptySources())
  })
})

describe('снимок вкладки: карточка и сеанс', () => {
  it('карточка: неузнанные — счётчиком, «проверьте» у неуверенных и уровней без раскладки', () => {
    const tab = screenCardTab(
      read([
        cell('Divine Orb', 2, { slot: 14 }),
        cell('Exalted Orb', 40, { countSure: false, slot: 24 }),
        cell(null, 3),
        cell('Chaos Orb', null, { slot: 1 }),
        cell('Regal Orb', 5, { present: false })
      ]),
      priceOf
    )
    expect(tab.id).toBe('screen:poe2:stash:orbs')
    expect(tab.unknown).toBe(1)
    expect(tab.lines.map((l) => [l.name, l.qty, needsCheck(l)])).toEqual([
      ['Divine Orb', 2, false],
      ['Chaos Orb', null, true],
      ['Exalted Orb', 40, true]
    ])
    // неуверенное число в итог карточки (и в снимок) не идёт, пока игрок не поправил или не нажал «верно»
    expect(cardTotal(tab)).toEqual({ ex: 1200, counted: 1, unpriced: 0, uncounted: 1, check: 1 })
    const ok = editCardLine(tab, 's24', { qty: 40 }, priceOf)
    expect(cardTotal(ok)).toMatchObject({ ex: 1240, counted: 2, check: 0 })
    expect(acceptSession(emptySources(), { startedAt: T0, tabs: [tab] }, T0).screen[0].items.map((i) => i.name)).toEqual(['Divine Orb'])
    expect(acceptSession(emptySources(), { startedAt: T0, tabs: [ok] }, T0).screen[0].items.map((i) => [i.name, i.qty])).toEqual([
      ['Divine Orb', 2],
      ['Exalted Orb', 40]
    ])
    const free = screenCardTab(read([cell('Greater Exalted Orb', 3, { alt: ['Exalted Orb', 'Perfect Exalted Orb'] })], null), priceOf)
    expect(free.lines[0].alt).toEqual(['Exalted Orb', 'Perfect Exalted Orb'])
    expect(needsCheck(free.lines[0])).toBe(true)
  })

  it('правка числа и выбор уровня — строка больше не «проверьте», цена пересчитана', () => {
    let tab = screenCardTab(read([cell('Exalted Orb', 40, { countSure: false, slot: 24 }), cell('Chaos Orb', null, { slot: 1 })]), priceOf)
    tab = editCardLine(tab, 's1', { qty: 12 }, priceOf)
    tab = editCardLine(tab, 's24', { qty: 41 }, priceOf)
    expect(tab.lines.every((l) => !needsCheck(l))).toBe(true)
    expect(cardTotal(tab).ex).toBe(12 * 70 + 41)
    let free = screenCardTab(read([cell('Greater Exalted Orb', 3, { alt: ['Exalted Orb', 'Perfect Exalted Orb'] })], null), priceOf)
    free = editCardLine(free, 'i0', { name: 'Perfect Exalted Orb' }, priceOf)
    expect(free.lines[0]).toMatchObject({ name: 'Perfect Exalted Orb', unit: 1900, alt: ['Greater Exalted Orb', 'Exalted Orb'] })
    // чужое имя не выбирается
    expect(editCardLine(free, 'i0', { name: 'Mirror of Kalandra' }, priceOf).lines[0].name).toBe('Perfect Exalted Orb')
  })

  it('сеанс: та же вкладка заменяется, «Переснять» убирает её, «Принять» складывает вкладки и заменяет принятые раньше', () => {
    const orbs1 = screenCardTab(read([cell('Divine Orb', 2, { slot: 14 })]), priceOf)
    const orbs2 = screenCardTab(read([cell('Divine Orb', 5, { slot: 14 })]), priceOf)
    const ess = screenCardTab(read([cell('Regal Orb', 10, { slot: 3 })], 'essence'), priceOf)
    let session = addToSession(null, orbs1, T0)
    session = addToSession(session, ess, T0 + 1)
    session = addToSession(session, orbs2, T0 + 2)
    expect(session.tabs.map((t) => t.id)).toEqual(['screen:poe2:stash:essence', 'screen:poe2:stash:orbs'])
    expect(session.startedAt).toBe(T0)
    expect(dropFromSession(session, 'screen:poe2:stash:orbs')!.tabs.length).toBe(1)
    expect(dropFromSession(session)).toBeNull()
    expect(dropFromSession(dropFromSession(session, 'screen:poe2:stash:orbs'), 'screen:poe2:stash:essence')).toBeNull()

    const before: Poe2Sources = {
      ...emptySources(),
      screen: [
        { id: 'screen:poe2:stash:orbs', layout: 'orbs', at: T0 - 5, items: [{ name: 'Divine Orb', qty: 1, sure: true }] },
        { id: 'screen:poe2:stash:delirium', layout: 'delirium', at: T0 - 5, items: [{ name: 'Liquid Paranoia', qty: 2, sure: true }] }
      ]
    }
    const after = acceptSession(before, session, T0 + 10)
    expect(after.screen.map((t) => [t.id, t.at])).toEqual([
      ['screen:poe2:stash:delirium', T0 - 5],
      ['screen:poe2:stash:essence', T0 + 10],
      ['screen:poe2:stash:orbs', T0 + 10]
    ])
    expect(after.screen.find((t) => t.layout === 'orbs')!.items).toEqual([{ name: 'Divine Orb', qty: 5, sure: true }])
  })
})

describe('один снимок из трёх источников', () => {
  it('ручной ввод + ценные предметы + вкладка с настоящего эталона → снимок, итоги источников', () => {
    const r = orbsRead()
    let session = addToSession(null, screenCardTab(r, priceOf), T0)
    // Exalted прочитано неуверенно — игрок поправил
    const exLine = session.tabs[0].lines.find((l) => l.name === 'Exalted Orb')!
    expect(needsCheck(exLine)).toBe(true)
    session = { ...session, tabs: [editCardLine(session.tabs[0], exLine.key, { qty: 2000 }, priceOf)] }
    // вкладка принята после ручного ввода div — предмет считается один раз: берём новее (вкладку)
    let s = setManual(emptySources(), 'Divine Orb', 3, T0 - 1000)
    s = acceptSession(s, session, T0)
    // chaos ввели после вкладки — из вкладки chaos не берётся
    s = setManual(s, 'Chaos Orb', 10, T0 + 1)
    s = setGold(s, 50_000, T0)
    s = addValuable(
      s,
      cleanValuableInput({ name: 'Headhunter', base: 'Leather Belt', kind: 'unique', unit: 9000, source: 'trade' })!,
      'v1',
      T0
    )

    const a = snap(s, 'a')
    expect(a.summary.base).toBe('exalted')
    expect(a.summary.divineRate).toBe(600)
    const divine = a.lines.find((l) => l.name === 'Divine Orb')!
    // 958 со снимка, ручные 3 перекрыты более новой вкладкой
    expect(divine.qty).toBe(958)
    expect(divine.total).toBe(958 * 600)
    const hh = a.lines.find((l) => l.key === 'VALUABLE|v1')!
    expect(hh).toMatchObject({ name: 'Headhunter', ns: 'UNIQUE', unit: 9000, source: 'pricecheck' })

    const totals = poe2Totals(s, a, T0 + 60_000)
    expect(totals.manual.ex).toBe(10 * 70)
    expect(totals.valuables).toMatchObject({ ex: 9000, count: 1, stale: false })
    expect(totals.screen.tabs).toBe(1)
    expect(totals.screen.ex).toBe(a.summary.tabs.find((t) => t.id.startsWith('screen:'))!.chaos)
    expect(round(totals.manual.ex + totals.valuables.ex + totals.screen.ex)).toBe(a.summary.chaos)
    expect(totals.approx).toBe(false)
    expect(poe2Totals(s, a, T0 + STALE_MS + 1).screen.stale).toBe(true)

    const rows = manualRows({ main: [{ name: 'Divine Orb', tag: 'divine' }], common: [{ name: 'Regal Orb' }] }, s, index)
    expect(rows.find((x) => x.name === 'Divine Orb')).toMatchObject({
      qty: 3,
      unit: 600,
      source: 'ange',
      inScreen: 958,
      group: 'main',
      covered: { layout: 'orbs', at: T0 }
    })
    // ввод новее вкладки — div из ввода, из вкладки div не берётся
    const later = setManual(s, 'Divine Orb', 5, T0 + 1)
    const b = snap(later, 'b')
    expect(b.lines.find((l) => l.name === 'Divine Orb')!.qty).toBe(5)
    expect(manualRows({ main: [{ name: 'Divine Orb' }], common: [] }, later, index)[0].covered).toBeUndefined()
    expect(rows.find((x) => x.name === 'Chaos Orb')).toMatchObject({ qty: 10, group: 'extra' })
    expect(rows.find((x) => x.name === 'Regal Orb')).toMatchObject({ qty: 0, inScreen: 137 })
  }, 30_000)

  it('разница двух снимков → прибыль сессии без дрейфа цен', () => {
    let s = setManual(emptySources(), 'Divine Orb', 2, T0)
    s = acceptSession(
      s,
      addToSession(null, screenCardTab(read([cell('Exalted Orb', 100, { slot: 24 }), cell('Regal Orb', 10, { slot: 16 })]), priceOf), T0),
      T0
    )
    const start = snap(s, 'a')
    // за сессию: +1 div вручную, ценный предмет, вкладка переснята (ex +50, regal −4), уник продан не был
    let e = setManual(s, 'Divine Orb', 3, T0 + 1)
    e = addValuable(e, { name: 'Astramentis', kind: 'unique', unit: 300, source: 'trade', qty: 1 }, 'v2', T0 + 1)
    e = acceptSession(
      e,
      addToSession(
        null,
        screenCardTab(read([cell('Exalted Orb', 150, { slot: 24 }), cell('Regal Orb', 6, { slot: 16 })]), priceOf),
        T0 + 1
      ),
      T0 + 1
    )
    const end = snap(e, 'b', T0 + 3_600_000)
    expect(qtyProfit(start, end)).toEqual({ chaos: 600 + 300 + 50 - 4 * 2.5, low: false })
    const d = diffSnapshots(start, end)
    expect(d.chaosDelta).toBe(600 + 300 + 50 - 10)
    expect(d.lines.map((l) => [l.key, l.qtyDelta])).toEqual([
      ['ITEM|Divine Orb', 1],
      ['VALUABLE|v2', 1],
      ['ITEM|Exalted Orb', 50],
      ['ITEM|Regal Orb', -4]
    ])
    // убрали ценный предмет (продан) — уходит из снимка
    const sold = snap(removeValuable(e, 'v2'), 'c', T0 + 7_200_000)
    expect(qtyProfit(end, sold).chaos).toBe(-300)
  })

  it('без цен — строки «цены не загружены», ценные предметы с ценой окна', () => {
    let s = setManual(emptySources(), 'Divine Orb', 2, T0)
    s = addValuable(s, { name: 'Doom Grip', base: 'Gold Ring', kind: 'rare', unit: 40, source: 'trade', qty: 1 }, 'v3', T0)
    const x = buildPoe2Snapshot({ id: 'z', at: T0, league: L, sources: s, index: poe2PriceIndex(() => null, 0), exPerDivine: 0 })
    expect(x.summary.chaos).toBe(40)
    expect(x.summary.divineRate).toBe(0)
    expect(x.lines.find((l) => l.name === 'Divine Orb')?.reason).toBe('no-source')
    expect(x.summary.tabs.map((t) => t.id)).toEqual([MANUAL_TAB, VALUABLES_TAB])
  })
})

const round = (n: number): number => Math.round(n * 100) / 100

describe('ревью S70', () => {
  it('выбор предмета из одинаковых по рисунку не подтверждает неуверенное число, и наоборот', () => {
    let tab = screenCardTab(read([cell('Greater Exalted Orb', 3, { alt: ['Exalted Orb'], countSure: false })], null), priceOf)
    tab = editCardLine(tab, 'i0', { name: 'Exalted Orb' }, priceOf)
    expect(tab.lines[0]).toMatchObject({ name: 'Exalted Orb', picked: true })
    expect(needsCheck(tab.lines[0])).toBe(true)
    tab = editCardLine(tab, 'i0', { qty: 3 }, priceOf)
    expect(needsCheck(tab.lines[0])).toBe(false)
    // «верно» у строки с уверенным числом, но не выбранным предметом — подтверждает выбор
    let sure = screenCardTab(read([cell('Greater Exalted Orb', 3, { alt: ['Exalted Orb'] })], null), priceOf)
    expect(needsCheck(sure.lines[0])).toBe(true)
    sure = editCardLine(sure, 'i0', { qty: 3, name: 'Greater Exalted Orb' }, priceOf)
    expect(needsCheck(sure.lines[0])).toBe(false)
  })

  it('обычные вкладки (без раскладки) — каждая своя, вторая не заменяет первую', () => {
    const a = screenCardTab({ ...read([cell('Divine Orb', 2, { slot: 1 })], null), at: T0 }, priceOf)
    const b = screenCardTab({ ...read([cell('Regal Orb', 5, { slot: 1 })], null), at: T0 + 1 }, priceOf)
    expect(a.id).not.toBe(b.id)
    let s = acceptSession(emptySources(), { startedAt: T0, tabs: [a] }, T0)
    s = acceptSession(s, { startedAt: T0, tabs: [b] }, T0 + 1)
    expect(s.screen).toHaveLength(2)
    // с раскладкой — та же вкладка заменяет прежнюю
    const o1 = screenCardTab(read([cell('Divine Orb', 2, { slot: 14 })]), priceOf)
    const o2 = screenCardTab({ ...read([cell('Divine Orb', 3, { slot: 14 })]), at: T0 + 5 }, priceOf)
    expect(o1.id).toBe(o2.id)
  })

  it('ручной ввод не растёт сверх предела строк', () => {
    let s = emptySources()
    for (let i = 0; i < 450; i++) s = setManual(s, `Orb ${i}`, 1, T0)
    expect(Object.keys(s.manual)).toHaveLength(400)
    // существующую строку править можно
    expect(setManual(s, 'Orb 1', 5, T0).manual['Orb 1']).toBe(5)
  })
})
