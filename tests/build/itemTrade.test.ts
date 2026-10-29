import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data } from '@shared/poe1/data'
import { localizeTradeRequest, type TradeRequest } from '@shared/poe1/pricecheck'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import { searchStateId, targetQuery } from '@shared/favorites/lot'
import { readPobItem, type PobItemInfo } from '@shared/build/pobItem'
import { itemSearch, lowMin, similarRareSearch, tradeCategory, type ItemSearch } from '@shared/build/itemTrade'
import { lifeCap, slotNeeds, speedCap } from '@shared/build/slotNeeds'
import { fixtureXml } from '../pob/fixtures'
import { store } from '../poe1/helpers'

// S40: кнопка «Трейд» (уник по имени; жёлтая/синяя — парсер и фильтры окна цены) и «что нужно от слота» (K3)
// + «похожая жёлтая» в формате PoB TradeQueryGenerator. Всё — только тело запроса: сеть здесь не трогаем.

let en: Poe1Data
let ru: Poe1Data
beforeAll(async () => {
  en = await store.ensureLanguage('en')
  ru = await store.ensureLanguage('ru')
})

const builds = new Map<string, PobBuild>()
function item(f: string, id: number): PobItemInfo {
  let b = builds.get(f)
  if (!b) {
    const r = parsePobXml(fixtureXml(f))
    if (!r.ok) throw new Error(f)
    b = r.build
    builds.set(f, b)
  }
  return readPobItem(b.items.find((i) => i.id === id)!.text)!
}
const stats = (f: string): PobBuild['stats'] => (builds.get(f) ?? (item(f, 1), builds.get(f)!)).stats

type Q = { query: Record<string, any> }
const q = (s: ItemSearch | null): Record<string, any> => (s!.body as Q).query
const enabledStats = (s: ItemSearch | null): Array<{ id: string; value?: { min?: number } }> =>
  (q(s).stats as Array<{ filters: Array<{ id: string; value?: { min?: number }; disabled?: boolean }> }>).flatMap((g) => g.filters).filter((f) => !f.disabled)

/** Запрос годится для адреса трейд-окна (…/search/<лига>/<состояние>), как у «Открыть лот». */
function opensInWindow(s: ItemSearch | null): boolean {
  return !!searchStateId(targetQuery({ query: s!.body as unknown as Record<string, unknown> }), (json) => new TextEncoder().encode(json))
}

describe('«Трейд»: уник — по имени', () => {
  it("Death's Oath: имя, база, только уники, без Foulborn", () => {
    const s = itemSearch(item('pobbin-death-oath-328', 17), en)
    expect(q(s)).toMatchObject({
      status: { option: 'available' },
      name: "Death's Oath",
      type: 'Astral Plate',
      filters: { type_filters: { filters: { rarity: { option: 'unique' } } }, misc_filters: { filters: { foulborn_item: { option: 'false' } } } }
    })
    expect(s!.lines[0]).toEqual({ kind: 'name', name: "Death's Oath" })
    expect(opensInWindow(s)).toBe(true)
  })
  it('уник с вариантами — моды выбранного варианта, чтобы не купить не тот', () => {
    const s = itemSearch(item('pobbin-leveling-ranges', 15), en)
    expect(s!.lines.some((l) => l.kind === 'stat' && l.ref === '#% increased Elemental Damage')).toBe(true)
    expect(enabledStats(s).length).toBeGreaterThan(0)
  })
  it('главная связка в униках: связи от 5', () => {
    const s = itemSearch(item('pobbin-leveling-ranges', 17), en, { links: 6 })
    expect(q(s).filters.socket_filters).toEqual({ filters: { links: { min: 6 } } })
  })
  it('Foulborn — отдельный фильтр', () => {
    expect(q(itemSearch(item('pobcodes-nightblade', 8), en)).filters.misc_filters.filters.foulborn_item).toEqual({ option: 'true' })
  })
  it('ru.pathofexile.com: имена переводятся (localizeTradeRequest)', () => {
    const s = itemSearch(item('pobbin-death-oath-328', 17), en)!
    const body = localizeTradeRequest(s.body as unknown as TradeRequest, ru)
    expect(body.query).toMatchObject({ name: 'Клятва смерти', type: 'Звёздные латы' })
  })
})

describe('«Трейд»: жёлтая и синяя — через окно цены', () => {
  it('редкое тело: тип по слоту, жизнь и сопротивления от ~80%, уровень персонажа', () => {
    const s = itemSearch(item('pobbin-leveling-ranges', 48), en, { level: 70 })
    const query = q(s)
    expect(query.filters.type_filters.filters.category).toEqual({ option: 'armour.chest' })
    expect(query.type).toBeUndefined()
    expect(query.filters.req_filters).toEqual({ filters: { lvl: { max: 70 } } })
    const refs = s!.lines.filter((l) => l.kind === 'stat').map((l) => (l.kind === 'stat' ? `${l.ref} ≥ ${l.min}` : ''))
    expect(refs).toEqual(expect.arrayContaining(['+# total maximum Life ≥ 52', '+#% total Elemental Resistance ≥ 46']))
    expect(opensInWindow(s)).toBe(true)
  })
  it('«дешевле»: только жизнь и сумма стихийных сопротивлений от ~70%', () => {
    const s = itemSearch(item('pobbin-leveling-ranges', 48), en, { mode: 'cheap' })
    const ids = enabledStats(s).map((f) => `${f.id}:${f.value?.min}`)
    expect(ids).toEqual(expect.arrayContaining(['pseudo.pseudo_total_life:52', 'pseudo.pseudo_total_elemental_resistance:40']))
    expect(ids.some((x) => x.startsWith('explicit.'))).toBe(false)
  })
  it('магические сапоги и кольцо из акта 1 — разбираются, свойства в поиске', () => {
    const boots = itemSearch(item('pobbin-acts-all-axes', 2), en, { level: 12 })
    expect(boots).not.toBeNull()
    expect(q(boots).filters.type_filters.filters.category).toEqual({ option: 'armour.boots' })
    const ring = itemSearch(item('pobbin-acts-all-axes', 14), en, { level: 12 })
    expect(ring!.lines.some((l) => l.kind === 'stat' && l.prop === 'res')).toBe(true)
  })
  it('белая вещь — по базе; флакон — по базе', () => {
    const plate = itemSearch(item('pobbin-acts-all-axes', 1), en)
    expect(q(plate).type).toBe('Plated Gauntlets')
    const flask = itemSearch(item('pobbin-death-oath-328', 11), en)
    expect(q(flask).type).toBe('Quicksilver Flask')
  })
  it('~80%: малые числа (уровни камней, заряды) — как есть', () => {
    expect(lowMin(65)).toBe(52)
    expect(lowMin(2)).toBe(2)
    expect(lowMin(-30)).toBe(-24)
    expect(lowMin(57, 0.7)).toBe(39)
  })
})

describe('«Что нужно от слота, пока уника нет» (K3, §2)', () => {
  it("Ryslatha's Coil (nightblade, ур. 97): сила — иначе 153 из 155; сопротивления с запасом — не нужны", () => {
    const n = slotNeeds({ info: item('pobcodes-nightblade', 6), kind: 'belt', level: 97, stats: stats('pobcodes-nightblade') })
    expect(n.exact).toBe(true)
    expect(n.needs.find((x) => x.id === 'res')).toBeUndefined()
    expect(n.needs.find((x) => x.id === 'attr')).toMatchObject({ attr: { str: 7 }, gap: { str: { have: 153, req: 155 } } })
    expect(n.needs.find((x) => x.id === 'life')?.value).toBe(89)
    expect(n.lose.join(' ')).toMatch(/more Maximum Physical Attack Damage/)
  })
  it("Starkonja's Head: ловкости хватает, жизнь — не больше, чем выпадает на уровне", () => {
    const n = slotNeeds({ info: item('pobcodes-nightblade', 17), kind: 'helmet', level: 97, stats: stats('pobcodes-nightblade') })
    expect(n.needs.find((x) => x.id === 'attr')).toBeUndefined()
    expect(n.needs.find((x) => x.id === 'life')?.value).toBe(90)
    const early = slotNeeds({ info: item('pobcodes-nightblade', 17), kind: 'helmet', level: 24, stats: null })
    expect(early.needs.find((x) => x.id === 'life')?.value).toBe(20)
    expect(early.exact).toBe(false)
  })
  it('без статов автора — «замените то, что давал уник»; обувь — скорость по уровню', () => {
    const n = slotNeeds({ info: item('pobbin-leveling-ranges', 19), kind: 'boots', level: 12, stats: null })
    expect(n.needs.find((x) => x.id === 'speed')?.value).toBe(10)
    const tr = slotNeeds({ info: item('pobbin-leveling-ranges', 17), kind: 'body', level: 20, stats: null, mainLinks: 4 })
    expect(tr.needs.find((x) => x.id === 'res')?.res).toEqual({ fire: 23, cold: 23, lightning: 23 })
    expect(tr.needs.find((x) => x.id === 'links')?.value).toBe(4)
    expect(tr.needs.length).toBeLessThanOrEqual(5)
  })
  it('пределы жизни и скорости по уровню', () => {
    expect([lifeCap(5), lifeCap(16), lifeCap(45), lifeCap(97)]).toEqual([10, 10, 40, 90])
    expect([speedCap(5), speedCap(20), speedCap(35), speedCap(50), speedCap(80)]).toEqual([10, 15, 20, 25, 30])
  })
  it('«Трейд: похожая жёлтая»: категория слота, «и» — нужды, «вес» — жизнь + сопротивления', () => {
    const coil = item('pobcodes-nightblade', 6)
    const needs = slotNeeds({ info: coil, kind: 'belt', level: 97, stats: stats('pobcodes-nightblade') })
    const s = similarRareSearch(coil, 'belt', needs, en, { level: 97 })
    const query = q(s)
    expect(query.filters.type_filters.filters).toEqual({ category: { option: 'accessory.belt' }, rarity: { option: 'nonunique' } })
    expect(query.stats[0]).toEqual({ type: 'and', filters: [{ id: 'pseudo.pseudo_total_strength', value: { min: 7 } }] })
    expect(query.stats[1]).toEqual({
      type: 'weight',
      value: { min: 89 },
      filters: [
        { id: 'pseudo.pseudo_total_life', value: { weight: 1 } },
        { id: 'pseudo.pseudo_total_elemental_resistance', value: { weight: 1 } }
      ]
    })
    expect(query.filters.req_filters).toEqual({ filters: { lvl: { max: 97 } } })
    expect(opensInWindow(s)).toBe(true)
  })
  it('похожая жёлтая для тела прокачки: сопротивления, связи', () => {
    const tr = item('pobbin-leveling-ranges', 17)
    const needs = slotNeeds({ info: tr, kind: 'body', level: 20, stats: null, mainLinks: 4 })
    const s = similarRareSearch(tr, 'body', needs, en, { level: 20 })
    expect(q(s).filters.socket_filters).toEqual({ filters: { links: { min: 4 } } })
    expect(enabledStats(s).map((f) => f.id)).toEqual(
      expect.arrayContaining(['pseudo.pseudo_total_fire_resistance', 'pseudo.pseudo_total_cold_resistance', 'pseudo.pseudo_total_lightning_resistance'])
    )
  })
  it('категория — по базе из данных APT, иначе по слоту', () => {
    expect(tradeCategory(null, 'ring')).toBe('accessory.ring')
    expect(tradeCategory(null, 'weapon')).toBe('weapon')
  })
})
