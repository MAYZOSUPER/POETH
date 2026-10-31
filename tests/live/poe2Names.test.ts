import { beforeAll, describe, expect, it } from 'vitest'
import type { LiveHit, LiveRarity } from '@shared/types'
import type { Poe2Data } from '@shared/poe2/data'
import { hitNameIn, hitNeedsTranslation } from '@shared/live/names'
import { store } from '../poe2/helpers'

// Имя находки live PoE 2 на языке клиента (S63): trade2 для PoE 2 отдаёт английские имена (www), игрок с
// RU-клиентом видит в игре русские — переводим по RU-данным EE2 (тот же поиск, что у PoE 1 по данным APT).

let ru: Poe2Data
beforeAll(async () => {
  ru = await store.ensureLanguage('ru')
})

const hit = (rarity: LiveRarity, name: string, typeLine: string): LiveHit => ({
  key: 's:1',
  itemId: 'abcdef1234',
  searchId: 's',
  searchTitle: 'поиск',
  league: 'Standard',
  at: 0,
  name,
  typeLine,
  rarity,
  mods: [],
  merchant: true,
  siteUrl: 'https://www.pathofexile.com/trade2/search/poe2/Standard/s',
  game: 'poe2'
})

describe('имя находки PoE 2', () => {
  it('RU-клиент: уник и база — по данным EE2', () => {
    const h = hit('unique', 'Whisper of the Brotherhood', 'Sapphire Ring')
    expect(hitNeedsTranslation(h, 'ru')).toBe(true)
    expect(hitNameIn(h, 'ru', ru)).toBe('Шёпот братства Кольцо с сапфиром')
  })

  it('валюта и обычная база', () => {
    expect(hitNameIn(hit('currency', '', 'Exalted Orb'), 'ru', ru)).toBe('Сфера возвышения')
    expect(hitNameIn(hit('normal', '', 'Gold Ring'), 'ru', ru)).toBe('Золотое кольцо')
  })

  it('имя редкого — как пришло; EN-клиент — без перевода', () => {
    expect(hitNameIn(hit('rare', 'Chimeric Finger', 'Sapphire Ring'), 'ru', ru)).toBe('Chimeric Finger Кольцо с сапфиром')
    const h = hit('unique', 'Whisper of the Brotherhood', 'Sapphire Ring')
    expect(hitNeedsTranslation(h, 'en')).toBe(false)
    expect(hitNameIn(h, 'en', ru)).toBe('Whisper of the Brotherhood Sapphire Ring')
  })
})
