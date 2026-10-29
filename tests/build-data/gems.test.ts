import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  BUILD_GEMS_FILE,
  baseGem,
  findGem,
  gemAttribute,
  gemByGameId,
  gemName,
  gemRequiredLevel,
  gemSources,
  gemWhere,
  parseGemsData
} from '@shared/build/data'
import type { GemsData } from '@shared/build/types'
import type { LevelingData } from '@shared/types/leveling'

// Камни PoE1 3.29 (resources/data/poe1/build/gems.json, генератор tools/build-data/gems.mjs): ключи как в коде
// PoB, имена EN/RU, уровни требований, «где взять» классу на уровне — по наградам и продавцам маршрута гида.

const DATA = resolve(__dirname, '../../resources/data/poe1')
const raw = JSON.parse(readFileSync(resolve(DATA, BUILD_GEMS_FILE), 'utf8'))
const gems = parseGemsData(raw) as GemsData
const leveling = JSON.parse(readFileSync(resolve(DATA, 'leveling/leveling.json'), 'utf8')) as LevelingData
const P = 'Metadata/Items/Gems/SkillGem'

describe('gems.json', () => {
  it('разбирается; формат новее или чужой файл — null', () => {
    expect(gems).not.toBeNull()
    expect(gems.gems.size).toBe(gems.meta.gems)
    expect(gems.gems.size).toBeGreaterThan(800)
    expect(parseGemsData({ ...raw, v: 2 })).toBeNull()
    expect(parseGemsData([])).toBeNull()
  })

  it('камень по ключу PoB и skillId, по id предмета (как в leveling.json) — отдельно', () => {
    const bf = findGem(gems, `${P}BladeFlurry`)!
    expect(bf).toMatchObject({ en: 'Blade Flurry', ru: 'Порыв клинков', gameId: 'Metadata/Items/Gems/SkillGemChargedAttack', color: 'g' })
    expect(gemByGameId(gems, 'Metadata/Items/Gems/SkillGemChargedAttack')).toBe(bf)
    expect(findGem(gems, 'Metadata/Items/Gems/SkillGemChargedAttack')).toBeNull()
    expect(findGem(gems, 'BladeFlurry')).toBe(bf)
    // один и тот же id — у PoB это ключ Vulnerability, у игры — предмет Despair
    expect(findGem(gems, `${P}Vulnerability`)!.en).toBe('Vulnerability')
    expect(gemByGameId(gems, 'Metadata/Items/Gems/SkillGemVulnerability')!.en).toBe('Despair')
    // поддержка: ключ PoB «SkillGem» + variantId, id предмета — SupportGem…, skillId с другим регистром
    const aoe = findGem(gems, `${P}SupportIncreasedAreaofEffect`)!
    expect(aoe).toMatchObject({ support: true, skillId: 'SupportIncreasedAreaOfEffect', gameId: 'Metadata/Items/Gems/SupportGemIncreasedAreaOfEffect' })
    expect(gemByGameId(gems, 'Metadata/Items/Gems/SupportGemIncreasedAreaOfEffect')).toBe(aoe)
    expect(gemName(aoe, 'ru')).toBe('Поддержка: Расширенная область действия')
    expect(findGem(gems, 'Metadata/Items/Gems/SkillGemNoSuchGem')).toBeNull()
  })

  it('каждый камень гида прокачки находится, имена совпадают с leveling.json', () => {
    for (const [id, g] of Object.entries(leveling.gems)) {
      const gem = gemByGameId(gems, id)
      expect(gem, id).not.toBeNull()
      expect(gem!.en, id).toBe(g.en)
      expect(gem!.ru, id).toBe(g.ru)
    }
  })

  it('трансфигурированные: свой ключ и имя, базовый камень — по id предмета', () => {
    const alt = findGem(gems, `${P}IceNovaAltX`)!
    expect(alt).toMatchObject({ en: 'Ice Nova of Frostbolts', ru: 'Кольцо льда морозных шаров', transfigured: true, sources: [] })
    expect(baseGem(gems, alt).gemId).toBe(`${P}IceNova`)
    expect(gemByGameId(gems, 'Metadata/Items/Gems/SkillGemIceNova')!.gemId).toBe(`${P}IceNova`)
    expect(findGem(gems, `${P}BladefallAltZ`)).toMatchObject({ en: 'Bladefall of Trarthus', ru: 'Мечепад Тератны' })
  })

  it('уровень требований по уровням камня, атрибут по цвету', () => {
    const fb = findGem(gems, `${P}Fireball`)!
    expect(gemRequiredLevel(fb, 1)).toBe(leveling.gems['Metadata/Items/Gems/SkillGemFireball'].lvl)
    expect(gemRequiredLevel(fb, 20)).toBe(70)
    expect(gemRequiredLevel(fb, 99)).toBe(fb.req[fb.req.length - 1])
    const nova = findGem(gems, `${P}IceNova`)!
    expect(gemRequiredLevel(nova)).toBe(12)
    expect(gemAttribute(nova)).toBe('intelligence')
    expect(gemAttribute(findGem(gems, `${P}Cleave`)!)).toBe('strength')
    expect(findGem(gems, `${P}VaalFireball`)).toMatchObject({ vaal: true })
  })

  it('где взять: Огненный шар — Ведьме у Нессы после «Враг у ворот», Охотнице — у Сиосы в 3 акте', () => {
    const witch = gemWhere(gems, `${P}Fireball`, 'Witch', 5)!
    expect(witch).toMatchObject({ available: true, usable: true, usableFrom: 1, viaBase: null })
    expect(witch.source).toMatchObject({ kind: 'vendor', questId: 'a1q1', questRu: 'Враг у ворот', npcEn: 'Nessa', npcRu: 'Несса' })
    const ranger = gemWhere(gems, `${P}Fireball`, 'Ranger', 5)!
    expect(ranger.source).toMatchObject({ kind: 'vendor', questId: 'a3q12', npcEn: 'Siosa', npcRu: 'Сиоса' })
    expect(ranger.available).toBe(false)
    expect(gemWhere(gems, `${P}Fireball`, 'Ranger', 40)!.available).toBe(true)
  })

  it('где взять: Едкая стрела — Охотнице наградой Таркли, Дуэлянту — у Нессы, Ведьме — у Сиосы', () => {
    const id = gemByGameId(gems, 'Metadata/Items/Gems/SkillGemPoisonArrow')! // как в leveling.json
    expect(gemWhere(gems, id, 'Ranger', 2)!.source).toMatchObject({ kind: 'quest', questId: 'a1q1', npcEn: 'Tarkleigh', npcRu: 'Таркли' })
    expect(gemWhere(gems, id, 'Duelist', 2)!.source).toMatchObject({ kind: 'vendor', questId: 'a1q1', npcEn: 'Nessa' })
    expect(gemWhere(gems, id, 'Witch', 2)!.source).toMatchObject({ kind: 'vendor', questId: 'a3q12', npcEn: 'Siosa' })
    // рано: квест Сиосы ещё не сдан — источник «следующий», недоступен
    expect(gemWhere(gems, id, 'Witch', 2)!.available).toBe(false)
    // Рассечение Дикарю — у Нессы сразу после первого квеста
    expect(gemWhere(gems, `${P}Cleave`, 'Marauder', 1)).toMatchObject({ available: true, source: { kind: 'vendor', npcEn: 'Nessa' } })
  })

  it('где взять трансфигурированный — у базового камня; камень не из кампании — нет источника', () => {
    const w = gemWhere(gems, `${P}IceNovaAltX`, 'Witch', 20)!
    expect(w.viaBase?.gemId).toBe(`${P}IceNova`)
    expect(w.source).toMatchObject({ questId: 'a1q3' })
    expect(w.usableFrom).toBe(12)
    expect(gemWhere(gems, `${P}IceNovaAltX`, 'Witch', 10)!.usable).toBe(false)
    const enlighten = gemWhere(gems, `${P}SupportEnlighten`, 'Witch', 70)!
    expect(enlighten.source).toBeNull()
    expect(gemSources(gems, enlighten.gem, 'Witch')).toEqual([])
    expect(gemWhere(gems, 'Metadata/Items/Gems/SkillGemNoSuchGem', 'Witch', 1)).toBeNull()
  })

  it('уровень квестов по маршруту растёт с актами', () => {
    const fb = findGem(gems, `${P}Fireball`)!
    const levels = fb.sources.map((s) => s.level ?? 0)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    expect(fb.sources.at(-1)).toMatchObject({ questId: 'a6q4', npcEn: 'Lilly Roth', classes: [] })
  })
})
