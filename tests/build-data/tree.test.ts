import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  BUILD_TREE_FILE,
  classById,
  diffNodes,
  keyNodes,
  lineText,
  masteryEffect,
  nodeById,
  nodeByHash,
  nodeLines,
  nodeName,
  nodePosition,
  orbitAngle,
  parseTreeData,
  treeSearch
} from '@shared/build/data'
import type { TreeData } from '@shared/build/types'

// Дерево пассивок PoE1 3.29 (resources/data/poe1/build/tree.json, генератор tools/build-data/tree.mjs):
// известные ноды — hash, строковый id из журнала, EN/RU-имена, вид, тексты статов; разница наборов; строка поиска.

const raw = JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1', BUILD_TREE_FILE), 'utf8'))
const tree = parseTreeData(raw) as TreeData

describe('tree.json', () => {
  it('разбирается; формат новее приложения или чужой файл — null', () => {
    expect(tree).not.toBeNull()
    expect(tree.meta.tree).toBe('3.29.1')
    expect(tree.nodes.size).toBe(tree.meta.nodes)
    expect(tree.nodes.size).toBeGreaterThan(2900)
    expect(parseTreeData({ ...raw, v: 99 })).toBeNull()
    expect(parseTreeData({ v: 1 })).toBeNull()
    expect(parseTreeData('x')).toBeNull()
  })

  it.each([
    [31961, 'resolute_technique1138', 'Resolute Technique', 'Точные удары', 'keystone'],
    [11455, 'chaos_inoculation1141', 'Chaos Inoculation', 'Иммунитет к хаосу', 'keystone'],
    [58831, 'deadly_precision751', 'Disemboweling', 'Потрошение', 'notable'],
    [25260, 'life1415', 'Life', 'Здоровье', 'normal'],
    [89, 'mastery_mine174', 'Mine Mastery', 'Мастерство мин', 'mastery'],
    [26725, 'jewel_slot1956', 'Basic Jewel Socket', 'Обычное гнездо для самоцвета', 'jewel'],
    [61525, 'templar598', 'TEMPLAR', 'ЖРЕЦ', 'classStart'],
    [409, 'AscendancyGuardianStart', 'Guardian', 'Защитник', 'ascStart']
  ] as const)('нода %i: id %s, «%s» / «%s», %s', (hash, id, en, ru, kind) => {
    const n = nodeByHash(tree, hash)!
    expect(n).toMatchObject({ hash, id, en, ru, kind })
    expect(nodeById(tree, id)).toBe(n)
    expect(nodeName(n, 'en')).toBe(en)
    expect(nodeName(n, 'ru')).toBe(ru)
  })

  it('тексты статов EN/RU и статы для расчёта', () => {
    const rt = nodeByHash(tree, 31961)!
    expect(nodeLines(rt, 'en')).toEqual(["Your hits can't be Evaded", 'Never deal Critical Strikes'])
    expect(nodeLines(rt, 'ru')).toEqual(['От ваших ударов нельзя уклониться', 'Вы никогда не наносите критических ударов'])
    const life = nodeById(tree, 'life1415')!
    expect(nodeLines(life, 'ru')).toEqual(['6% увеличение максимума здоровья'])
    expect(life.calc).toEqual({ 'maximum_life_+%': 6 })
    // строка без перевода (бафф ауры) — на RU показываем EN
    expect(lineText({ en: 'Cannot be Stunned', ru: null }, 'ru')).toBe('Cannot be Stunned')
    expect(tree.meta.ruMissingLines).toBeLessThan(100)
  })

  it('восхождения и очки пассивок, мастерства с эффектами', () => {
    const point = nodeById(tree, 'AscendancyAscendant18')!
    expect(point).toMatchObject({ asc: 'Ascendant', points: 1 })
    expect(point.stats).toEqual([{ en: 'Grants 1 Passive Skill Point', ru: 'Дарует 1 очко пассивных умений' }])
    const mastery = nodeById(tree, 'mastery_poison199')!
    expect(mastery).toMatchObject({ kind: 'mastery', en: 'Poison Mastery', ru: 'Мастерство ядов' })
    expect(mastery.masteryEffects.length).toBeGreaterThan(3)
    const eff = masteryEffect(tree, 34563)!
    expect(eff.stats).toEqual([
      {
        en: 'Poisons you inflict on non-Poisoned Enemies deal 300% increased Damage',
        ru: 'Яды, наложенные вами на неотравленных врагов, наносят увеличенный на 300% урон'
      }
    ])
    expect(tree.masteries.size).toBeGreaterThan(300)
  })

  it('классы по classId PoB, восхождения по ascendClassId, родословные', () => {
    expect(tree.classes.map((c) => c.en)).toEqual(['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'])
    const { cls, asc } = classById(tree, 3, 2)
    expect(cls).toMatchObject({ en: 'Witch', ru: 'Ведьма', start: 54447 })
    expect(asc).toMatchObject({ id: 'Elementalist', en: 'Elementalist', ru: 'Маг стихий' })
    expect(classById(tree, 2, 1).asc).toMatchObject({ id: 'Raider', en: 'Warden', ru: 'Хранитель' })
    expect(classById(tree, 3, 0).asc).toBeNull()
    expect(tree.alt.find((a) => a.id === 'Warden')).toMatchObject({ en: 'Warden of the Maji', ru: 'Хранитель Маджи' })
    for (const c of tree.classes) {
      expect(nodeByHash(tree, c.start!)!.kind).toBe('classStart')
      for (const a of c.asc) expect(nodeByHash(tree, a.start!)!.kind).toBe('ascStart')
    }
  })

  it('соседство двустороннее; стартовая нода класса не связана со стартом восхождения', () => {
    const d = nodeByHash(tree, 58831)!
    expect(d.links.length).toBeGreaterThan(0)
    for (const o of d.links) expect(nodeByHash(tree, o)!.links).toContain(58831)
    const templar = nodeByHash(tree, 61525)!
    expect(templar.links).not.toContain(409)
  })

  it('координаты: орбита 0 — центр группы, места на орбите 16 — через 30°/45°', () => {
    expect(orbitAngle(16, 2)).toBe(45)
    expect(orbitAngle(40, 5)).toBe(45)
    expect(orbitAngle(6, 1)).toBe(60)
    const start = nodeByHash(tree, 61525)!
    expect(nodePosition(tree, start)).toEqual(tree.groups.get(start.group))
    const n = [...tree.nodes.values()].find((x) => tree.constants.skillsPerOrbit[x.orbit] === 16 && x.orbitIndex === 2)!
    const g = tree.groups.get(n.group)!
    const r = tree.constants.orbitRadii[n.orbit]
    const p = nodePosition(tree, n)!
    expect(p.x).toBeCloseTo(g.x + r * Math.SQRT1_2, 6)
    expect(p.y).toBeCloseTo(g.y - r * Math.SQRT1_2, 6)
  })

  it('разница наборов: взять / снять, очки сброса без стартовых нод', () => {
    expect(diffNodes([1, 2, 3], [3, 4, 2, 5])).toEqual({ add: [4, 5], remove: [1], respec: 1 })
    expect(diffNodes([61525, 25260, 58831], [61525, 31961], tree)).toEqual({ add: [31961], remove: [25260, 58831], respec: 2 })
    // смена класса: стартовая нода в «снять», но очка сброса не стоит
    expect(diffNodes([61525, 25260], [54447, 25260], tree)).toEqual({ add: [54447], remove: [61525], respec: 0 })
    expect(diffNodes([], [])).toEqual({ add: [], remove: [], respec: 0 })
  })

  it('строка поиска для игрового дерева: нотаблы и кейстоуны этапа на языке клиента', () => {
    const next = [25260, 58831, 89, 31961, 11455, 26725]
    expect(keyNodes(tree, next).map((n) => n.hash)).toEqual([58831, 31961, 11455])
    expect(treeSearch(tree, next, 'en')).toEqual({ parts: ['Disemboweling', 'Resolute Technique', 'Chaos Inoculation'], text: 'Disemboweling' })
    expect(treeSearch(tree, next, 'ru', { or: true }).text).toBe('Потрошение|Точные удары|Иммунитет к хаосу')
    expect(treeSearch(tree, next, 'en', { max: 2 }).parts).toEqual(['Disemboweling', 'Resolute Technique'])
    expect(treeSearch(tree, next, 'en', { or: true, maxLength: 32 }).text).toBe('Disemboweling|Resolute Technique')
    expect(treeSearch(tree, next, 'en', { or: true, maxLength: 20 }).text).toBe('Disemboweling')
    expect(treeSearch(tree, [25260], 'en')).toEqual({ parts: [], text: '' })
  })
})
