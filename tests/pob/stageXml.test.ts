import { describe, expect, it } from 'vitest'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import { currentStage, resolveStages } from '@shared/pob/stages'
import { stageXml } from '@shared/pob/stageXml'
import { parseXml, child, childrenOf } from '@shared/pob/xml'
import { stageRawGroups } from '@shared/build/stageItems'
import { POE1_FIXTURES, fixtureXml } from './fixtures'

// S44: модель билда S35 + этап → XML для loadBuildFromXML движка PoB. Проверка — обратным разбором тем же парсером
// (parsePobXml): дерево, камни и вещи этапа доходят до PoB без потерь; надетые вещи встают в свои слоты.

function model(name: string): PobBuild {
  const r = parsePobXml(fixtureXml(name))
  if (!r.ok) throw new Error(`${name}: ${r.error}`)
  return r.build
}

describe('XML этапа для движка', () => {
  it.each(POE1_FIXTURES)('%s: каждый этап — валидный XML PoB, без потерь дерева, камней и вещей', (name) => {
    const b = model(name)
    const plan = resolveStages(b)
    const indices = plan.stages.length ? plan.stages.map((_, i) => i) : [null]
    for (const index of indices) {
      const { xml } = stageXml(b, plan, index, { treeVersion: '3_29', level: 42 })
      const back = parsePobXml(xml)
      expect(back.ok, `${name} #${index}`).toBe(true)
      if (!back.ok) continue
      const m = back.build
      const stage = index !== null ? plan.stages[index] : undefined
      const spec = b.specs[stage?.spec ?? b.activeSpec]
      expect(m.level).toBe(42)
      expect(m.specs).toHaveLength(spec ? 1 : 0)
      if (spec) {
        expect(m.specs[0].nodes).toEqual(spec.nodes)
        expect(m.specs[0].treeVersion).toBe('3_29')
        expect(m.specs[0].classId).toBe(spec.classId)
        expect(m.specs[0].ascendClassId).toBe(spec.ascendClassId)
        expect(m.specs[0].masteryEffects).toEqual(spec.masteryEffects)
      }
      const groups = index !== null ? stageRawGroups(b, plan, index) : b.skillSets[b.activeSkillSet]?.groups ?? []
      expect(m.skillSets[0]?.groups.map((g) => g.gems.map((x) => x.nameSpec)) ?? []).toEqual(groups.map((g) => g.gems.map((x) => x.nameSpec)))
      const set = b.itemSets[stage?.items ?? b.activeItemSet]
      for (const [slot, id] of Object.entries(set?.slots ?? {})) {
        const was = b.items.find((i) => i.id === id)
        if (!was) continue
        const now = m.items.find((i) => i.id === m.itemSets[0].slots[slot as keyof typeof set.slots])
        expect(now?.text, `${name} ${slot}`).toBe(was.text)
      }
      expect(m.config.resistancePenalty).toBe(b.config.resistancePenalty)
    }
  })

  it('надетая вещь встаёт в слот вместо вещи этапа, новым id; остальные слоты — из этапа', () => {
    const b = model('pobbin-guardian')
    const plan = resolveStages(b)
    const index = currentStage(plan, { level: 70, act: null, campaignDone: false }).index
    const ring = 'Rarity: Rare\nPOETH Item\nTwo-Stone Ring\n--------\n+30% to Fire Resistance'
    const { xml, slots } = stageXml(b, plan, index, { treeVersion: '3_29', level: 70, worn: { 'Ring 1': ring } })
    expect(slots['Ring 1']).toBe('worn')
    const back = parsePobXml(xml)
    if (!back.ok) throw new Error(back.error)
    const id = back.build.itemSets[0].slots['Ring 1']
    expect(id).toBeGreaterThan(Math.max(...b.items.map((i) => i.id)))
    expect(back.build.items.find((i) => i.id === id)?.text).toBe(ring)
    for (const [slot, who] of Object.entries(slots)) if (slot !== 'Ring 1') expect(who).toBe('build')
  })

  it('надето двуручное: вторая рука из гайда убирается', () => {
    const b = model('pobbin-guardian')
    const plan = resolveStages(b)
    const twoHand = 'Rarity: Normal\nGreat Mallet'
    const withShield = stageXml(b, plan, null, { treeVersion: '3_29', level: null })
    const r = stageXml(b, plan, null, { treeVersion: '3_29', level: null, worn: { 'Weapon 1': twoHand }, wornTwoHand: true })
    expect(r.slots['Weapon 1']).toBe('worn')
    expect(r.slots['Weapon 2']).toBeUndefined()
    if (withShield.slots['Weapon 2']) expect(r.xml).not.toContain('name="Weapon 2"')
  })

  it('текст вещи не ломает XML: </Item>, кавычки, амперсанды, управляющие символы', () => {
    const b = model('pobbin-guardian')
    const evil = 'Rarity: Rare\n</Item></Items><Items><Item id="1">x</Item>\n"&amp;" <!DOCTYPE x> \u0001\u0007 & <'
    const { xml } = stageXml(b, resolveStages(b), null, { treeVersion: '3_29', level: 10, worn: { Helmet: evil } })
    const root = parseXml(xml)
    expect(root.name).toBe('PathOfBuilding')
    const items = childrenOf(child(root, 'Items'), 'Item')
    const helmet = childrenOf(child(child(root, 'Items'), 'ItemSet'), 'Slot').find((s) => s.attrs.get('name') === 'Helmet')
    const text = items.find((i) => i.attrs.get('id') === helmet?.attrs.get('itemId'))?.text
    expect(text).toBe('Rarity: Rare\n</Item></Items><Items><Item id="1">x</Item>\n"&amp;" <!DOCTYPE x>  & <')
  })

  it('уровень: персонаж по журналу 1–100, иначе — уровень автора', () => {
    const b = model('pobbin-guardian')
    const lvl = (level: number | null): number => {
      const r = parsePobXml(stageXml(b, null, null, { treeVersion: '3_29', level }).xml)
      return r.ok ? r.build.level : -1
    }
    expect(lvl(55)).toBe(55)
    expect(lvl(null)).toBe(b.level)
    expect(lvl(0)).toBe(b.level)
    expect(lvl(101)).toBe(b.level)
  })

  it('в XML нет данных импорта персонажа и заметок автора', () => {
    const b = model('pobbin-guardian')
    const { xml } = stageXml(b, resolveStages(b), null, { treeVersion: '3_29', level: null })
    expect(xml).not.toMatch(/<Import|<Notes|<Calcs|<TreeView|<PlayerStat/)
  })
})
