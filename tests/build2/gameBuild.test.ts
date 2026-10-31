import { describe, expect, it } from 'vitest'
import { findGem } from '@shared/poe2/build/data'
import {
  GAME_BUILD_VERSION,
  cleanBuildName,
  defaultBuildName,
  itemHead,
  nodeOrder,
  plainHint,
  serializeGameBuild,
  toGameBuild,
  type GameBuildFile,
  type ItemNames
} from '@shared/poe2/build/gameBuild'
import { resolveStages2 } from '@shared/poe2/build/stages'
import { NODE_FLAG } from '@shared/poe2/build/data'
import { POB2_FIXTURES, gems, pob2, tree } from './helpers'

// PoB2 → игровой `.build` (S66): снапшоты файлов (tests/build2/__snapshots__/*.build — так файл увидит игра) для
// трёх настоящих кодов и сборной фикстуры прокачки; проверки формата GGG «Version 1 (Experimental)».

/** RU-имена предметов как из данных EE2 (в main — resources/data/poe2/ru/items.ndjson). */
const RU_ITEMS: ItemNames = {
  unique: (en) => ({ Reverie: 'Грёзы', Mageblood: 'Магическая кровь' })[en] ?? null,
  base: (en) => ({ 'Absent Amulet': 'Отсутствующий амулет' })[en] ?? null
}

function exportOf(name: string, lang: 'ru' | 'en' = 'ru') {
  const b = pob2(name)
  const plan = resolveStages2(b, tree)
  return toGameBuild(b, plan, tree, gems, { name: defaultBuildName(b, tree, gems, lang), lang, items: lang === 'ru' ? RU_ITEMS : null, link: name === 'amazon' ? 'https://pobb.in/cfGX8dxpObcW' : null })
}

const ids = (list: GameBuildFile['passives']): string[] => (list ?? []).map((p) => (typeof p === 'string' ? p : p.id))
const LI = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) && x[0] <= x[1]
/** разметка `<тег>{текст}`: скобки сбалансированы, тегов не больше, чем `{` */
const markupOk = (s: string): boolean => {
  let depth = 0
  for (const c of s) {
    if (c === '{') depth++
    if (c === '}') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

describe('PoB2 → .build: снапшоты', () => {
  for (const name of Object.keys(POB2_FIXTURES)) {
    it(name, async () => {
      const { file, report } = exportOf(name)
      await expect(serializeGameBuild(file)).toMatchFileSnapshot(`./__snapshots__/${name}.ru.build`)
      expect(report.passives).toBeGreaterThan(100)
      expect(report.skills).toBeGreaterThan(5)
    })
  }

  it('amazon, подсказки EN', async () => {
    const { file } = exportOf('amazon', 'en')
    await expect(serializeGameBuild(file)).toMatchFileSnapshot('./__snapshots__/amazon.en.build')
  })
})

describe('формат GGG «Version 1 (Experimental)»', () => {
  it('версия формата — отдельной константой', () => {
    expect(GAME_BUILD_VERSION).toBe(1)
  })

  for (const name of Object.keys(POB2_FIXTURES)) {
    it(`${name}: id из данных игры, интервалы, разметка`, () => {
      const { file, report } = exportOf(name)
      expect(typeof file.name).toBe('string')
      expect(file.ascendancy).toMatch(/^[A-Z][a-z]+\d$/)
      const passiveIds = ids(file.passives)
      const byId = new Map([...tree.nodes.values()].map((n) => [n.id, n]))
      expect(new Set(passiveIds).size).toBe(passiveIds.length)
      for (const id of passiveIds) {
        const n = byId.get(id)
        expect(n, id).toBeTruthy()
        // стартовые ноды класса и восхождения даёт игра
        expect((n?.flags ?? 0) & (NODE_FLAG.classStart | NODE_FLAG.ascStart)).toBe(0)
        // восхождение — только своё
        if (n?.ascendancy) expect(n.ascendancy).toBe(file.ascendancy)
      }
      for (const p of file.passives ?? []) {
        if (typeof p === 'string') continue
        if (p.level_interval) expect(LI(p.level_interval)).toBe(true)
        if (p.weapon_set !== undefined) expect([0, 1, 2]).toContain(p.weapon_set)
        if (p.additional_text) expect(markupOk(p.additional_text)).toBe(true)
      }
      for (const s of file.skills ?? []) {
        const sk = typeof s === 'string' ? { id: s } : s
        expect(findGem(gems, sk.id)?.kind, sk.id).toBe('skill')
        if ('level_interval' in sk && sk.level_interval) expect(LI(sk.level_interval)).toBe(true)
        for (const p of ('support_skills' in sk ? sk.support_skills : undefined) ?? []) {
          const id = typeof p === 'string' ? p : p.id
          expect(findGem(gems, id)?.kind, id).toBe('support')
        }
      }
      for (const sl of file.inventory_slots ?? []) {
        expect(sl.inventory_id).toMatch(/^(Weapon|Offhand|Helm|BodyArmour|Gloves|Boots|Amulet|Ring|Belt)[12]$/)
        if (sl.level_interval) expect(LI(sl.level_interval)).toBe(true)
        if (sl.additional_text) expect(markupOk(sl.additional_text)).toBe(true)
      }
      expect(report.passives).toBe(passiveIds.length)
      // ничего личного: ни автора, ни аккаунта; ссылка — только на публичную пасту
      expect(file.author).toBeUndefined()
      const text = serializeGameBuild(file)
      expect(text).not.toMatch(/account|character|POESESSID/i)
      expect(() => JSON.parse(text)).not.toThrow()
    })
  }

  it('прокачка: ноды первого этапа — без интервала до конца, ноды «Act 3» — с 32, камни эндгейма — с 65', () => {
    const { file } = exportOf('leveling-amazon')
    const passives = (file.passives ?? []).map((p) => (typeof p === 'string' ? { id: p } : p))
    // порядок: сначала ноды «Act 1» (без интервала — они до конца), потом «Act 3» (с 32), потом эндгейм (с 65)
    const firsts = passives.map((p) => ('level_interval' in p && p.level_interval ? p.level_interval[0] : 1))
    expect([...firsts]).toEqual([...firsts].sort((a, b) => a - b))
    expect(firsts.filter((x) => x === 1)).toHaveLength(14)
    expect(firsts.filter((x) => x === 32).length).toBeGreaterThan(30)
    expect(firsts.filter((x) => x === 65).length).toBeGreaterThan(90)
    const skills = (file.skills ?? []).map((s) => (typeof s === 'string' ? { id: s } : s))
    expect(skills.filter((s) => !('level_interval' in s && s.level_interval))).toHaveLength(2)
    // оружие и нагрудник одни на всех этапах — без интервала; прочие слоты — с эндгейма
    const slots = file.inventory_slots ?? []
    expect(slots.filter((s) => !s.level_interval).map((s) => s.inventory_id)).toEqual(['Weapon1', 'BodyArmour1'])
  })

  it('подсказки: выбор атрибута, главное умение, уник — RU и EN', () => {
    const ru = serializeGameBuild(exportOf('amazon').file)
    const en = serializeGameBuild(exportOf('amazon', 'en').file)
    expect(ru).toContain('Выберите: <b>{Ловкость}')
    expect(ru).toContain('<b>{Главное умение билда}')
    expect(ru).toContain('"unique_name": "Reverie"')
    expect(ru).toContain('<unique>{Грёзы}')
    expect(ru).toContain('<yellow>{Редкий: Отсутствующий амулет}')
    expect(en).toContain('Choose: <b>{Dexterity}')
    expect(en).toContain('<b>{Main skill of the build}')
    expect(en).toContain('<unique>{Reverie}')
  })

  it('пропуски: атаки оружия, умения предметов и мета-камни — в отчёт, не в файл', () => {
    const { file, report } = exportOf('stormweaver')
    expect(report.metaGems).toContain('Cast on Critical')
    expect(report.skippedGroups).toBeGreaterThan(0)
    expect(JSON.stringify(file)).not.toContain('PlayerDefault')
  })
})

describe('мелочи', () => {
  it('порядок нод: от стартовой ноды класса по связям', () => {
    const spec = pob2('amazon').specs[0]
    const order = nodeOrder(spec, tree)
    const start = tree.starts.get(spec.classId) as number
    expect(tree.nodes.get(start)?.near).toContain(order[0])
  })

  it('название билда и подсказки — без разметки и управляющих символов', () => {
    expect(cleanBuildName('  Амазонка\n— Удар  ')).toBe('Амазонка — Удар')
    expect(cleanBuildName('')).toBe('PoE 2 build')
    expect(cleanBuildName('x'.repeat(200))).toHaveLength(80)
    expect(plainHint('<red>{Взлом}')).toBe('redВзлом')
    expect(defaultBuildName(pob2('amazon'), tree, gems, 'ru')).toBe('Амазонка — Внезапный удар')
    expect(defaultBuildName(pob2('amazon'), tree, gems, 'en')).toBe('Amazon — Flicker Strike')
  })

  it('шапка предмета PoB2', () => {
    expect(itemHead({ id: 1, text: 'Rarity: UNIQUE\nReverie\nRunemastered Shaman Mantle\nItem Level: 82' })).toEqual({ rarity: 'UNIQUE', name: 'Reverie', base: 'Runemastered Shaman Mantle' })
    expect(itemHead({ id: 1, text: 'Rarity: NORMAL\nLeather Vest' })).toEqual({ rarity: 'NORMAL', name: null, base: 'Leather Vest' })
    expect(itemHead({ id: 1, text: 'Rarity: MAGIC\nHale Leather Vest of the Fox' })).toEqual({ rarity: 'MAGIC', name: null, base: null })
    expect(itemHead({ id: 1, text: 'Something' })).toBeNull()
  })
})
