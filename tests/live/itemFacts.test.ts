import { describe, expect, it } from 'vitest'
import { factsFromText } from '../../src/renderer/src/overlay/live/itemFacts'
import { readFixture, store } from '../poe1/helpers'

// Факты для тоста находки — разбор item.extended.text парсером S2 на тех же фикстурах EN/RU.
// Текст с трейда приходит с \r\n — проверяем и это.

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n')
const keys = (f: { key: string }[]) => f.map((x) => x.key)

describe('факты о предмете для тоста live', () => {
  it('карта: тир (EN и RU одинаково)', async () => {
    for (const lang of ['en', 'ru'] as const) {
      const f = await factsFromText(crlf(readFixture(lang, 'adv-map')), store)
      expect(f[0], lang).toEqual({ key: 'live.fact.mapTier', params: { n: 16 } })
    }
  })

  it('осквернённый уник: уровень предмета и «осквернён»', async () => {
    for (const lang of ['en', 'ru'] as const) {
      const f = await factsFromText(crlf(readFixture(lang, 'adv-unique-corrupted')), store)
      expect(keys(f), lang).toContain('live.fact.corrupted')
      expect(keys(f), lang).toContain('live.fact.ilvl')
    }
  })

  it('камень: уровень и качество', async () => {
    const f = await factsFromText(crlf(readFixture('en', 'gem-01')), store)
    expect(f[0].key).toBe('live.fact.gem')
  })

  it('не предмет — пусто, без исключений', async () => {
    expect(await factsFromText('hello', store)).toEqual([])
    expect(await factsFromText('Item Class: Belts\r\nRarity: Unique', store)).toEqual([])
  })
})
