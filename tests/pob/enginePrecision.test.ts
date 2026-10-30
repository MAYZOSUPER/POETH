import { describe, expect, it } from 'vitest'
import { cleanPobBuild } from '@shared/build/library'
import { cleanConfigOption, cleanExtra, parsePobXml, POB_GEM_EXTRA, type PobBuild } from '@shared/pob/model'
import { isTimeless, stageXml } from '@shared/pob/stageXml'
import { child, childrenOf, parseXml } from '@shared/pob/xml'
import { POE1_FIXTURES, fixtureXml } from './fixtures'

// S44: чтобы движок PoB считал как у автора, модель S35 хранит то, от чего зависит расчёт: все опции конфигурации,
// атрибуты расчёта камней (часть навыка, приспешник, ваал), включённые флаконы, татуировки, формат кластерных хэшей,
// варианты уников. Проверка с настоящим движком (наш XML = исходный код билда) — tests/pob/serverLua.test.ts.

function model(name: string): PobBuild {
  const r = parsePobXml(fixtureXml(name))
  if (!r.ok) throw new Error(name)
  return r.build
}

describe('модель для движка PoB', () => {
  it('опции конфигурации активного набора — все, многострочный customMods сохраняет строки', () => {
    const b = model('pobbin-leveling-acts')
    const names = (b.config.options ?? []).map((o) => o.name)
    expect(names).toEqual(expect.arrayContaining(['conditionLeeching', 'useFrenzyCharges', 'customMods', 'enemyIsBoss']))
    expect(b.config.options?.find((o) => o.name === 'customMods')?.string).toBe('(Life Mastery)\n15% increased Maximum Life')
    expect(b.config.options?.find((o) => o.name === 'useFrenzyCharges')?.boolean).toBe(true)
  })

  it('часть навыка и приспешник у камней, включённые флаконы, татуировки, формат кластерных хэшей', () => {
    const nb = model('pobcodes-nightblade')
    const gems = nb.skillSets.flatMap((s) => s.groups.flatMap((g) => g.gems))
    expect(gems.find((g) => g.nameSpec === 'Blade Flurry')?.extra?.skillPart).toBe('2')
    expect(gems.find((g) => g.nameSpec === 'Summon Stone Golem')?.extra?.skillMinion).toBe('SummonedStoneGolem')
    expect(nb.specs[0].overrides?.length).toBeGreaterThan(0)
    expect(nb.specs[0].clusterHashFormat).toBe(2)
    expect(model('poedb-deadeye').specs[0].clusterHashFormat).toBeUndefined()
    const occ = model('pob-spec-occvortex')
    expect(occ.itemSets[occ.activeItemSet].active).toEqual(expect.arrayContaining(['Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5']))
  })

  it('чужие значения отбрасываются: имя опции, длина, атрибуты не из списка', () => {
    expect(cleanConfigOption({ name: '__proto__', number: 1 })).toBeNull()
    expect(cleanConfigOption({ name: 'a b', number: 1 })).toBeNull()
    expect(cleanConfigOption({ name: 'x', string: 'y'.repeat(4001) })).toBeNull()
    expect(cleanConfigOption({ name: 'x', number: Number.NaN })).toBeNull()
    expect(cleanConfigOption({ name: 'x', string: 'a\u0000b\r\nc' })).toEqual({ name: 'x', string: 'a b\nc' })
    const extra = cleanExtra((k) => ({ skillPart: '2', enableGlobal1: 'true', skillMinion: 'a"b', evil: '1' } as Record<string, string>)[k], POB_GEM_EXTRA)
    expect(extra).toEqual({ skillPart: '2', enableGlobal1: 'true' })
  })

  it('builds.json: новые поля переживают запись и чтение; у старых записей их просто нет', () => {
    for (const name of POE1_FIXTURES) {
      const b = model(name)
      expect(cleanPobBuild(JSON.parse(JSON.stringify(b))), name).toEqual(b)
    }
    const b = model('pobcodes-nightblade')
    const old = JSON.parse(JSON.stringify(b))
    delete old.config.options
    const back = cleanPobBuild(old)
    expect(back?.config.options).toBeUndefined()
    // испорченный файл: атрибут не из списка, татуировка без имени, чужой слот во флаконах
    const bad = JSON.parse(JSON.stringify(b))
    bad.skillSets[0].groups[0].gems[0].extra = { evil: 'x', skillPart: '<script>' }
    bad.specs[0].overrides = [{ nodeId: 1, dn: '' }, { nodeId: 'x', dn: 'a' }]
    bad.itemSets[0].active = ['Flask 1', 'Nope']
    const clean = cleanPobBuild(bad)
    expect(clean?.skillSets[0].groups[0].gems[0].extra).toBeUndefined()
    expect(clean?.specs[0].overrides).toEqual([])
    expect(clean?.itemSets[0].active).toEqual(['Flask 1'])
  })
})

describe('XML этапа: то, от чего зависит расчёт', () => {
  it('опции конфигурации — все; перевод строки в атрибуте как есть (xml.lua PoB не знает &#10;)', () => {
    const b = model('pobbin-leveling-acts')
    const { xml } = stageXml(b, null, null, { treeVersion: '3_29', level: null })
    expect(xml).toContain('name="customMods" string="(Life Mastery)\n15% increased Maximum Life"')
    expect(xml).not.toContain('&#')
    const inputs = childrenOf(child(parseXml(xml), 'Config'), 'Input')
    expect(inputs.length).toBe(b.config.options?.length)
  })

  it('часть навыка, флаконы, татуировки, кластерный формат — в XML; нет формата — нет атрибута', () => {
    const nb = stageXml(model('pobcodes-nightblade'), null, null, { treeVersion: '3_29', level: null }).xml
    expect(nb).toMatch(/<Gem [^>]*nameSpec="Blade Flurry"[^>]*skillPart="2"/)
    expect(nb).toMatch(/<Overrides><Override nodeId="\d+" dn="[^"]+"/)
    expect(nb).toContain('clusterHashFormatVersion="2"')
    expect(stageXml(model('poedb-deadeye'), null, null, { treeVersion: '3_29', level: null }).xml).not.toContain('clusterHashFormatVersion')
    const occ = stageXml(model('pob-spec-occvortex'), null, null, { treeVersion: '3_29', level: null }).xml
    expect([...occ.matchAll(/<Slot name="Flask \d" itemId="\d+" active="true"\/>/g)]).toHaveLength(5)
  })

  it('надетый игроком флакон не помечается включённым (движок флаконы не сравнивает)', () => {
    const occ = model('pob-spec-occvortex')
    const { xml } = stageXml(occ, null, null, { treeVersion: '3_29', level: null, worn: { 'Flask 1': 'Rarity: Normal\nDivine Life Flask' } })
    expect(xml).toMatch(/<Slot name="Flask 1" itemId="\d+"\/>/)
  })

  it('timeless-самоцвет в дереве не ставится (данных timeless в урезанном PoB нет)', () => {
    const b = model('pobbin-death-oath-328')
    const timeless = b.items.filter((i) => isTimeless(i.text)).map((i) => i.id)
    expect(timeless.length).toBeGreaterThan(0)
    const { xml } = stageXml(b, null, null, { treeVersion: '3_29', level: null })
    const sockets = childrenOf(child(child(child(parseXml(xml), 'Tree'), 'Spec'), 'Sockets'), 'Socket').map((s) => Number(s.attrs.get('itemId')))
    for (const id of timeless) expect(sockets).not.toContain(id)
    expect(isTimeless('Rarity: UNIQUE\nGlorious Vanity\nTimeless Jewel')).toBe(true)
    expect(isTimeless('Rarity: RARE\nGlorious Vanity Gloves')).toBe(false)
  })
})
