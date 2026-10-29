import { beforeAll, describe, expect, it } from 'vitest'
import type { LiveHit, LiveRarity } from '@shared/types'
import type { Poe1Data } from '@shared/poe1/data'
import { hitNameIn, hitNeedsTranslation, nameInGame } from '../../src/renderer/src/panels/live/names'
import { store } from '../poe1/helpers'

// Имя находки live на языке клиента игры (S31): сайт трейда (www — EN, ru — RU) × клиент игры (EN/RU).
// Уник, база, камень, карта судьбы, валюта — по данным APT; имя редкого и магическое с аффиксами — как пришло.

let ru: Poe1Data
beforeAll(async () => {
  ru = await store.ensureLanguage('ru')
})

const hit = (rarity: LiveRarity, name: string, typeLine: string): LiveHit => ({
  key: 's:1',
  itemId: 'abcdef1234',
  searchId: 's',
  searchTitle: 'поиск',
  league: 'Mercenaries',
  at: 0,
  name,
  typeLine,
  rarity,
  mods: [],
  merchant: false,
  siteUrl: 'https://www.pathofexile.com/trade/search/Mercenaries/s',
  whisper: '@seller Hi, I would like to buy your Headhunter Leather Belt listed for 100 divine in Mercenaries'
})

// одна и та же находка с сайта www (EN) и ru (RU)
const CASES: { what: string; en: LiveHit; ru: LiveHit; inEn: string; inRu: string }[] = [
  {
    what: 'уник',
    en: hit('unique', 'Headhunter', 'Leather Belt'),
    ru: hit('unique', 'Охотник за головами', 'Ремень'),
    inEn: 'Headhunter Leather Belt',
    inRu: 'Охотник за головами Ремень'
  },
  {
    what: 'валюта',
    en: hit('currency', '', 'Chaos Orb'),
    ru: hit('currency', '', 'Сфера хаоса'),
    inEn: 'Chaos Orb',
    inRu: 'Сфера хаоса'
  },
  {
    what: 'камень (преображённый)',
    en: hit('gem', '', 'Lightning Arrow of Electrocution'),
    ru: hit('gem', '', 'Стрела молнии проводимости'),
    inEn: 'Lightning Arrow of Electrocution',
    inRu: 'Стрела молнии проводимости'
  },
  {
    what: 'карта судьбы',
    en: hit('divination', '', 'The Doctor'),
    ru: hit('divination', '', 'Доктор'),
    inEn: 'The Doctor',
    inRu: 'Доктор'
  }
]

describe('имя находки: сайт × клиент', () => {
  for (const c of CASES) {
    it.each([
      ['en', 'en'],
      ['en', 'ru'],
      ['ru', 'en'],
      ['ru', 'ru']
    ] as const)(`${c.what}: сайт %s, клиент %s`, (site, game) => {
      expect(hitNameIn(site === 'en' ? c.en : c.ru, game, ru)).toBe(game === 'en' ? c.inEn : c.inRu)
    })
  }

  it('редкий: случайное имя — как пришло, база — на языке клиента', () => {
    expect(hitNameIn(hit('rare', 'Doom Coil', 'Leather Belt'), 'ru', ru)).toBe('Doom Coil Ремень')
    expect(hitNameIn(hit('rare', 'Роковая петля', 'Ремень'), 'en', ru)).toBe('Роковая петля Leather Belt')
  })

  it('магический с аффиксами и неизвестное — как пришло', () => {
    expect(hitNameIn(hit('magic', '', 'Bubbling Large Life Flask of Staunching'), 'ru', ru)).toBe('Bubbling Large Life Flask of Staunching')
    expect(hitNameIn(hit('unique', 'Nonexistent Thing', 'Leather Belt'), 'ru', ru)).toBe('Nonexistent Thing Ремень')
    expect(nameInGame('Сфера хаоса', ['GEM'], 'en', ru)).toBe('Сфера хаоса')
  })

  it('данные ещё не загружены — как пришло; без имени — начало id', () => {
    expect(hitNameIn(CASES[0].en, 'ru', null)).toBe('Headhunter Leather Belt')
    expect(hitNameIn(hit('normal', '', ''), 'ru', ru)).toBe('abcdef12')
  })

  it('данные нужны, только когда язык сайта и клиента разный', () => {
    expect(hitNeedsTranslation(CASES[0].en, 'en')).toBe(false)
    expect(hitNeedsTranslation(CASES[0].en, 'ru')).toBe(true)
    expect(hitNeedsTranslation(CASES[0].ru, 'en')).toBe(true)
    expect(hitNeedsTranslation(CASES[0].ru, 'ru')).toBe(false)
    expect(hitNeedsTranslation(hit('normal', '', ''), 'ru')).toBe(false)
  })

  it('whisper не меняется: его текст даёт сайт', () => {
    const h = CASES[0].en
    hitNameIn(h, 'ru', ru)
    expect(h.whisper).toContain('Headhunter Leather Belt')
    expect(h.name).toBe('Headhunter')
  })
})
