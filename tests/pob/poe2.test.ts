import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { importPob2Code, importPobCode } from '@shared/pob/import'
import { parsePob2Xml } from '@shared/pob/poe2'
import { fixtureCode, fixtureXml } from './fixtures'

// Разбор PoB2 (S66) на настоящих кодах tests/fixtures/pob/poe2-* (S35): класс, восхождение, ноды и наборы оружия,
// выбор атрибутов, камни, предметы; код PoE 1 — «это билд PoE 1»; разбор PoE 1 — по-прежнему «это билд PoE 2».

describe('PoB2 → модель', () => {
  it('Amazon: класс, восхождение, дерево, наборы оружия, атрибуты', () => {
    const r = parsePob2Xml(fixtureXml('poe2-pobbin-amazon'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.build
    expect(b).toMatchObject({ game: 'poe2', className: 'Huntress', ascendClassName: 'Amazon', level: 100, targetVersion: '0_1', mainSocketGroup: 7 })
    expect(b.specs).toHaveLength(1)
    const s = b.specs[0]
    expect(s).toMatchObject({ classId: 8, ascendClassId: 1, ascendancy: 'Huntress1', treeVersion: '0_5', title: '' })
    expect(s.nodes.length).toBeGreaterThan(100)
    expect(s.weaponSets[0].length).toBeGreaterThan(0)
    expect(s.weaponSets[1].length).toBeGreaterThan(0)
    expect(s.attributes.str.length + s.attributes.dex.length + s.attributes.int.length).toBeGreaterThan(20)
    expect(s.sockets.length).toBe(8)
    expect(b.skillSets[0].groups[0].gems[0]).toMatchObject({ gemId: 'Metadata/Items/Gem/SkillGemPlayerDefaultQuarterstaff', nameSpec: 'Quarterstaff Strike' })
    expect(b.itemSets[0].slots['Body Armour']).toBeGreaterThan(0)
    // <URL> дерева и <Import> в модель не попадают
    expect(JSON.stringify(b)).not.toContain('passive-skill-tree')
  })

  it.each([
    ['poe2-pobbin-stormweaver', 'Sorceress', 'Stormweaver', 'Sorceress1'],
    ['poe2-pobbin-pathfinder', 'Ranger', 'Pathfinder', 'Ranger3']
  ])('%s', (name, cls, asc, ascId) => {
    const r = importPob2Code(fixtureCode(name), inflateNode)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.build).toMatchObject({ className: cls, ascendClassName: asc })
    expect(r.build.specs[0].ascendancy).toBe(ascId)
    expect(r.source).toEqual({ kind: 'code' })
  })

  it('код PoE 1 — «это билд PoE 1»; PoE 1 по-прежнему отвечает «это билд PoE 2»', () => {
    expect(importPob2Code(fixtureCode('pobbin-crit'), inflateNode)).toEqual({ ok: false, error: 'poe1' })
    expect(importPobCode(fixtureCode('poe2-pobbin-amazon'), inflateNode)).toEqual({ ok: false, error: 'poe2' })
  })

  it('мусор и пределы', () => {
    expect(importPob2Code('', inflateNode)).toEqual({ ok: false, error: 'empty' })
    expect(importPob2Code('не код', inflateNode)).toEqual({ ok: false, error: 'not-pob' })
    expect(parsePob2Xml('<Other/>')).toMatchObject({ ok: false, error: 'not-pob' })
    expect(parsePob2Xml('<PathOfBuilding2/>')).toMatchObject({ ok: false, error: 'not-pob', detail: 'no Build' })
    expect(parsePob2Xml('<!DOCTYPE x><PathOfBuilding2/>')).toMatchObject({ ok: false, error: 'not-pob' })
    const deep = `<PathOfBuilding2>${'<a>'.repeat(20)}${'</a>'.repeat(20)}</PathOfBuilding2>`
    expect(parsePob2Xml(deep)).toMatchObject({ ok: false, error: 'too-large' })
  })

  it('восхождение: мусор в ascendancyInternalId не берётся', () => {
    const xml = '<PathOfBuilding2><Build targetVersion="0_1" className="Monk"/><Tree><Spec ascendancyInternalId="nil" classId="10" nodes="1,2,2,x"/><Spec ascendancyInternalId="../../x" nodes=""/></Tree></PathOfBuilding2>'
    const r = parsePob2Xml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.build.specs.map((s) => s.ascendancy)).toEqual([null, null])
    expect(r.build.specs[0].nodes).toEqual([1, 2])
    expect(r.build.specs[0].weaponSets).toEqual([[], []])
  })
})
