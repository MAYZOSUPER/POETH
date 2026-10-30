import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { detectItemLang } from '@shared/poe2/data'
import { DATA_DIR, store } from './helpers'

// Данные PoE2 из Exiled Exchange 2 (tools/data/sync-ee2-data.mjs): пин, sha256 файлов, поиск EN и RU.

describe('данные PoE2: data.meta.json', () => {
  const meta = JSON.parse(readFileSync(resolve(DATA_DIR, 'data.meta.json'), 'utf8')) as {
    ee2Repo: string
    ee2Sha: string
    langs: string[]
    files: Record<string, string>
  }

  it('пин EE2 и оба языка', () => {
    expect(meta.ee2Repo).toBe('Kvan7/Exiled-Exchange-2')
    expect(meta.ee2Sha).toMatch(/^[0-9a-f]{40}$/)
    expect(meta.langs).toEqual(['en', 'ru'])
  })

  it('sha256 каждого файла совпадает', () => {
    for (const [rel, hash] of Object.entries(meta.files)) {
      expect(createHash('sha256').update(readFileSync(resolve(DATA_DIR, rel))).digest('hex'), rel).toBe(hash)
    }
  })
})

describe('данные PoE2: поиск', () => {
  it('EN: база, уник, стат по строке и по ref', async () => {
    const en = await store.ensureLanguage('en')
    expect(en.itemByTranslated('ITEM', 'Corsair Cap')?.[0].refName).toBe('Corsair Cap')
    expect(en.statByMatchStr('#% increased Rarity of Items found')?.stat.trade.ids.explicit).toBeDefined()
    expect(en.statByRef('# to maximum Life')?.ref).toBe('# to maximum Life')
    expect(en.refStrings).toBe(en.strings)
    expect(en.strings.ITEM_CLASS).toBe('Item Class: ')
  })

  it('RU: те же stat id, английское имя базы, EN-строки клиента рядом', async () => {
    const [en, ru] = await Promise.all([store.ensureLanguage('en'), store.ensureLanguage('ru')])
    const enLife = en.statByRef('# to maximum Life')!
    const ruLife = ru.statByRef('# to maximum Life')!
    expect(ruLife.trade.ids).toEqual(enLife.trade.ids)
    const ruMatcher = ruLife.matchers[0].string
    expect(ru.statByMatchStr(ruMatcher)?.stat.ref).toBe('# to maximum Life')
    const cap = en.itemByRef('ITEM', 'Corsair Cap')!
    const ruName = ru.itemByRef('ITEM', 'Corsair Cap')![0].name
    expect(ruName).not.toBe('Corsair Cap')
    expect(ru.itemByTranslated('ITEM', ruName)?.[0].refName).toBe(cap[0].refName)
    expect(ru.strings.ITEM_CLASS).toBe('Класс предмета: ')
    expect(ru.refStrings.ITEM_CLASS).toBe('Item Class: ')
  })

  it('RU: согласованное мн. число находит строку с «(-ы)»', async () => {
    const ru = await store.ensureLanguage('ru')
    const plural = [...ru.statsIterator('секунд(-ы)')][0]
    const canonical = plural.matchers.find((m) => m.string.includes('секунд(-ы)'))!.string
    expect(ru.statByMatchStr(canonical.replace('секунд(-ы)', 'секунды'))?.stat.ref).toBe(plural.ref)
  })

  it('руны: свойства по trade id', async () => {
    const en = await store.ensureLanguage('en')
    const { byTradeId, byAugment } = en.augments()
    expect(Object.keys(byAugment).length).toBeGreaterThan(20)
    expect(Object.keys(byTradeId).length).toBeGreaterThan(10)
  })

  it('язык текста — по первой строке', () => {
    expect(detectItemLang('Item Class: Helmets\nRarity: Magic')).toBe('en')
    expect(detectItemLang('Класс предмета: Шлемы\nРедкость: Волшебный')).toBe('ru')
  })
})
