import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import {
  bestOption,
  compareEquip,
  emptyNumbers,
  equipItem,
  equipKind,
  equipReq,
  equipTargets,
  lineStat,
  numbersFromLines,
  sameItem,
  saveSlots,
  shownRows,
  totalsFromMine,
  totalsFromStats,
  type EquipTotals
} from '@shared/build/equipCompare'
import type { EquipEntry, EquipItem, EquipKind, EquipNumbers, EquipSlot } from '@shared/types/equip'
import { guideItem, guideVerdict } from '@shared/build/equipCompareGuide'
import { readPobItem } from '@shared/build/pobItem'
import { stageItems } from '@shared/build/stageItems'
import { parsePobXml } from '@shared/pob/model'
import { resolveStages } from '@shared/pob/stages'
import { fixtureXml } from '../pob/fixtures'
import { fixtureNames, readFixture, store } from '../poe1/helpers'

// S41: «Против надетого» — числа вещи из распознанного предмета (RU = EN), правила слотов §7.2, вердикт §7.3.

let en: Poe1Data
let ru: Poe1Data
beforeAll(async () => {
  en = await store.ensureLanguage('en')
  ru = await store.ensureLanguage('ru')
})

function parsed(lang: 'en' | 'ru', name: string): ParsedItem {
  const r = parseItem(readFixture(lang, name), lang === 'en' ? en : ru)
  if (!r.ok) throw new Error(`${lang}/${name}: ${r.error}`)
  return r.value
}

type NumIn = Partial<Omit<EquipNumbers, 'res' | 'attr'>> & { res?: Partial<EquipNumbers['res']>; attr?: Partial<EquipNumbers['attr']> }
function nums(p: NumIn = {}): EquipNumbers {
  const e = emptyNumbers()
  return { ...e, ...p, res: { ...e.res, ...p.res }, attr: { ...e.attr, ...p.attr } }
}
function item(kind: EquipKind, n: NumIn = {}, extra: Partial<EquipItem> = {}): EquipItem {
  return { kind, rarity: 'rare', name: null, base: 'Test Base', n: nums(n), req: { level: 0, str: 0, dex: 0, int: 0 }, flask: null, ...extra }
}
function worn(slot: EquipSlot, kind: EquipKind, n: NumIn = {}, extra: Partial<EquipItem> = {}): EquipEntry {
  return { ...item(kind, n, extra), slot, at: 1000 }
}
const totals = (res: EquipTotals['res'], extra: Partial<EquipTotals> = {}): EquipTotals => ({ source: 'mine', res, cap: {}, attr: {}, need: {}, ...extra })

describe('числа вещи: RU и EN клиент', () => {
  it('у каждой пары фикстур RU/EN одна и та же вещь (вид, база, числа, требования, флакон)', () => {
    let n = 0
    for (const name of fixtureNames('en')) {
      if (!fixtureNames('ru').includes(name)) continue
      const a = parseItem(readFixture('en', name), en)
      const b = parseItem(readFixture('ru', name), ru)
      if (!a.ok || !b.ok) continue
      const x = equipItem(a.value)
      const y = equipItem(b.value)
      expect(y, name).toEqual(x)
      if (x) n++
    }
    expect(n).toBeGreaterThan(40)
  })

  it('обувь: жизнь, скорость, сопротивления, требования', () => {
    const boots = equipItem(parsed('ru', 'rare-boots'))!
    expect(boots.kind).toBe('boots')
    expect(boots.base).toBe('Slink Boots')
    expect(boots.name).toBeNull()
    expect(boots.n).toMatchObject({ life: 81, speed: 30, res: { fire: 43, cold: 0, lightning: 28, chaos: 0 } })
    expect(boots.req).toEqual({ level: 69, str: 0, dex: 120, int: 0 })
  })

  it('оружие: DPS из свойств, локальные моды не считаются «уроном без PoB»', () => {
    const mace = equipItem(parsed('en', 'adv-weapon'))!
    expect(mace.kind).toBe('weapon1h')
    expect(mace.n.pdps).toBeCloseTo(83.9, 1)
    expect(mace.n.attr.str).toBe(35)
    expect(mace.n.dmg).toBe(0)
    expect(mace.req).toEqual({ level: 51, str: 83, dex: 0, int: 0 })
    const wand = equipItem(parsed('ru', 'rare-wand'))!
    expect(wand.n.caster).toBe(true)
    expect(wand.n.dmg).toBeGreaterThan(0)
  })

  it('броня: ЭЩ — свойство вещи (локальный мод второй раз не складывается)', () => {
    const helm = equipItem(parsed('ru', 'rare-helmet'))!
    expect(helm.n.es).toBe(134)
    expect(helm.n.life).toBe(65)
  })

  it('флакон: вид, восстановление, длительность, заряды', () => {
    const mana = equipItem(parsed('ru', 'flask-01'))!
    expect(mana.flask).toEqual({ type: 'mana', life: 0, mana: 924, duration: 4.6, use: 7, charges: 35, quality: 20 })
    const topaz = equipItem(parsed('en', 'flask-03'))!
    expect(topaz.flask).toMatchObject({ type: 'utility', duration: 8, use: 20, charges: 50 })
  })

  it('самоцвет: % к жизни; кластерный — «сложный»; уник — с EN-именем', () => {
    expect(equipItem(parsed('en', 'rare-jewel'))!.n.lifePct).toBe(7)
    expect(equipItem(parsed('ru', 'adv-cluster'))!.kind).toBe('complex')
    const u = equipItem(parsed('ru', 'unique-01'))!
    expect(u).toMatchObject({ kind: 'amulet', rarity: 'unique', name: 'Sidhebreath', base: 'Paua Amulet' })
  })

  it('не экипировка — null (валюта, карты, камни)', () => {
    for (const name of ['card-01', 'gem-01', 'map-01', 'manual-currency-01']) expect(equipItem(parsed('en', name)), name).toBeNull()
  })

  it('уникальный самоцвет — «сложный»', () => {
    expect(equipKind({ category: 'Jewel' as ParsedItem['category'], rarity: 'Unique' as ParsedItem['rarity'] })).toBe('complex')
  })

  it('требования: «Strength: N», RU-сокращения, без секции — нули', () => {
    expect(equipReq('Item Class: X\n--------\nRequirements:\nLevel: 60\nStrength: 152\nInt: 40 (unmet)\n--------\nItem Level: 1')).toEqual({ level: 60, str: 152, dex: 0, int: 40 })
    expect(equipReq('Класс предмета: X\n--------\nТребования:\nУровень: 33\nЛовк: 50\nИнт: 12\n--------')).toEqual({ level: 33, str: 0, dex: 50, int: 12 })
    expect(equipReq('Item Class: X\n--------\nItem Level: 1')).toEqual({ level: 0, str: 0, dex: 0, int: 0 })
  })

  it('пары RU/EN дают одинаковые дельты', () => {
    const wornEn = { ...equipItem(parsed('en', 'rare-ring'))!, slot: 'Ring 1' as EquipSlot, at: 1 }
    const wornRu = { ...equipItem(parsed('ru', 'rare-ring'))!, slot: 'Ring 1' as EquipSlot, at: 1 }
    const t = totals({ fire: 80, cold: 60, lightning: 75 })
    const a = compareEquip(equipItem(parsed('en', 'adv-ring'))!, [wornEn], t, 70)
    const b = compareEquip(equipItem(parsed('ru', 'adv-ring'))!, [wornRu], t, 70)
    expect(b).toEqual(a)
    expect(a.rows.find((r) => r.id === 'life')).toMatchObject({ before: 0, after: 88, delta: 88 })
  })

  it('строки PoB (EN) → те же ref, что у парсера', () => {
    expect(lineStat('+81 to maximum Life')).toEqual({ ref: '+# to maximum Life', value: 81 })
    expect(lineStat('-10% to Cold Resistance')).toEqual({ ref: '+#% to Cold Resistance', value: -10 })
    expect(lineStat('10% reduced Movement Speed')).toEqual({ ref: '#% increased Movement Speed', value: -10 })
    const n = numbersFromLines(['+40 to maximum Life', '+12% to all Elemental Resistances', '+20 to Strength and Dexterity', '15% increased Spell Damage'], 'ring')
    expect(n).toMatchObject({ life: 40, res: { fire: 12, cold: 12, lightning: 12, chaos: 0 }, attr: { str: 20, dex: 20, int: 0 }, dmg: 1 })
  })
})

describe('слоты: с чем сравнивать', () => {
  const r1 = worn('Ring 1', 'ring', { life: 30, res: { fire: 40 } })
  const r2 = worn('Ring 2', 'ring', { life: 12, res: { lightning: 10 } })

  it('кольца: против каждого, по умолчанию — где выгоднее', () => {
    const nw = item('ring', { life: 45, res: { lightning: 28, cold: 20 } })
    const tg = equipTargets(nw, [r1, r2])
    expect(tg.options.map((o) => o.slots)).toEqual([['Ring 1'], ['Ring 2']])
    const t = totals({ fire: 80, cold: 75, lightning: 49 })
    const res = tg.options.map((o) => compareEquip(nw, o.entries, t, null))
    expect(res[0].verdict).toBe('mixed') // огонь держит кольцо 1
    expect(res[1].verdict).toBe('better')
    expect(bestOption(res)).toBe(1)
  })

  it('кольцо, одно запомнено — сравнение с ним, второй слот — «не запомнен»', () => {
    const tg = equipTargets(item('ring'), [r1])
    expect(tg.options.map((o) => o.slots)).toEqual([['Ring 1']])
    expect(tg.missing).toEqual(['Ring 2'])
  })

  it('двуручное — против пары «оружие + щит»', () => {
    const wand = worn('Weapon 1', 'weapon1h', { pdps: 18, caster: true }, { req: { level: 0, str: 0, dex: 0, int: 0 } })
    const shield = worn('Weapon 2', 'shield', { es: 56, block: 24, res: { cold: 20 } })
    const staff = item('weapon2h', { pdps: 41, res: { fire: 18 }, caster: true })
    const tg = equipTargets(staff, [wand, shield])
    expect(tg.note).toBe('twoHand')
    expect(tg.options).toHaveLength(1)
    expect(tg.options[0].slots).toEqual(['Weapon 1', 'Weapon 2'])
    const cmp = compareEquip(staff, tg.options[0].entries, totals({ fire: 90, cold: 78, lightning: 75 }), null)
    const res = cmp.rows.find((r) => r.id === 'res')!
    expect(res.res!.find((c) => c.el === 'cold')).toMatchObject({ before: 75, after: 58, belowCap: true })
    expect(cmp.rows.find((r) => r.id === 'es')).toMatchObject({ before: 56, after: 0 })
    expect(cmp.rows.find((r) => r.id === 'block')).toMatchObject({ before: 24, after: 0 })
    // DPS у оружия чар в вердикт не идёт
    expect(cmp.rows.find((r) => r.id === 'dps')!.caster).toBe(true)
    expect(cmp.verdict).toBe('worse')
  })

  it('лук с колчаном — только против оружия; одноручное при двуручном — против двуручного', () => {
    const bow = worn('Weapon 1', 'bow', { pdps: 100 })
    const quiver = worn('Weapon 2', 'quiver', { life: 50 })
    const tg = equipTargets(item('bow', { pdps: 120 }), [bow, quiver])
    expect(tg.options[0].slots).toEqual(['Weapon 1'])
    expect(tg.note).toBeUndefined()
    const two = worn('Weapon 1', 'weapon2h', { pdps: 200 })
    expect(equipTargets(item('weapon1h'), [two]).options[0].entries).toEqual([two])
    expect(equipTargets(item('shield'), [two]).note).toBe('shieldWith2h')
    expect(equipTargets(item('quiver'), [two]).note).toBe('quiverNoBow')
  })

  it('два одноручных — выбор руки', () => {
    const a = worn('Weapon 1', 'weapon1h', { pdps: 100 })
    const b = worn('Weapon 2', 'weapon1h', { pdps: 80 })
    expect(equipTargets(item('weapon1h', { pdps: 90 }), [a, b]).options.map((o) => o.slots[0])).toEqual(['Weapon 1', 'Weapon 2'])
  })

  it('самоцвет — против надетых того же вида, по умолчанию худший', () => {
    const j1 = worn('Jewel 1', 'jewel', { lifePct: 7, res: { cold: 12 } })
    const j2 = worn('Jewel 2', 'jewel', { lifePct: 4 })
    const ab = worn('Jewel 3', 'abyss', { life: 40 })
    const nw = item('jewel', { lifePct: 6, res: { fire: 10 } })
    const tg = equipTargets(nw, [j1, j2, ab])
    expect(tg.options.map((o) => o.slots[0])).toEqual(['Jewel 1', 'Jewel 2'])
    const res = tg.options.map((o) => compareEquip(nw, o.entries, null, null))
    expect(res[1].verdict).toBe('better')
    expect(bestOption(res)).toBe(1)
    expect(equipTargets(item('complex'), [j1]).options).toEqual([])
  })

  it('флакон — против того же вида; особый — только той же базы', () => {
    const life = worn('Flask 1', 'flask', {}, { base: 'Divine Life Flask', flask: { type: 'life', life: 2400, mana: 0, duration: 3, use: 15, charges: 45, quality: 0 } })
    const qs = worn('Flask 2', 'flask', {}, { base: 'Quicksilver Flask', flask: { type: 'utility', life: 0, mana: 0, duration: 4, use: 30, charges: 50, quality: 0 } })
    const nwLife = item('flask', {}, { base: 'Eternal Life Flask', flask: { type: 'life', life: 3120, mana: 0, duration: 3, use: 15, charges: 45, quality: 0 } })
    const tg = equipTargets(nwLife, [life, qs])
    expect(tg.options.map((o) => o.slots)).toEqual([['Flask 1']])
    const cmp = compareEquip(nwLife, tg.options[0].entries, null, null)
    expect(cmp.rows.find((r) => r.id === 'flask')).toMatchObject({ before: 2400, after: 3120, delta: 720 })
    expect(cmp.verdict).toBe('better')
    const granite = item('flask', {}, { base: 'Granite Flask', flask: { type: 'utility', life: 0, mana: 0, duration: 5, use: 30, charges: 60, quality: 0 } })
    expect(equipTargets(granite, [life, qs]).options).toEqual([])
    const qs2 = item('flask', {}, { base: 'Quicksilver Flask', flask: { type: 'utility', life: 0, mana: 0, duration: 6, use: 30, charges: 50, quality: 20 } })
    expect(compareEquip(qs2, [qs], null, null).verdict).toBe('better')
  })

  it('куда запомнить: кольца и руки — выбор, самоцвет — запомненные того же вида и новое гнездо', () => {
    expect(saveSlots(item('ring'), [])).toEqual(['Ring 1', 'Ring 2'])
    expect(saveSlots(item('weapon1h'), [])).toEqual(['Weapon 1', 'Weapon 2'])
    expect(saveSlots(item('weapon2h'), [])).toEqual(['Weapon 1'])
    expect(saveSlots(item('shield'), [])).toEqual(['Weapon 2'])
    expect(saveSlots(item('flask'), [])).toHaveLength(5)
    expect(saveSlots(item('complex'), [])).toEqual([])
    const j1 = worn('Jewel 1', 'jewel')
    const ab = worn('Jewel 2', 'abyss')
    expect(saveSlots(item('jewel'), [j1, ab])).toEqual(['Jewel 1', 'Jewel 3'])
    expect(saveSlots(item('abyss'), [j1, ab])).toEqual(['Jewel 2', 'Jewel 3'])
  })
})

describe('кап сопротивлений и требования', () => {
  const helm = worn('Helmet', 'helmet', { life: 40, res: { fire: 30 } })

  it('переход через кап: было на капе, стало ниже — потеря первого приоритета', () => {
    const nw = item('helmet', { life: 40, res: { fire: 5 } })
    const cmp = compareEquip(nw, [helm], totals({ fire: 85 }), null)
    const cell = cmp.rows.find((r) => r.id === 'res')!.res![0]
    expect(cell).toMatchObject({ el: 'fire', before: 75, after: 60, delta: -15, belowCap: true })
    expect(cmp.rows[0].tier).toBe(1)
    expect(cmp.verdict).toBe('worse')
    expect(cmp.loss).toMatchObject({ row: 'res', el: 'fire', cap: true })
  })

  it('запас над капом гасит потерю: «так же»', () => {
    const nw = item('helmet', { life: 40, res: { fire: 20 } })
    const cmp = compareEquip(nw, [helm], totals({ fire: 95 }), null)
    expect(cmp.rows.find((r) => r.id === 'res')!.res![0]).toMatchObject({ before: 75, after: 75, overcap: true })
    expect(cmp.verdict).toBe('same')
  })

  it('до капа: прибавка ниже капа — выгода, дошёл до капа — помечено', () => {
    const nw = item('helmet', { life: 40, res: { fire: 30, cold: 30 } })
    const cmp = compareEquip(nw, [helm], totals({ fire: 75, cold: 50 }), null)
    expect(cmp.rows.find((r) => r.id === 'res')!.res!.find((c) => c.el === 'cold')).toMatchObject({ before: 50, after: 75, reachCap: true })
    expect(cmp.verdict).toBe('better')
  })

  it('свой кап (ResistMax) у итогов автора', () => {
    const t = totalsFromStats({ FireResist: 76, FireResistOverCap: 4, FireResistMax: 76, Str: 100, ReqStr: 90 }, 80)!
    expect(t).toMatchObject({ source: 'build', res: { fire: 80 }, cap: { fire: 76 }, attr: { str: 100 }, need: { str: 90 }, buildLevel: 80 })
    const cell = compareEquip(item('helmet', { res: { fire: 20 } }), [helm], t, null).rows.find((r) => r.id === 'res')!.res![0]
    expect(cell).toMatchObject({ before: 76, after: 70, belowCap: true })
  })

  it('без итогов — честные дельты вещей, без «ниже капа»', () => {
    const cmp = compareEquip(item('helmet', { life: 40, res: { fire: 5 } }), [helm], null, null)
    expect(cmp.totals).toBeNull()
    expect(cmp.rows.find((r) => r.id === 'res')!.res![0]).toEqual({ el: 'fire', before: 30, after: 5, delta: -25 })
    expect(cmp.rows.find((r) => r.id === 'res')!.tier).toBe(3)
    expect(cmp.verdict).toBe('worse')
  })

  it('«мои сопротивления» — итоги игрока', () => {
    expect(totalsFromMine({ res: { fire: 75, chaos: -20 }, at: 1 })).toMatchObject({ source: 'mine', res: { fire: 75, chaos: -20 } })
    expect(totalsFromMine({ res: {}, at: 1 })).toBeNull()
    expect(totalsFromMine(null)).toBeNull()
  })

  it('требование уровня по журналу: не дорос — «Хуже», даже с выгодой', () => {
    const nw = item('helmet', { life: 90, res: { fire: 40 } }, { req: { level: 52, str: 0, dex: 0, int: 0 } })
    const cmp = compareEquip(nw, [helm], null, 48)
    const req = cmp.rows[0]
    expect(req).toMatchObject({ id: 'req', hard: true, dir: 'down' })
    expect(req.req).toEqual([{ key: 'level', need: 52, have: 48, ok: false }])
    expect(cmp.verdict).toBe('worse')
    expect(compareEquip(nw, [helm], null, 60).verdict).toBe('better')
    // уровень неизвестен — не «нельзя», а «проверьте»
    expect(compareEquip(nw, [helm], null, null).rows[0].req![0].ok).toBeNull()
  })

  it('атрибуты: своя сила вещи на свои требования не идёт; камни отключатся — «Хуже»', () => {
    const oldGloves = worn('Gloves', 'gloves', { attr: { str: 30 } })
    const t = totalsFromStats({ Str: 110, ReqStr: 100 }, 70)!
    // без старых перчаток силы 80 — на требование 90 не хватит, хотя у новых +40
    const strong = item('gloves', { life: 50, attr: { str: 40 } }, { req: { level: 0, str: 90, dex: 0, int: 0 } })
    const a = compareEquip(strong, [oldGloves], t, null)
    expect(a.rows[0].req!.find((c) => c.key === 'str')).toMatchObject({ need: 90, have: 80, ok: false })
    expect(a.verdict).toBe('worse')
    // требования проходят, но силы после замены 80 + 5 < 100 на камни
    const weak = item('gloves', { life: 50, attr: { str: 5 } }, { req: { level: 0, str: 20, dex: 0, int: 0 } })
    const b = compareEquip(weak, [oldGloves], t, null)
    expect(b.rows[0].req!.find((c) => c.key === 'str')).toMatchObject({ ok: false, gems: { need: 100, after: 85 } })
    expect(b.verdict).toBe('worse')
  })
})

describe('вердикт по приоритетам', () => {
  const old = worn('Boots', 'boots', { life: 55, speed: 25, res: { fire: 30, cold: 10 } })
  const t = totals({ fire: 80, cold: 60, lightning: 52 })

  it('только выгоды — «Лучше», только потери — «Хуже», ничего — «Почти так же»', () => {
    expect(compareEquip(item('boots', { life: 70, speed: 25, res: { fire: 30, cold: 10 } }), [old], t, null).verdict).toBe('better')
    expect(compareEquip(item('boots', { life: 40, speed: 25, res: { fire: 30, cold: 10 } }), [old], t, null).verdict).toBe('worse')
    expect(compareEquip(item('boots', { life: 55, speed: 25, res: { fire: 30, cold: 10 } }), [old], t, null).verdict).toBe('same')
  })

  it('макет: быстрее и закрывает холод с молнией, но огонь ниже капа и меньше жизни — «По-разному»', () => {
    const nw = item('boots', { life: 42, speed: 30, res: { cold: 38, lightning: 24 } })
    const cmp = compareEquip(nw, [old], t, null)
    expect(cmp.verdict).toBe('mixed')
    expect(cmp.loss).toMatchObject({ row: 'res', el: 'fire', cap: true, tier: 1 })
    expect(cmp.gain!.tier).toBeLessThanOrEqual(3)
  })

  it('кап потерян, выгода только в DPS — «Хуже»; жизнь потеряна, выгода в DPS — «По-разному»', () => {
    const sword = worn('Weapon 1', 'weapon1h', { pdps: 100, res: { fire: 10 }, life: 20 })
    const capLoss = item('weapon1h', { pdps: 200, life: 20 })
    expect(compareEquip(capLoss, [sword], totals({ fire: 80 }), null).verdict).toBe('worse')
    const lifeLoss = item('weapon1h', { pdps: 200, res: { fire: 10 } })
    expect(compareEquip(lifeLoss, [sword], totals({ fire: 80 }), null).verdict).toBe('mixed')
  })

  it('потери в защите, выгода только в прочем (мана) — «Хуже»; у обуви скорость — как DPS: «По-разному»', () => {
    const ring = worn('Ring 1', 'ring', { life: 88, res: { cold: 25 } })
    const mana = item('ring', { mana: 44, res: { fire: 36 } })
    expect(compareEquip(mana, [ring], totals({ fire: 90, cold: 60 }), null).verdict).toBe('worse')
    const fast = item('boots', { life: 25, speed: 30, res: { fire: 30, cold: 10 } })
    expect(compareEquip(fast, [old], t, null)).toMatchObject({ verdict: 'mixed', gain: { row: 'speed' }, loss: { row: 'life' } })
  })

  it('DPS: меньше 2 % — шум', () => {
    const sword = worn('Weapon 1', 'weapon1h', { pdps: 100 })
    expect(compareEquip(item('weapon1h', { pdps: 101 }), [sword], null, null).verdict).toBe('same')
  })

  it('строки: сначала требования и кап, в простом режиме — не больше 4', () => {
    const nw = item('boots', { life: 42, speed: 30, mana: 20, es: 10, res: { cold: 38, lightning: 24 }, attr: { dex: 10 } }, { req: { level: 40, str: 0, dex: 0, int: 0 } })
    const cmp = compareEquip(nw, [old], t, 60)
    expect(cmp.rows.map((r) => r.id).slice(0, 2)).toEqual(['req', 'res'])
    const simple = shownRows(cmp.rows, false)
    expect(simple).toHaveLength(4)
    // «Требования ✓» уступают место изменениям; не проходят — первыми
    expect(simple.map((r) => r.id)).not.toContain('req')
    expect(shownRows(cmp.rows, true)).toHaveLength(cmp.rows.length)
    expect(shownRows(compareEquip(nw, [old], t, 30).rows, false)[0]).toMatchObject({ id: 'req', hard: true })
    const few = compareEquip(item('boots', { life: 60, speed: 25, res: { fire: 30, cold: 10 } }, { req: nw.req }), [old], t, 60)
    expect(shownRows(few.rows, false).map((r) => r.id)).toEqual(['life', 'req'])
  })

  it('моды урона без PoB — пометка «оценить нельзя»', () => {
    expect(compareEquip(item('amulet', { dmg: 2 }), [worn('Amulet', 'amulet')], null, null).dmgUnknown).toBe(true)
  })

  it('та же вещь узнаётся (запомнили её саму)', () => {
    const a = item('ring', { life: 30 })
    expect(sameItem(a, { ...a, slot: 'Ring 1', at: 5 } as EquipEntry)).toBe(true)
    expect(sameItem(a, item('ring', { life: 31 }))).toBe(false)
  })
})

describe('второй вердикт «по гайду»', () => {
  const boots = readPobItem('Rarity: RARE\nStorm Stride\nTwo-Toned Boots\nImplicits: 0\n+55 to maximum Life\n30% increased Movement Speed\n+30% to Fire Resistance\n+12% to Cold Resistance')!
  const goldrim = readPobItem('Rarity: UNIQUE\nGoldrim\nLeather Cap\nImplicits: 0\n+30% to all Elemental Resistances\n10% increased Rarity of Items found')!

  it('жёлтая вещь гайда: что хочет гайд — жизнь, сопротивления, скорость; ближе / дальше / как надетое', () => {
    const nw = item('boots', { life: 60, speed: 30, res: { fire: 40 } })
    const old = worn('Boots', 'boots', { life: 20, speed: 10 })
    const g = guideVerdict(boots, nw, [old])!
    expect(g.wants).toEqual([
      { id: 'life', value: 55 },
      { id: 'res', value: 42 },
      { id: 'speed', value: 30 }
    ])
    expect(g).toMatchObject({ verdict: 'closer', unique: null, match: false })
    expect(guideVerdict(boots, item('boots', { life: 10 }), [old])!.verdict).toBe('further')
    expect(guideVerdict(boots, item('boots', { life: 22, speed: 10 }), [old])!.verdict).toBe('same')
  })

  it('уник гайда — по имени: это он — ближе; надет он, а это жёлтая — дальше', () => {
    const cap = item('helmet', { res: { fire: 30, cold: 30, lightning: 30 } }, { rarity: 'unique', name: 'Goldrim', base: 'Leather Cap' })
    const rare = item('helmet', { life: 70, res: { fire: 40 } })
    expect(guideVerdict(goldrim, cap, [worn('Helmet', 'helmet', { life: 40 })])).toMatchObject({ verdict: 'closer', match: true, unique: 'Goldrim' })
    const wornCap: EquipEntry = { ...cap, slot: 'Helmet', at: 1 }
    expect(guideVerdict(goldrim, rare, [wornCap])).toMatchObject({ verdict: 'further', match: false })
    // уник без жизни и сопротивлений и не он сам — сравнивать нечем
    const odd = readPobItem('Rarity: UNIQUE\nOdd Thing\nIron Ring\nImplicits: 0\n10% increased Rarity of Items found')!
    expect(guideVerdict(odd, item('ring', { life: 10 }), [])).toBeNull()
  })

  it('предмет этапа из настоящего кода PoB — для того же вида вещи', () => {
    const r = parsePobXml(fixtureXml('pobbin-acts-all-axes'))
    if (!r.ok) throw new Error('pob')
    const plan = resolveStages(r.build)
    const index = plan.stages.findIndex((s) => s.items !== null)
    const kinds = new Set(stageItems(r.build, plan, index).map((x) => x.kind))
    for (const [kind, slot] of [
      ['boots', 'boots'],
      ['ring', 'ring'],
      ['weapon2h', 'weapon']
    ] as const) {
      const g = guideItem(r.build, plan, index, item(kind))
      if (kinds.has(slot)) expect(g?.kind, kind).toBe(slot)
      else expect(g, kind).toBeNull()
    }
    expect(guideItem(r.build, plan, index, item('complex'))).toBeNull()
  })
})
