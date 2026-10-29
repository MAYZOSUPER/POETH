import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import { resolveStages } from '@shared/pob/stages'
import { parseTreeData } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import { cleanEdits } from '@shared/build/library'
import { buyFirst, disconnectedNodes, itemLabels, itemPrices, sameTreeVersion, type ItemLabel, type ItemPrice } from '@shared/build/keyItems'
import { KEY_UNIQUES } from '@shared/build/keyUniques'
import { itemGrantedSkills, stageItems, stageMainGroup, type StageItem } from '@shared/build/stageItems'
import { fixtureXml } from '../pob/fixtures'

// S40, K1/K2 (build-key-items.md §1, §3, §5): метки предметов этапа на настоящих кодах PoB и синтетике.

const tree = parseTreeData(JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1/build/tree.json'), 'utf8'))) as TreeData

function load(name: string): PobBuild {
  const r = parsePobXml(fixtureXml(name))
  if (!r.ok) throw new Error(name)
  return r.build
}

function labelsOf(b: PobBuild, stage = 0, opts: Parameters<typeof itemLabels>[4] = {}) {
  const plan = resolveStages(b)
  const items = stageItems(b, plan, stage)
  const labels = itemLabels(b, plan, stage, items, { tree, ...opts })
  const by = (name: string): { it: StageItem; l: ItemLabel } => {
    const it = items.find((x) => x.info.name === name)
    if (!it) throw new Error(`нет предмета ${name}`)
    return { it, l: labels.get(it.key)! }
  }
  return { plan, items, labels, by }
}

describe('предметы этапа', () => {
  it('набор этапа: слоты по порядку, флаконы, самоцветы дерева, гнездо Бездны; два одинаковых кольца — одна строка', () => {
    const b = load('pobbin-crit')
    const { items } = labelsOf(b)
    expect(items[0].slots).toEqual(['Weapon 1'])
    const rings = items.filter((x) => x.kind === 'ring')
    expect(rings).toHaveLength(1)
    expect(rings[0].slots).toEqual(['Ring 1', 'Ring 2'])
    expect(items.filter((x) => x.kind === 'flask')).toHaveLength(5)
    // самоцвет 24 стоит в трёх гнёздах дерева — одна строка, три гнезда
    expect(items.find((x) => x.kind === 'jewel' && x.itemId === 24)?.slots).toHaveLength(3)
    expect(items.find((x) => x.kind === 'abyss')?.slots).toEqual(['Belt Abyssal Socket 1'])
  })
  it('этапы по актам: у каждого свой набор', () => {
    const b = load('pobbin-acts-all-axes')
    const plan = resolveStages(b)
    const a1 = stageItems(b, plan, 0).map((x) => x.itemId)
    const a2 = stageItems(b, plan, 1).map((x) => x.itemId)
    expect(a1).not.toEqual(a2)
    expect(stageItems(b, plan, 0).find((x) => x.kind === 'weapon')?.info.name).toBe('Plague Stinger')
  })
  it('умения от предметов: только главная группа или группа полного DPS', () => {
    expect(itemGrantedSkills(load('pobbin-death-oath-328'))).toMatchObject([{ itemId: 17, name: "Death's Oath", main: true }])
    // Kaom's Spirit и Hyrri's Truth дают умения, но не главные
    expect(itemGrantedSkills(load('pobbin-huge'))).toEqual([])
  })
  it('главная связка этапа', () => {
    const b = load('pobcodes-nightblade')
    expect(stageMainGroup(b, resolveStages(b), 0)?.slot).toBe('Body Armour')
  })
})

describe('«Ключевой» — жёсткие правила', () => {
  it("Death's Oath даёт главное умение (source главной группы) — в обеих фикстурах", () => {
    for (const f of ['pobbin-death-oath-328', 'pobbin-three-trees']) {
      const { l } = labelsOf(load(f)).by("Death's Oath")
      expect(l.mark).toBe('key')
      expect(l.reason).toMatchObject({ id: 'source', gem: { nameSpec: 'Death Aura' } })
    }
  })
  it('пара Forbidden: обе — ключевые, с нотой восхождения', () => {
    const { by } = labelsOf(load('pobcodes-nightblade'))
    for (const n of ['Forbidden Flame', 'Forbidden Flesh']) expect(by(n).l).toMatchObject({ mark: 'key', reason: { id: 'forbidden', notable: 'Deathmarked' } })
  })
  it('главная связка в гнёздах уника с «Trigger a Socketed…» (Mjölner)', () => {
    const b = load('pobcodes-nightblade')
    const weapon = b.items.find((i) => i.id === 18)!
    weapon.text = ['Rarity: UNIQUE', 'Mjölner', 'Gavel', 'Sockets: B-B-B-B-B-B', 'Implicits: 0', 'Trigger a Socketed Lightning Spell on Hit, with a 0.25 second Cooldown', 'Socketed Lightning Spells have no Cost if Triggered'].join('\n')
    b.skillSets[0].groups[0].slot = 'Weapon 1'
    const { l } = labelsOf(b).by('Mjölner')
    expect(l).toMatchObject({ mark: 'key', reason: { id: 'trigger' } })
  })
  it('ноды без пути + Thread of Hope (дерево той же версии)', () => {
    const b = load('pobcodes-nightblade')
    const spec = b.specs[0]
    expect(sameTreeVersion(tree, spec.treeVersion)).toBe(true)
    expect(disconnectedNodes(tree, spec.classId, spec.nodes)).toEqual([])
    // нота далеко от взятых нод — без пути к ней
    const taken = new Set(spec.nodes)
    const far = [...tree.nodes.values()].find((n) => n.kind === 'notable' && !n.asc && !taken.has(n.hash) && n.links.every((x) => !taken.has(x)))!
    spec.nodes.push(far.hash)
    b.items.push({ id: 999, text: 'Rarity: UNIQUE\nThread of Hope\nCrimson Jewel\nRadius: Variable\nImplicits: 0\nOnly affects Passives in Medium Ring\n-15% to all Elemental Resistances' })
    spec.sockets.push({ nodeId: spec.sockets[0].nodeId + 1, itemId: 999 })
    const { l } = labelsOf(b).by('Thread of Hope')
    expect(l).toMatchObject({ mark: 'key', reason: { id: 'no-path', nodes: [far.hash] } })
  })
  it('старое дерево (другая версия) — «ноды без пути» не считаем', () => {
    expect(sameTreeVersion(tree, '3_23')).toBe(false)
    const { l } = labelsOf(load('pobbin-huge'), 2).by('Thread of Hope')
    expect(l.mark).toBe('important') // свой список, но не «ключевой»
  })
})

describe('«Важный», «Цель·люкс», «Для прокачки»', () => {
  it('Winter Orb: Void Battery и Badge — с бюджетного набора до последнего (+ список)', () => {
    const b = load('pobbin-leveling-ranges')
    const plan = resolveStages(b)
    const last = plan.stages.length - 1
    const { by } = labelsOf(b, last)
    expect(by('Void Battery').l).toMatchObject({ mark: 'important', reason: { id: 'stages' } })
    expect(by('Badge of the Brotherhood').l.mark).toBe('important')
  })
  it('Axiom Perpetuum — только в наборах прокачки, до уровня следующего этапа', () => {
    const { by } = labelsOf(load('pobbin-leveling-ranges'), 0)
    expect(by('Axiom Perpetuum').l).toMatchObject({ mark: 'leveling', reason: { id: 'leveling-sets', until: 78 } })
  })
  it('свой список: scaler — важный, luxury — цель·люкс, leveling — для прокачки', () => {
    const { by } = labelsOf(load('pobcodes-nightblade'))
    expect(by('Ashes of the Stars').l).toMatchObject({ mark: 'important', reason: { id: 'list', tag: 'scaler' } })
    expect(by('Bottled Faith').l).toMatchObject({ mark: 'luxury', reason: { id: 'list', tag: 'luxury' } })
    expect(labelsOf(load('pobbin-acts-level-gems')).by('Goldrim').l).toMatchObject({ mark: 'leveling', reason: { id: 'list', tag: 'leveling' } })
  })
  it('заметки автора «need» рядом с именем — важный', () => {
    const { by } = labelsOf(load('poedb-deadeye'))
    expect(by("Warrior's Tale").l).toMatchObject({ mark: 'important', reason: { id: 'notes' } })
  })
  it('варианты билда (AG/zealotry, sanctum) — не этапы: сигнал «с бюджетного до конца» выключен', () => {
    const { by } = labelsOf(load('pobbin-two-variants'))
    expect(by('Heatshiver').l.mark).toBe(null)
    expect(by('Hrimsorrow').l).toMatchObject({ mark: 'important', reason: { id: 'list', tag: 'mechanic' } })
  })
  it('тир T0 без жёсткого правила — цель·люкс', () => {
    const prices = new Map<string, ItemPrice>([["Ming's Heart", { tier: 'T0', chaos: 3000, div: 15 }]])
    expect(labelsOf(load('pobcodes-nightblade'), 0, { prices }).by("Ming's Heart").l).toMatchObject({ mark: 'luxury', reason: { id: 'price' } })
  })
  it('редкие и магические без правил — без метки', () => {
    const { items, labels } = labelsOf(load('pobbin-leveling-ranges'), 6)
    for (const it of items.filter((x) => x.info.rarity !== 'unique')) expect(labels.get(it.key)?.mark).toBe(null)
  })
})

describe('ручная метка игрока', () => {
  it('снять автоматическую «ключевой» и отметить свою', () => {
    const b = load('pobbin-death-oath-328')
    const { by } = labelsOf(b, 0, { marks: { "u:Death's Oath": false, 'i:23': true } })
    expect(by("Death's Oath").l).toMatchObject({ mark: null, auto: 'key', manual: false })
    expect(by('Blight Guardian').l).toMatchObject({ mark: 'key', reason: { id: 'manual' }, auto: null, manual: true })
  })
  it('cleanEdits: метки — только u:имя / i:id → boolean', () => {
    const e = cleanEdits({
      current: 'spec:1',
      marks: { "u:Death's Oath": false, 'i:23': true, 'i:x': true, 'u:': true, 'u:Bad\u0007': true, 'i:5': 'yes', __proto__: true, other: true }
    })
    expect(e).toEqual({ current: 'spec:1', marks: { "u:Death's Oath": false, 'i:23': true } })
    expect(cleanEdits({ marks: [] })).toEqual({})
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`i:${i}`, true]))
    expect(Object.keys(cleanEdits({ marks: many }).marks ?? {})).toHaveLength(200)
  })
})

describe('«Купить первым» (§3)', () => {
  it('без цен: ключевые, затем важные, по слотам; только по уровню этапа', () => {
    const b = load('pobcodes-nightblade')
    const { items, labels } = labelsOf(b)
    const rows = buyFirst(items, labels, 97)
    const name = (k: string): string => items.find((x) => x.key === k)!.info.name
    expect(rows.filter((r) => r.group === 'key').map((r) => name(r.key)).sort()).toEqual(['Forbidden Flame', 'Forbidden Flesh'])
    expect(rows.filter((r) => r.group === 'important').map((r) => name(r.key))).toEqual(expect.arrayContaining(['Ashes of the Stars', "Ryslatha's Coil"]))
    expect(rows.findIndex((r) => r.group === 'important')).toBeGreaterThan(rows.findIndex((r) => r.group === 'key'))
    // на 20 уровне Ashes of the Stars (60) и Forbidden (83) не надеть
    expect(buyFirst(items, labels, 20).map((r) => name(r.key))).not.toContain('Ashes of the Stars')
  })
  it('с ценами: ключевой дешёвый → важный → ключевой T0 «копить»', () => {
    const b = load('pobcodes-nightblade')
    const prices = new Map<string, ItemPrice>([
      ['Forbidden Flame', { tier: 'T0', chaos: 5000, div: 25 }],
      ['Forbidden Flesh', { tier: 'T2', chaos: 30, div: 0.15 }],
      ['Ashes of the Stars', { tier: 'T1', chaos: 400, div: 2 }]
    ])
    const { items, labels } = labelsOf(b, 0, { prices })
    const rows = buyFirst(items, labels, 97, prices)
    const name = (k: string): string => items.find((x) => x.key === k)!.info.name
    expect(rows.map((r) => `${r.group}:${name(r.key)}`)).toEqual(['key:Forbidden Flesh', "important:Ryslatha's Coil", 'important:Ashes of the Stars', 'save:Forbidden Flame'])
  })
  it('цены из снимка S33: обычная форма, без Foulborn и связей, самая дешёвая', () => {
    const p = itemPrices([
      { name: 'Tabula Rasa', foulborn: false, chaos: 10, div: 0.05, tier: 'low' },
      { name: 'Tabula Rasa', foulborn: true, chaos: 1, div: 0.005, tier: 'low' },
      { name: 'Tabula Rasa', foulborn: false, links: 6, chaos: 2, div: 0.01, tier: 'low' },
      { name: "Aul's Uprising", foulborn: false, chaos: 500, div: 2.5, tier: 'T1' },
      { name: "Aul's Uprising", foulborn: false, chaos: 50, div: 0.25, tier: 'T2' }
    ])
    expect(p.get('Tabula Rasa')).toEqual({ tier: 'low', chaos: 10, div: 0.05 })
    expect(p.get("Aul's Uprising")?.tier).toBe('T2')
  })
})

describe('свой список уников (K2)', () => {
  it('около сорока популярных, у каждого — тег и причины RU и EN', () => {
    const names = Object.keys(KEY_UNIQUES)
    expect(names.length).toBeGreaterThanOrEqual(40)
    for (const n of names) {
      const u = KEY_UNIQUES[n]
      expect(u.ru.length).toBeGreaterThan(5)
      expect(u.en.length).toBeGreaterThan(5)
      expect(/[а-яё]/i.test(u.en)).toBe(false)
      if (u.tag === 'skill-source') expect(u.skills?.length).toBeGreaterThan(0)
    }
  })
})
