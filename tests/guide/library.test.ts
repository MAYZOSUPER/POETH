import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GUIDE_LIMITS, validateArticle, type GuideArticle } from '@shared/guide/article'
import {
  GUIDE_SEEN_KEY,
  articleMark,
  dayLabel,
  guideOn,
  loadGuide,
  markAllSeen,
  markSeen,
  normQuery,
  readSeen,
  searchGuide,
  sectionUpdated,
  unreadCount,
  visibleSections,
  writeSeen,
  type GuideRead
} from '@shared/guide/library'

// «Справочник» (S55): загрузка статей (битая не ломает остальные), поиск по заголовкам RU/EN, «новое / обновлено».

const DIR = join(__dirname, '../../resources/data/poe1/guide')
const bundledRead: GuideRead = async (file) => {
  try {
    return readFileSync(join(DIR, file), 'utf8')
  } catch {
    return null
  }
}

function article(id: string, over: Partial<GuideArticle> = {}): GuideArticle {
  return {
    schema: 1,
    id,
    rev: 1,
    updated: '2026-10-30',
    patch: ['3.29'],
    title: { ru: `Статья ${id}`, en: `Article ${id}` },
    summary: { ru: 'Коротко', en: 'Short' },
    sections: [{ id: 'one', title: { ru: 'Раздел', en: 'Section' }, blocks: [{ kind: 'text', text: { ru: 'a', en: 'a' } }] }],
    ...over
  }
}

/** Папка guide в памяти: файл → текст. */
const memRead =
  (files: Record<string, unknown>): GuideRead =>
  async (file) =>
    file in files ? (typeof files[file] === 'string' ? (files[file] as string) : JSON.stringify(files[file])) : null

describe('loadGuide', () => {
  it('встроенные данные: обе статьи в порядке index.json, ошибок нет', async () => {
    const res = await loadGuide(bundledRead)
    expect(res.noIndex).toBe(false)
    expect(res.failed).toEqual([])
    expect(res.articles.map((a) => a.id)).toEqual(['league-start', 'glossary-basics'])
  })

  it('битая статья не ломает остальные; id не совпал с файлом — отказ', async () => {
    const res = await loadGuide(
      memRead({
        'index.json': { schema: 1, articles: ['good', 'broken', 'html', 'other', 'missing'] },
        'good.json': article('good'),
        'broken.json': '{ не json',
        'html.json': article('html', { title: { ru: '<b>x</b>', en: 'x' } }),
        'other.json': article('stranger')
      })
    )
    expect(res.articles.map((a) => a.id)).toEqual(['good'])
    expect(res.failed.map((f) => f.id)).toEqual(['broken', 'html', 'other', 'missing'])
    expect(res.failed.find((f) => f.id === 'other')?.error).toMatch(/stranger/)
  })

  it('статья новой схемы — в newer (нужен новый POETH), не в ошибках', async () => {
    const res = await loadGuide(
      memRead({ 'index.json': { schema: 1, articles: ['a1', 'future'] }, 'a1.json': article('a1'), 'future.json': { ...article('future'), schema: 2, video: 'x' } })
    )
    expect(res.articles.map((a) => a.id)).toEqual(['a1'])
    expect(res.newer).toEqual(['future'])
    expect(res.failed).toEqual([])
  })

  it('слишком большой файл — отказ до разбора', async () => {
    const big = JSON.stringify(article('big')).replace('"Коротко"', `"${'я'.repeat(GUIDE_LIMITS.bytes / 2)}"`)
    const res = await loadGuide(memRead({ 'index.json': { schema: 1, articles: ['big'] }, 'big.json': big }))
    expect(res.articles).toEqual([])
    expect(res.failed[0].error).toMatch(/байт/)
  })

  it('нет или битый index.json — раздел пуст, noIndex', async () => {
    for (const files of [{}, { 'index.json': 'мусор' }, { 'index.json': { schema: 1, articles: 'a' } }]) {
      const res = await loadGuide(memRead(files))
      expect(res.noIndex).toBe(true)
      expect(res.articles).toEqual([])
    }
  })

  it('ошибка чтения — как нет файла', async () => {
    const res = await loadGuide(async (f) => {
      if (f === 'index.json') return JSON.stringify({ schema: 1, articles: ['a1'] })
      throw new Error('EACCES')
    })
    expect(res.failed).toEqual([{ id: 'a1', error: 'нет файла' }])
  })
})

describe('поиск по заголовкам', () => {
  const load = async (): Promise<GuideArticle[]> => (await loadGuide(bundledRead)).articles

  it('пустой запрос — все статьи без разделов', async () => {
    const all = await load()
    expect(searchGuide(all, '  ').map((h) => h.article.id)).toEqual(['league-start', 'glossary-basics'])
    expect(searchGuide(all, '').every((h) => h.sections.length === 0)).toBe(true)
  })

  it('RU: по названию статьи и раздела, регистр и ё не важны', async () => {
    const all = await load()
    expect(searchGuide(all, 'СТАРТ ЛИГИ').map((h) => h.article.id)).toEqual(['league-start'])
    const money = searchGuide(all, 'продавать')
    expect(money.map((h) => h.article.id)).toEqual(['league-start'])
    expect(money[0].sections.map((s) => s.id)).toEqual(['first-hours'])
    expect(searchGuide(all, 'что нового').flatMap((h) => h.sections.map((s) => s.id))).toEqual(['new-330'])
    expect(searchGuide(all, 'словарь').map((h) => h.article.id)).toEqual(['glossary-basics'])
  })

  it('EN — и при RU-интерфейсе: ищем на обоих языках', async () => {
    const all = await load()
    expect(searchGuide(all, 'league start').map((h) => h.article.id)).toEqual(['league-start'])
    expect(searchGuide(all, 'glossary').map((h) => h.article.id)).toEqual(['glossary-basics'])
    expect(searchGuide(all, 'what not').flatMap((h) => h.sections.map((s) => s.id))).toEqual(['dont'])
  })

  it('все слова должны найтись; разделы для опытных тоже ищутся', async () => {
    const all = await load()
    expect(searchGuide(all, 'старт словарь')).toEqual([])
    expect(searchGuide(all, 'крафт цифрах').flatMap((h) => h.sections.map((s) => s.id))).toEqual(['craft-math'])
    expect(searchGuide(all, 'xyzzy')).toEqual([])
  })

  it('ё → е, знаки не мешают', () => {
    expect(normQuery('Ещё!  «ЛИГА»')).toBe('еще лига')
    const a = article('a1', { title: { ru: 'Всё о ёлках', en: 'Trees' } })
    expect(searchGuide([a], 'все о елках')).toHaveLength(1)
  })
})

describe('«новое / обновлено»', () => {
  it('не открывали — новое; открывали старую ревизию — обновлено; текущую — без отметки', () => {
    const a = article('a1', { rev: 3 })
    expect(articleMark(a, {})).toBe('new')
    expect(articleMark(a, { a1: 2 })).toBe('updated')
    expect(articleMark(a, { a1: 3 })).toBeNull()
    expect(unreadCount([a, article('b2')], { a1: 3 })).toBe(1)
  })

  it('отметка раздела — только если статью уже читали и раздел менялся после этого', () => {
    const s = { id: 's', title: { ru: 'a', en: 'a' }, rev: 3, blocks: [] }
    expect(sectionUpdated(s, undefined)).toBe(false)
    expect(sectionUpdated(s, 2)).toBe(true)
    expect(sectionUpdated(s, 3)).toBe(false)
    expect(sectionUpdated({ ...s, rev: undefined }, 1)).toBe(false)
  })

  it('markSeen / markAllSeen; без изменений — тот же объект', () => {
    const a = article('a1', { rev: 2 })
    const seen = markSeen({}, a)
    expect(seen).toEqual({ a1: 2 })
    expect(markSeen(seen, a)).toBe(seen)
    expect(markAllSeen({}, [a, article('b2')])).toEqual({ a1: 2, b2: 1 })
  })

  it('хранилище: мусор и ошибки — пусто, запись — JSON под poeth.guide.seen', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(readSeen(storage)).toEqual({})
    writeSeen(storage, { a1: 2 })
    expect(store.get(GUIDE_SEEN_KEY)).toBe('{"a1":2}')
    expect(readSeen(storage)).toEqual({ a1: 2 })
    store.set(GUIDE_SEEN_KEY, '{"a1":"x","b2":0,"c3":1.5,"d4":4}')
    expect(readSeen(storage)).toEqual({ d4: 4 })
    for (const v of ['не json', '[1]', 'null']) {
      store.set(GUIDE_SEEN_KEY, v)
      expect(readSeen(storage)).toEqual({})
    }
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    }
    expect(readSeen(broken)).toEqual({})
    expect(() => writeSeen(broken, { a1: 1 })).not.toThrow()
    expect(readSeen(undefined)).toEqual({})
  })
})

describe('показ', () => {
  it('дата по языку', () => {
    expect(dayLabel('2026-10-30', 'ru')).toBe('30.10.2026')
    expect(dayLabel('2026-11-03', 'en')).toBe('Nov 3, 2026')
  })

  it('простой режим прячет разделы для опытных, экспертный — нет', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'league-start.json'), 'utf8')) as unknown
    const r = validateArticle(raw)
    if (!r.ok) throw new Error(r.error)
    const simple = visibleSections(r.value, true)
    expect(simple.expert.map((s) => s.id)).toEqual(['craft-math'])
    expect(simple.main.some((s) => s.expert)).toBe(false)
    expect(visibleSections(r.value, false)).toEqual({ main: r.value.sections, expert: [] })
  })

  it('раздел есть только у PoE 1', () => {
    expect(guideOn('poe1')).toBe(true)
    expect(guideOn('poe2')).toBe(false)
  })
})
