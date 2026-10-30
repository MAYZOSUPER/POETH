import { describe, expect, it } from 'vitest'
import {
  RAIL_INLINE_MIN,
  RAIL_KEY,
  railStep,
  railWide,
  readRailPref,
  resolveTab,
  sectionOf,
  sectionsFor,
  tabHintKey,
  tabsFor,
  writeRailPref
} from '@renderer/tabs'
import { DOMAIN_DICTS } from '../../src/renderer/src/i18n/dicts'
import { GAME_IDS } from '@shared/games'

// Рельс слева (S20): разделы и порядок вкладок — данные tabs.ts, а не разметка.

const ids = (game: 'poe1' | 'poe2', dev = false): string[][] => sectionsFor(game, dev).map((s) => s.tabs.map((t) => t.id))

describe('разделы рельса', () => {
  it('PoE 1 (советник и «Билд» раскрыты): «Что фармить» первой в «Фарме», «Билд» после «Кампании», «Справочник» внизу (S55)', () => {
    expect(sectionsFor('poe1', false).map((s) => s.id)).toEqual(['trade', 'farm', 'level', 'help'])
    expect(ids('poe1')).toEqual([['priceCheck', 'live', 'deals', 'flip'], ['advisor', 'wealth', 'regex'], ['campaign', 'build'], ['guide']])
    expect(ids('poe1', true)).toEqual(ids('poe1'))
  })

  it('PoE 2: только прайс-чек и компас, пустые «Фарм» и «Помощь» не показываются — и с флагом советника тоже', () => {
    for (const dev of [false, true]) {
      expect(sectionsFor('poe2', dev).map((s) => s.id)).toEqual(['trade', 'level'])
      expect(ids('poe2', dev)).toEqual([['priceCheck'], ['campaign']])
    }
  })

  it('tabsFor — вкладки подряд в порядке рельса', () => {
    expect(tabsFor('poe1', false).map((t) => t.id)).toEqual(['priceCheck', 'live', 'deals', 'flip', 'advisor', 'wealth', 'regex', 'campaign', 'build', 'guide'])
    expect(tabsFor('poe2', true).map((t) => t.id)).toEqual(['priceCheck', 'campaign'])
  })

  it('каждая вкладка ровно в одном разделе, у каждой своя иконка', () => {
    const all = tabsFor('poe1', true)
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
    expect(new Set(all.map((t) => t.icon)).size).toBe(all.length)
  })

  it('sectionOf — раздел из самой вкладки', () => {
    expect(sectionOf('priceCheck')).toBe('trade')
    expect(sectionOf('flip')).toBe('trade')
    expect(sectionOf('advisor')).toBe('farm')
    expect(sectionOf('regex')).toBe('farm')
    expect(sectionOf('campaign')).toBe('level')
    expect(sectionOf('guide')).toBe('help')
  })
})

describe('resolveTab', () => {
  it('вкладка есть в игре — она и открывается', () => {
    expect(resolveTab('poe1', 'flip', false)).toBe('flip')
    expect(resolveTab('poe2', 'priceCheck', false)).toBe('priceCheck')
  })

  it('нет в игре — «Кампания», как до рельса', () => {
    expect(resolveTab('poe2', 'live', false)).toBe('campaign')
    expect(resolveTab('poe2', 'advisor', false)).toBe('campaign')
    expect(resolveTab('poe1', 'advisor', false)).toBe('advisor')
    expect(resolveTab('poe1', undefined, false)).toBe('campaign')
  })

  it('советник с флагом открывается', () => {
    expect(resolveTab('poe1', 'advisor', true)).toBe('advisor')
  })
})

describe('строки рельса', () => {
  const ru: Record<string, string> = {}
  const en: Record<string, string> = {}
  for (const d of Object.values(DOMAIN_DICTS)) {
    Object.assign(ru, d.ru)
    Object.assign(en, d.en)
  }

  it('названия разделов и вкладок, подсказки — в RU и EN', () => {
    const keys = new Set<string>()
    for (const game of GAME_IDS) {
      for (const s of sectionsFor(game, true)) {
        keys.add(s.key)
        for (const t of s.tabs) {
          keys.add(t.key)
          keys.add(tabHintKey(t.id, game))
        }
      }
    }
    const missing = [...keys].filter((k) => !ru[k] || !en[k])
    expect(missing).toEqual([])
  })

  it('у компаса PoE 2 своя подсказка', () => {
    expect(tabHintKey('campaign', 'poe2')).not.toBe(tabHintKey('campaign', 'poe1'))
  })
})

describe('рельс: свёрнут / развёрнут', () => {
  it('на узком окне рядом с содержимым всегда свёрнут', () => {
    for (const pref of [null, 'wide', 'narrow'] as const) {
      expect(railWide(false, pref, true)).toBe(false)
      expect(railWide(false, pref, false)).toBe(false)
    }
  })

  it('на широком без выбора: простой режим — развёрнут, эксперт — свёрнут', () => {
    expect(railWide(true, null, true)).toBe(true)
    expect(railWide(true, null, false)).toBe(false)
  })

  it('выбор пользователя важнее режима', () => {
    expect(railWide(true, 'narrow', true)).toBe(false)
    expect(railWide(true, 'wide', false)).toBe(true)
  })

  it('выбор хранится в localStorage под poeth.nav.rail, мусор и ошибки хранилища — «не выбран»', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    expect(readRailPref(storage)).toBeNull()
    writeRailPref(storage, 'narrow')
    expect(mem.get(RAIL_KEY)).toBe('narrow')
    expect(RAIL_KEY).toBe('poeth.nav.rail')
    expect(readRailPref(storage)).toBe('narrow')
    mem.set(RAIL_KEY, 'huge')
    expect(readRailPref(storage)).toBeNull()
    const broken = {
      getItem: () => {
        throw new Error('нет доступа')
      },
      setItem: () => {
        throw new Error('нет доступа')
      }
    }
    expect(readRailPref(broken)).toBeNull()
    expect(() => writeRailPref(broken, 'wide')).not.toThrow()
    expect(readRailPref(undefined)).toBeNull()
  })

  it('с 820 px окна развёрнутый рельс стоит рядом', () => {
    expect(RAIL_INLINE_MIN).toBe(820)
  })
})

describe('рельс: клавиатура', () => {
  it('стрелки по кругу, Home и End', () => {
    expect(railStep(0, 'ArrowDown', 3)).toBe(1)
    expect(railStep(2, 'ArrowDown', 3)).toBe(0)
    expect(railStep(0, 'ArrowUp', 3)).toBe(2)
    expect(railStep(1, 'Home', 3)).toBe(0)
    expect(railStep(0, 'End', 3)).toBe(2)
  })

  it('чужие клавиши и пустой рельс — null', () => {
    expect(railStep(0, 'Enter', 3)).toBeNull()
    expect(railStep(0, 'ArrowLeft', 3)).toBeNull()
    expect(railStep(0, 'ArrowDown', 0)).toBeNull()
  })
})
