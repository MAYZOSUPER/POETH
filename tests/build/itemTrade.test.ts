import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data } from '@shared/poe1/data'
import { localizeTradeRequest, type TradeRequest } from '@shared/poe1/pricecheck'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import { searchStateId, targetQuery } from '@shared/favorites/lot'
import { readPobItem, type PobItemInfo } from '@shared/build/pobItem'
import { itemSearch, lowMin, similarRareSearch, tradeCategory, type ItemSearch } from '@shared/build/itemTrade'
import { lifeCap, resSumCap, slotNeeds, speedCap } from '@shared/build/slotNeeds'
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
  it('уник с вариантами-версиями («Pre 2.3.0» → «Current») — только по имени (иначе сайт находит 0)', () => {
    const s = itemSearch(item('pobbin-leveling-ranges', 15), en)
    expect(enabledStats(s)).toEqual([])
  })
  it('уник с вариантами-выбором — строки выбранного варианта (имплицит — как имплицит)', () => {
    const aul = readPobItem(
      [
        'Rarity: UNIQUE',
        "Aul's Uprising",
        'Onyx Amulet',
        'Variant: Anger',
        'Variant: Hatred',
        'Variant: Envy',
        'Selected Variant: 3',
        'Implicits: 1',
        '{range:0.5}+(10-16) to all Attributes',
        '{range:0.5}+(15-25) to all Attributes',
        '{variant:1}Anger has no Reservation',
        '{variant:2}Hatred has no Reservation',
        '{variant:3}Grants Level 15 Envy Skill',
        '{variant:3}Envy has no Reservation'
      ].join('\n')
    )!
    expect(aul.explicits.filter((m) => m.variant).map((m) => m.text)).toEqual(['Grants Level 15 Envy Skill', 'Envy has no Reservation'])
    const s = itemSearch(aul, en)
    expect(enabledStats(s).map((f) => f.id)).toHaveLength(2)
    expect(enabledStats(s).every((f) => f.id.startsWith('explicit.'))).toBe(true)
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
  it('без статов автора — сумма сопротивлений уника, но не больше, чем найти на уровне; обувь — скорость по уровню', () => {
    const n = slotNeeds({ info: item('pobbin-leveling-ranges', 19), kind: 'boots', level: 12, stats: null })
    expect(n.needs.find((x) => x.id === 'speed')?.value).toBe(10)
    const tr = slotNeeds({ info: item('pobbin-leveling-ranges', 17), kind: 'body', level: 20, stats: null, mainLinks: 4 })
    expect(tr.needs.find((x) => x.id === 'res')).toMatchObject({ sum: true, value: 30 }) // 23 × 3 = 69, на 20 ур. — до 30
    expect(tr.needs.find((x) => x.id === 'links')?.value).toBe(4)
    expect(tr.needs.length).toBeLessThanOrEqual(5)
    // Goldrim (+35% ко всем) на 20 ур.: не «по 35 к каждой», а «в сумме от 30»
    expect(slotNeeds({ info: item('pobbin-leveling-ranges', 16), kind: 'helmet', level: 20, stats: null }).needs[0]).toMatchObject({ id: 'res', sum: true, value: 30 })
  })
  it('оружие: урон чар или атак как у уника; во второй руке без щита — без «жизни»', () => {
    const axiom = slotNeeds({ info: item('pobbin-leveling-ranges', 15), kind: 'offhand', level: 20, stats: null })
    expect(axiom.needs.map((x) => x.id)).toEqual(['dmg'])
    expect(axiom.needs[0].dmg).toBe('spell')
  })
  it('пределы жизни, сопротивлений и скорости по уровню', () => {
    expect([lifeCap(5), lifeCap(16), lifeCap(45), lifeCap(97)]).toEqual([10, 10, 40, 90])
    expect([resSumCap(10), resSumCap(20), resSumCap(40), resSumCap(50), resSumCap(80)]).toEqual([15, 30, 50, 70, 90])
    expect([speedCap(5), speedCap(20), speedCap(35), speedCap(50), speedCap(80)]).toEqual([10, 15, 20, 25, 30])
  })
  it('«Трейд: похожая жёлтая»: категория слота, «и» — нужды, «вес» — жизнь + сопротивления', () => {
    const coil = item('pobcodes-nightblade', 6)
    const needs = slotNeeds({ info: coil, kind: 'belt', level: 97, stats: stats('pobcodes-nightblade') })
    const s = similarRareSearch(coil, 'belt', needs, en, { level: 97 })
    const query = q(s)
    expect(query.filters.type_filters.filters).toEqual({ category: { option: 'accessory.belt' }, rarity: { option: 'nonunique' } })
    // одна группа «и»: группу «вес» сайт без входа отвергает («Query is too complex»)
    expect(query.stats).toEqual([
      {
        type: 'and',
        filters: [
          { id: 'pseudo.pseudo_total_strength', value: { min: 7 } },
          { id: 'pseudo.pseudo_total_life', value: { min: 89 } }
        ]
      }
    ])
    expect(query.filters.req_filters).toEqual({ filters: { lvl: { max: 97 } } })
    expect(opensInWindow(s)).toBe(true)
  })
  it('похожая жёлтая для тела прокачки: связи, сумма сопротивлений, жизнь (статов автора для этапа нет)', () => {
    const tr = item('pobbin-leveling-ranges', 17)
    const needs = slotNeeds({ info: tr, kind: 'body', level: 20, stats: null, mainLinks: 4 })
    const s = similarRareSearch(tr, 'body', needs, en, { level: 20 })
    expect(q(s).filters.socket_filters).toEqual({ filters: { links: { min: 4 } } })
    expect(q(s).stats).toEqual([
      {
        type: 'and',
        filters: [
          { id: 'pseudo.pseudo_total_elemental_resistance', value: { min: 30 } },
          { id: 'pseudo.pseudo_total_life', value: { min: 20 } }
        ]
      }
    ])
  })
  it('категория — по базе из данных APT, иначе по слоту', () => {
    expect(tradeCategory(null, 'ring')).toBe('accessory.ring')
    expect(tradeCategory(null, 'weapon')).toBe('weapon')
  })
})
