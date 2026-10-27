import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  ITEM_CLASS_PREFIX,
  POE1_LANGS,
  buildItemsIndexes,
  buildStatsIndexes,
  createPoe1DataStore,
  detectItemLang,
  fnv1a32,
  type DataFetch
} from '@shared/poe1/data'
import { ModifierType, matchStatLine, registeredStatRefs } from '@shared/poe1/parser'
import { DATA_DIR, diskFetch, store } from './helpers'

describe('fnv1a32', () => {
  it('совпадает с эталоном FNV-1a 32 (UTF-8)', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('hello')).toBe(0x4f9f2cab)
    // кириллица хэшируется по байтам UTF-8
    expect(fnv1a32('Кольцо')).toBe(fnv1a32(Buffer.from('Кольцо', 'utf8').toString()))
  })
})

describe('язык текста предмета', () => {
  it('по первой строке', () => {
    expect(detectItemLang('Item Class: Rings\nRarity: Rare')).toBe('en')
    expect(detectItemLang('﻿Класс предмета: Кольца\r\nРедкость: Редкий')).toBe('ru')
    expect(detectItemLang('  \nItem Class: Maps')).toBe('en')
    expect(detectItemLang('Gegenstandsklasse: Ringe')).toBeUndefined()
    expect(detectItemLang('')).toBeUndefined()
  })

  it('префиксы совпадают с ITEM_CLASS из client_strings', async () => {
    for (const lang of POE1_LANGS) {
      const d = await store.ensureLanguage(lang)
      expect(d.strings.ITEM_CLASS).toBe(ITEM_CLASS_PREFIX[lang])
      expect(d.strings.MAP_TIER).toBeInstanceOf(RegExp)
    }
  })
})

describe('data.meta.json и индексы', () => {
  const meta = JSON.parse(readFileSync(resolve(DATA_DIR, 'data.meta.json'), 'utf8'))

  it('пин APT и sha256 всех файлов', () => {
    expect(meta.aptRepo).toBe('SnosMe/awakened-poe-trade')
    expect(meta.aptSha).toMatch(/^[0-9a-f]{40}$/)
    expect(meta.langs).toEqual(['en', 'ru'])
    for (const [rel, hash] of Object.entries(meta.files as Record<string, string>)) {
      const actual = createHash('sha256').update(readFileSync(resolve(DATA_DIR, rel))).digest('hex')
      expect(actual, rel).toBe(hash)
    }
  })

  it('*.index.bin из sync-apt-data.mjs = индексы, построенные в TS', () => {
    for (const lang of POE1_LANGS) {
      const file = (f: string) => readFileSync(resolve(DATA_DIR, lang, f))
      const bytes = (a: Uint32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)
      const stats = buildStatsIndexes(file('stats.ndjson').toString('utf8'))
      const items = buildItemsIndexes(file('items.ndjson').toString('utf8'))
      expect(bytes(stats.byRef).equals(file('stats-ref.index.bin')), `${lang} stats-ref`).toBe(true)
      expect(bytes(stats.byMatcher).equals(file('stats-matcher.index.bin')), `${lang} stats-matcher`).toBe(true)
      expect(bytes(items.byName).equals(file('items-name.index.bin')), `${lang} items-name`).toBe(true)
      expect(bytes(items.byRefName).equals(file('items-ref.index.bin')), `${lang} items-ref`).toBe(true)
    }
  })
})

describe('стор данных', () => {
  it('кэширует язык и отдаёт тот же объект', async () => {
    const s = createPoe1DataStore({ fetch: diskFetch })
    expect(s.get('ru')).toBeUndefined()
    const [a, b] = await Promise.all([s.ensureLanguage('ru'), s.ensureLanguage('ru')])
    expect(a).toBe(b)
    expect(s.get('ru')).toBe(a)
    expect(s.get('en')).toBeUndefined()
    const all = await s.ensureAll()
    expect(all.ru).toBe(a)
    expect(all.en.lang).toBe('en')
  })

  it('без *.index.bin строит индексы в памяти', async () => {
    const noIndex: DataFetch = (url) =>
      url.endsWith('.index.bin')
        ? Promise.resolve({ ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) })
        : diskFetch(url)
    const d = await createPoe1DataStore({ fetch: noIndex }).ensureLanguage('ru')
    expect(d.refNameOf('Кольцо с кораллом')).toBe('Coral Ring')
  })

  it('ошибка загрузки не кэшируется — повтор загружает заново', async () => {
    let fail = true
    const flaky: DataFetch = (url) => {
      if (fail) return Promise.reject(new Error('сеть'))
      return diskFetch(url)
    }
    const s = createPoe1DataStore({ fetch: flaky })
    await expect(s.ensureLanguage('en')).rejects.toThrow('сеть')
    fail = false
    await expect(s.ensureLanguage('en')).resolves.toBeDefined()
  })

  it('неизвестный язык — отказ', async () => {
    const s = createPoe1DataStore({ fetch: diskFetch })
    // @ts-expect-error — проверяем рантайм-защиту
    await expect(s.ensureLanguage('de')).rejects.toThrow()
  })
})

describe('поиск предметов: локализованное имя → refName', () => {
  it('базы, уники, камни, карточки, валюта (RU)', async () => {
    const ru = await store.ensureLanguage('ru')
    expect(ru.refNameOf('Кольцо с кораллом')).toBe('Coral Ring')
    expect(ru.itemByTranslated('UNIQUE', 'Дыхание Ши')?.[0].refName).toBe('Sidhebreath')
    expect(ru.refNameOf('Сфера хаоса')).toBe('Chaos Orb')
    expect(ru.findItem('Божественная сфера')?.namespace).toBe('ITEM')
    expect(ru.refNameOf('Несуществующий предмет')).toBeUndefined()
    // обратное направление
    expect(ru.itemByRef('ITEM', 'Coral Ring')?.[0].name).toBe('Кольцо с кораллом')
  })

  it('EN: refName = name', async () => {
    const en = await store.ensureLanguage('en')
    expect(en.refNameOf('Coral Ring')).toBe('Coral Ring')
    expect(en.itemByTranslated('UNIQUE', 'Sidhebreath')?.[0].unique?.base).toBe('Paua Amulet')
  })
})

describe('строка мода → стат', () => {
  it('матчер с # и одинаковый ref/trade id для RU и EN', async () => {
    const { en, ru } = await store.ensureAll()
    const ruStat = ru.statByMatchStr('# к максимуму здоровья')
    const enStat = en.statByMatchStr('# to maximum Life')
    expect(ruStat?.stat.ref).toBe('+# to maximum Life')
    expect(ruStat?.stat.trade.ids).toEqual(enStat?.stat.trade.ids)

    const ruLine = matchStatLine('+61 к максимуму здоровья', ru)
    const enLine = matchStatLine('+61 to maximum Life', en)
    expect(ruLine?.type).toBe(ModifierType.Explicit)
    expect(ruLine?.roll?.value).toBe(61)
    expect(ruLine?.stat.ref).toBe(enLine?.stat.ref)
  })

  it('RU: согласованное мн. число («4 секунды») ↔ «# секунд(-ы)» в данных', async () => {
    const ru = await store.ensureLanguage('ru')
    const line =
      'Дарует иммунитет к охлаждению на 4 секунды при использовании, если вы охлаждены\n' +
      'Дарует иммунитет к заморозке на 4 секунды при использовании, если вы заморожены'
    const found = matchStatLine(line, ru)
    expect(found?.stat.ref).toBe(
      'Grants Immunity to Chill for # seconds if used while Chilled\nGrants Immunity to Freeze for # seconds if used while Frozen'
    )
    expect(ru.canonicalPluralMatchStr('Стрелы пронзают # дополнительных целей')).toBe('Стрелы пронзают # дополнительных цели(-ей)')
    expect(ru.canonicalPluralMatchStr('совсем другая строка #')).toBeUndefined()
  })

  it('неизвестная строка → undefined, без исключений', async () => {
    const ru = await store.ensureLanguage('ru')
    expect(matchStatLine('+5 к несуществующему свойству', ru)).toBeUndefined()
  })

  it('все ref, на которые код ссылается текстом (stat()), есть в en и ru', async () => {
    const data = await store.ensureAll()
    const refs = registeredStatRefs()
    expect(refs.length).toBeGreaterThan(10)
    for (const lang of POE1_LANGS) {
      for (const ref of refs) expect(data[lang].statByRefV2(ref), `${lang}: ${ref}`).toBeDefined()
    }
  })
})
