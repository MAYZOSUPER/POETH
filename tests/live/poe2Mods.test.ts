import { beforeAll, describe, expect, it } from 'vitest'
import type { LiveHit } from '@shared/types'
import type { Poe2Data } from '@shared/poe2/data'
import { hitModsIn, hitModsNeedTranslation, poe2ModLineToRu } from '@shared/live/mods'
import { plainModText } from '../../src/main/games/poe1/live/hits'
import { store } from '../poe2/helpers'

// Моды находки live PoE 2 на языке клиента (S63): trade2 (www) отдаёт моды по-английски с разметкой ссылок —
// после plainModText строка переводится на RU по статам EE2; нет стата — английская строка как есть.
// Строки — description живых лотов trade2 (31.10.2026).

let en: Poe2Data
let ru: Poe2Data
beforeAll(async () => {
  ;[en, ru] = await Promise.all([store.ensureLanguage('en'), store.ensureLanguage('ru')])
})

const LIVE = [
  '+25% to [Resistances|Cold Resistance]',
  '+18 to [Dexterity|Dexterity]',
  '+78 to maximum Mana',
  '19% increased [ItemRarity|Rarity of Items] found',
  '30% increased Mana Regeneration Rate',
  'Adds 14 to 21 [Fire] damage to [Attack|Attacks]',
  '9% increased [SkillSpeed|Skill Speed]'
].map(plainModText)

const hit = (mods: string[], game?: 'poe2'): Pick<LiveHit, 'game' | 'mods'> => ({ mods, ...(game ? { game } : {}) })

describe('моды находки PoE 2 на языке клиента', () => {
  it('RU-клиент: строки живых лотов переводятся по статам EE2, числа на месте', () => {
    const out = hitModsIn(hit(LIVE, 'poe2'), 'ru', en, ru)
    expect(out).toHaveLength(LIVE.length)
    for (const [i, line] of out.entries()) {
      expect(line, LIVE[i]).toMatch(/[А-Яа-яЁё]/)
      // числа те же и в том же порядке
      expect(line.match(/\d+/g), LIVE[i]).toEqual(LIVE[i].match(/\d+/g))
    }
  })

  it('перевод одной строки — RU-шаблон того же стата', () => {
    const line = poe2ModLineToRu('+18 to Dexterity', en, ru)
    expect(line).toMatch(/^\+18 к ловкости$/i)
  })

  it('стата нет в данных — английская строка как есть', () => {
    const odd = 'Totally unknown modifier 42'
    expect(poe2ModLineToRu(odd, en, ru)).toBeNull()
    expect(hitModsIn(hit([odd, '+18 to Dexterity'], 'poe2'), 'ru', en, ru)).toEqual([odd, poe2ModLineToRu('+18 to Dexterity', en, ru)])
  })

  it('EN-клиент, PoE 1, данные не загружены, уже русские строки — без перевода', () => {
    expect(hitModsNeedTranslation(hit(LIVE, 'poe2'), 'en')).toBe(false)
    expect(hitModsIn(hit(LIVE, 'poe2'), 'en', en, ru)).toEqual(LIVE)
    expect(hitModsIn(hit(LIVE), 'ru', en, ru)).toEqual(LIVE)
    expect(hitModsIn(hit(LIVE, 'poe2'), 'ru', null, null)).toEqual(LIVE)
    const ruMods = ['+18 к ловкости']
    expect(hitModsNeedTranslation(hit(ruMods, 'poe2'), 'ru')).toBe(false)
    expect(hitModsIn(hit(ruMods, 'poe2'), 'ru', en, ru)).toEqual(ruMods)
  })
})
