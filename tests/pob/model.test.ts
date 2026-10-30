import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { importPobCode } from '@shared/pob/import'
import { parsePobXml, pobItem, stripPobColors, POB_SLOTS, type PobBuild } from '@shared/pob/model'
import { FIXTURES, POE1_FIXTURES, POE2_FIXTURES, encodePob, fixtureCode, fixtureXml } from './fixtures'

function build(name: string): PobBuild {
  const res = parsePobXml(fixtureXml(name))
  if (!res.ok) throw new Error(`${name}: ${res.error} ${res.detail ?? ''}`)
  return res.build
}

/** Короткий снимок модели: то, что увидит игрок, без тысяч строк предметов. */
function summary(b: PobBuild): unknown {
  const gems = b.skillSets[b.activeSkillSet]?.groups.flatMap((g) => g.gems) ?? []
  const set = b.itemSets[b.activeItemSet]
  return {
    target: b.targetVersion,
    level: b.level,
    class: `${b.className}/${b.ascendClassName ?? '-'}`,
    bandit: b.bandit,
    pantheon: [b.pantheonMajor, b.pantheonMinor],
    mainSocketGroup: b.mainSocketGroup,
    stats: {
      count: Object.keys(b.stats).length,
      Life: b.stats.Life,
      EnergyShield: b.stats.EnergyShield,
      FireResist: b.stats.FireResist,
      ChaosResist: b.stats.ChaosResist,
      LifeInc: b.stats['Spec:LifeInc']
    },
    specs: b.specs.map((s) => `${s.title || '(default)'} | ${s.treeVersion} | nodes ${s.nodes.length} | mastery ${s.masteryEffects.length} | jewels ${s.sockets.length}`),
    activeSpec: b.activeSpec,
    skillSets: b.skillSets.map((s) => `${s.title || '(default)'} | groups ${s.groups.length} | gems ${s.groups.reduce((n, g) => n + g.gems.length, 0)}`),
    activeSkillSet: b.activeSkillSet,
    firstGems: gems.slice(0, 3).map((g) => `${g.nameSpec} ${g.level}/${g.quality} ${g.gemId ?? '-'}${g.variantId ? ` [${g.variantId}]` : ''}${g.enabled ? '' : ' off'}`),
    items: b.items.length,
    itemSets: b.itemSets.map((s) => `${s.title || '(default)'} | slots ${Object.keys(s.slots).length} | other ${s.otherSlots.length}`),
    activeItemSet: b.activeItemSet,
    bodyArmour: (pobItem(b, set?.slots['Body Armour'])?.text.split('\n').slice(0, 3) ?? []).join(' / '),
    config: b.config,
    notes: b.notes.slice(0, 80),
    warnings: b.warnings
  }
}

describe('модель: настоящие коды PoB 1', () => {
  it('фикстур 15–20, среди них есть PoE 2', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(15)
    expect(FIXTURES.length).toBeLessThanOrEqual(20)
    expect(POE2_FIXTURES.length).toBeGreaterThanOrEqual(1)
  })

  it.each(POE1_FIXTURES)('%s', (name) => {
    expect(summary(build(name))).toMatchSnapshot()
  })

  it('в фикстурах нет данных импорта персонажа', () => {
    for (const name of FIXTURES) expect(fixtureXml(name)).not.toMatch(/lastAccountHash|lastCharacterHash|importLink/)
  })
})

describe('модель: поля', () => {
  it('этапы с цветокодами: названия чистые, ноды — числа без повторов', () => {
    const b = build('pobbin-leveling-acts')
    expect(b.specs.map((s) => s.title)).toEqual(['Acts 1-2', 'Acts 3-4', 'Acts 5-6', 'Acts 7- Early Maps'])
    for (const s of b.specs) {
      expect(s.nodes.length).toBeGreaterThan(20)
      expect(new Set(s.nodes).size).toBe(s.nodes.length)
      expect(s.nodes.every((n) => Number.isInteger(n) && n > 0)).toBe(true)
    }
    expect(b.specs[1].masteryEffects).toEqual(expect.arrayContaining([{ node: 44948, effect: 64875 }]))
  })

  it('камни: gemId, вариант, уровень, качество, выключенный камень', () => {
    const b = build('pobbin-leveling-acts')
    const gems = b.skillSets[0].groups.flatMap((g) => g.gems)
    expect(gems.find((g) => g.nameSpec === 'Vortex')).toMatchObject({
      nameSpec: 'Vortex',
      gemId: 'Metadata/Items/Gems/SkillGemFrostBoltNova',
      skillId: 'FrostBoltNova',
      variantId: 'FrostBoltNova',
      level: 21,
      quality: 20,
      enabled: true,
      count: 1
    })
    // S44: атрибуты расчёта PoB для движка — белым списком
    expect(Object.keys(gems.find((g) => g.nameSpec === 'Vortex')?.extra ?? {}).every((k) => /^(enableGlobal[12]|skill\w+|qualityId)$/.test(k))).toBe(true)
    expect(gems.find((g) => g.nameSpec === 'Empower')?.enabled).toBe(false)
    expect(b.skillSets[0].groups[0].slot).toBe('Body Armour')
  })

  it('старый формат: <Skill> без SkillSet, Config без ConfigSet, бандит', () => {
    const b = build('pastebin-acts-lv')
    expect(b.skillSets).toHaveLength(1)
    expect(b.skillSets[0].groups[0].label).toBe('-------------------- ACT 1--------------------')
    expect(b.bandit).toBe('Alira')
    const old = build('pobbin-leveling-acts')
    expect(old.pantheonMajor).toBe('TheBrineKing')
    expect(old.config.enemyIsBoss).toBe('Pinnacle')
  })

  it('слоты из таблицы PoB, абисс-гнёзда — отдельно, предметы находятся по id', () => {
    const b = build('pobbin-huge')
    for (const set of b.itemSets) for (const k of Object.keys(set.slots)) expect(POB_SLOTS).toContain(k)
    const set = b.itemSets[b.activeItemSet]
    const body = pobItem(b, set.slots['Body Armour'])
    expect(body?.text).toMatch(/^Rarity: /)
    expect(body?.text).not.toMatch(/<ModRange/)
  })

  it('уник Forbidden Flame (~30 тыс. символов в XML, ~25 тыс. без отступов) не обрезается и не роняет билд', () => {
    const b = build('pobbin-huge')
    const ff = b.items.find((i) => i.text.includes('Forbidden Flame'))
    expect(ff && ff.text.length).toBeGreaterThan(24_000)
    expect(b.warnings).toEqual([])
  })

  it('джуэлы в гнёздах дерева ссылаются на предметы', () => {
    const b = build('pobbin-huge')
    const sockets = b.specs.flatMap((s) => s.sockets)
    expect(sockets.length).toBeGreaterThan(5)
    expect(sockets.every((s) => pobItem(b, s.itemId))).toBe(true)
  })

  it('PlayerStat: есть у PoB-кодов, нет у собранного без PoB', () => {
    expect(build('pobbin-crit').stats.Life).toBeGreaterThan(0)
    expect(build('nostats-pobbin-crit').stats).toEqual({})
  })

  it('заметки без цветокодов ^1…^9 и ^xRRGGBB', () => {
    const notes = build('pobbin-leveling-acts').notes
    expect(notes).toContain('Forum Guide:')
    expect(notes).not.toMatch(/\^(?:x[0-9A-Fa-f]{6}|\d)/)
    expect(stripPobColors('^x00FFFFForum^7 и ^1красный')).toBe('Forum и красный')
  })

  it('штраф резистов: −60 по умолчанию, 0 и −30 из Config', () => {
    const xml = (inputs: string): string =>
      `<PathOfBuilding><Build level="10" className="Witch" targetVersion="3_0"/><Config activeConfigSet="1"><ConfigSet id="1">${inputs}</ConfigSet></Config></PathOfBuilding>`
    const pen = (inputs: string): number => {
      const r = parsePobXml(xml(inputs))
      return r.ok ? r.build.config.resistancePenalty : NaN
    }
    expect(pen('')).toBe(-60)
    expect(pen('<Input name="resistancePenalty" number="0"/>')).toBe(0)
    expect(pen('<Input name="resistancePenalty" number="-30"/>')).toBe(-30)
    expect(pen('<Input name="resistancePenalty" number="-999"/>')).toBe(-60)
  })

  it('<Import> и прочее служебное в модель не попадают', () => {
    const xml =
      '<PathOfBuilding><Build level="5" className="Witch" targetVersion="3_0"/>' +
      '<Import lastAccountHash="abc" lastCharacterHash="def" importLink="https://example.com/x"/>' +
      '<Calcs><Input name="x" string="secret"/></Calcs></PathOfBuilding>'
    const r = parsePobXml(xml)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toMatch(/abc|def|example\.com|secret/)
  })

  it('stat с именем __proto__ или constructor не портит объект', () => {
    const xml =
      '<PathOfBuilding><Build level="5" className="Witch" targetVersion="3_0">' +
      '<PlayerStat stat="__proto__" value="1"/><PlayerStat stat="constructor" value="2"/><PlayerStat stat="Life" value="100"/>' +
      '</Build></PathOfBuilding>'
    const r = parsePobXml(xml)
    if (!r.ok) throw new Error(r.error)
    expect(Object.getPrototypeOf(r.build.stats)).toBe(Object.prototype)
    expect(r.build.stats.Life).toBe(100)
    expect(Object.prototype.hasOwnProperty.call(r.build.stats, '__proto__')).toBe(false)
  })
})

describe('модель: PoE 2', () => {
  it.each(POE2_FIXTURES)('%s — «это билд PoE 2»', (name) => {
    expect(parsePobXml(fixtureXml(name))).toEqual({ ok: false, error: 'poe2' })
  })

  it('PoE 2 по targetVersion 0_x и по treeVersion при корне PathOfBuilding', () => {
    expect(parsePobXml('<PathOfBuilding><Build targetVersion="0_1"/></PathOfBuilding>')).toEqual({ ok: false, error: 'poe2' })
    expect(
      parsePobXml('<PathOfBuilding><Build targetVersion="3_0"/><Tree><Spec treeVersion="0_3" nodes=""/></Tree></PathOfBuilding>')
    ).toEqual({ ok: false, error: 'poe2' })
  })
})

describe('importPobCode: код → билд + этапы', () => {
  it('настоящий код', () => {
    const r = importPobCode(fixtureCode('pobbin-acts-level-gems'), inflateNode)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.build.className).toBe('Witch')
      expect(r.stages.stages.length).toBe(10)
      expect(r.source).toEqual({ kind: 'code' })
    }
  })

  it('ошибки: пусто, мусор, PoE 2, не PathOfBuilding', () => {
    expect(importPobCode('  ', inflateNode)).toEqual({ ok: false, error: 'empty' })
    expect(importPobCode('hello world', inflateNode)).toEqual({ ok: false, error: 'not-pob' })
    expect(importPobCode(fixtureCode('poe2-pobbin-amazon'), inflateNode)).toEqual({ ok: false, error: 'poe2' })
    expect(importPobCode(encodePob('<?xml version="1.0"?><Other/>'), inflateNode)).toMatchObject({ ok: false, error: 'not-pob' })
  })
})
