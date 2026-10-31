import { describe, expect, it } from 'vitest'
import { BUILDS2_MAX, addBuild2, emptyLibrary2, findBuild2, openBuild2, parseLibrary2, removeBuild2, replaceCode2, type StoredBuild2 } from '@shared/poe2/build/library'
import { build2Summary, sameTreeVersion } from '@shared/poe2/build/view'
import { resolveStages2 } from '@shared/poe2/build/stages'
import { parseInstillData } from '@shared/poe2/build/instill'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DATA2, POB2_FIXTURES, gems, pob2, tree } from './helpers'

// Библиотека билдов PoE 2 (S66): хранится код, а не модель; файл с диска — недоверенный. Сводка для экрана.

const entry = (id: string, code = POB2_FIXTURES.amazon()): StoredBuild2 => ({ id, code, source: { kind: 'code' }, importedAt: 1 })

describe('библиотека', () => {
  it('добавить, открыть, удалить; тот же код — наверх без дубля; не больше BUILDS2_MAX', () => {
    let lib = addBuild2(emptyLibrary2(), entry('aaaaaa'))
    lib = addBuild2(lib, entry('bbbbbb', POB2_FIXTURES.stormweaver()))
    expect(lib.builds.map((b) => b.id)).toEqual(['bbbbbb', 'aaaaaa'])
    expect(lib.active).toBe('bbbbbb')
    lib = addBuild2(lib, entry('cccccc'))
    expect(lib.builds.map((b) => b.id)).toEqual(['cccccc', 'bbbbbb'])
    expect(openBuild2(lib, 'nope').active).toBeNull()
    expect(removeBuild2(lib, 'cccccc')).toMatchObject({ active: null, builds: [{ id: 'bbbbbb' }] })
    expect(findBuild2(replaceCode2(lib, 'bbbbbb', 'eNxyz')!, 'bbbbbb')?.code).toBe('eNxyz')
    let big = emptyLibrary2()
    for (let i = 0; i < BUILDS2_MAX + 3; i++) big = addBuild2(big, entry(`id${String(i).padStart(4, '0')}`, `eN${i}`))
    expect(big.builds).toHaveLength(BUILDS2_MAX)
  })

  it('файл с диска: мусор, чужие адреса и сайты отбрасываются', () => {
    const lib = parseLibrary2({
      v: 1,
      active: 'aaaaaa',
      builds: [
        { id: 'aaaaaa', code: 'eNabc', source: { kind: 'link', site: 'pobbin', pageUrl: 'https://pobb.in/cfGX8dxpObcW' }, importedAt: 5 },
        { id: 'bbbbbb', code: 'eNabc', source: { kind: 'link', site: 'evil', pageUrl: 'https://evil.example/x' }, importedAt: 5 },
        { id: '../x', code: 'eNabc' },
        { id: 'cccccc', code: 'не код' },
        { id: 'dddddd', code: 'eNabc', source: { kind: 'link', site: 'pobbin', pageUrl: 'javascript:alert(1)' } },
        { id: 'aaaaaa', code: 'eNdup' }
      ]
    })
    expect(lib.builds.map((b) => [b.id, b.source.kind])).toEqual([
      ['aaaaaa', 'link'],
      ['bbbbbb', 'code'],
      ['dddddd', 'code']
    ])
    expect(lib.active).toBe('aaaaaa')
    expect(parseLibrary2({ v: 2, builds: [] })).toEqual(emptyLibrary2())
    expect(parseLibrary2(null)).toEqual(emptyLibrary2())
  })
})

describe('сводка для экрана', () => {
  const instill = parseInstillData(JSON.parse(readFileSync(join(DATA2, 'build/instill.json'), 'utf8')))

  it('прокачка: этапы, новые ноды, камни, главное умение, вложение', () => {
    const b = pob2('leveling-amazon')
    const s = build2Summary({ id: 'x1x1x1', source: { kind: 'code' }, importedAt: 1 }, b, resolveStages2(b, tree), tree, gems, instill)
    expect(s.ascendancy).toEqual({ id: 'Huntress1', en: 'Amazon', ru: 'Амазонка' })
    expect(s.defaultName).toEqual({ ru: 'Амазонка — Внезапный удар', en: 'Amazon — Flicker Strike' })
    expect(s.stages.map((x) => [x.title, x.from, x.to, x.points, x.added])).toEqual([
      ['Act 1', 1, 31, 14, 14],
      ['Act 3', 32, 64, 49, 35],
      // одна нода автора из другой версии дерева в данных не найдена — её не считаем
      ['Endgame', 65, 100, 149, 100]
    ])
    expect(s.stages[0].skills.length).toBeGreaterThan(0)
    expect(s.stages[0].skills.length).toBeLessThan(s.stages[2].skills.length)
    expect(s.stages[2].skills.some((x) => x.main && x.ru === 'Внезапный удар')).toBe(true)
    expect(s.stages[2].key.length).toBeGreaterThan(0)
    expect(s.stages.map((x) => x.items)).toEqual([2, 2, 9])
    expect(s.instill).toEqual({ hash: 27704, name: 'Grace of the Ancestors' })
    expect(s.report.passives).toBeGreaterThan(100)
    expect(s.treeVersion).toEqual({ pob: '0_5', data: '0.5.5' })
  })

  it('версии дерева', () => {
    expect(sameTreeVersion('0_5', '0.5.5')).toBe(true)
    expect(sameTreeVersion('0_4', '0.5.5')).toBe(false)
    expect(sameTreeVersion('', '0.5.5')).toBe(true)
  })
})
