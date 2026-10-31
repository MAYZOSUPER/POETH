import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { GUIDE_LIMITS, plainText, validateArticle, validateIndex, type GuideArticle, type GuideBlock } from '@shared/guide/article'
import { guideOn, loadGuide, searchGuide, type GuideRead } from '@shared/guide/library'
import { isSiteOfGame } from '@shared/sites'
import { resolveAppLink } from '../../src/renderer/src/panels/guide/links'

// S64: «Справочник» PoE 2 — пять статей RU/EN как данные (resources/data/poe2/guide), тот же строгий валидатор S55,
// та же загрузка через poeth://data/poe2/guide/<файл>. Ссылки — только на сайты трейд-окна PoE 2 и GGG.

const state = { dir: '' }
vi.mock('electron', () => ({ app: { getPath: () => join(state.dir, 'user'), getAppPath: () => state.dir, isPackaged: false }, protocol: {} }))
vi.mock('../../src/main/services/questDataset', () => ({ resourcesDir: () => join(state.dir, 'res') }))
vi.mock('../../src/main/services/layoutResolver', () => ({ resolveLayoutFile: vi.fn(), resolveBrandFile: vi.fn(), contentTypeFor: vi.fn() }))
vi.mock('../../src/main/services/iconCache', () => ({ iconResponse: vi.fn() }))

const DIR = join(__dirname, '../../resources/data/poe2/guide')
const read = (f: string): unknown => JSON.parse(readFileSync(join(DIR, f), 'utf8'))
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')
const IDS = ['poe2-start', 'poe2-currency', 'poe2-waystones', 'poe2-regex', 'poe2-lootfilter']

function articles(): GuideArticle[] {
  return files.map((f) => {
    const r = validateArticle(read(f))
    if (!r.ok) throw new Error(`${f}: ${r.error}`)
    return r.value
  })
}

function blocks(a: GuideArticle): GuideBlock[] {
  return a.sections.flatMap((s) => s.blocks)
}

/** Все тексты статьи на языке (заголовки, абзацы, пункты, термины). */
function texts(a: GuideArticle, lang: 'ru' | 'en'): string[] {
  const out = [a.title[lang], a.summary[lang]]
  for (const s of a.sections) {
    out.push(s.title[lang])
    for (const b of s.blocks) {
      if ('text' in b && b.text) out.push(b.text[lang])
      if (b.kind === 'list') out.push(...b.items.map((i) => i[lang]))
      if (b.kind === 'terms') out.push(...b.items.flatMap((i) => [i.term[lang], i.def[lang]]))
      if ('label' in b) out.push(b.label[lang])
    }
  }
  return out
}

describe('статьи PoE 2', () => {
  it('раздел включён для PoE 2', () => {
    expect(guideOn('poe2')).toBe(true)
  })

  it('index.json валиден, порядок статей и ровно файлы папки', () => {
    const idx = validateIndex(read('index.json'))
    expect(idx.ok).toBe(true)
    if (!idx.ok) return
    expect(idx.value.articles).toEqual(IDS)
    expect([...idx.value.articles].sort()).toEqual(files.map((f) => f.replace(/\.json$/, '')).sort())
  })

  it.each(files)('%s проходит проверку, id = имя файла, размер в лимите', (f) => {
    const r = validateArticle(read(f))
    if (!r.ok) throw new Error(`${f}: ${r.error}`)
    expect(r.value.id).toBe(f.replace(/\.json$/, ''))
    expect(readFileSync(join(DIR, f)).length).toBeLessThanOrEqual(GUIDE_LIMITS.bytes)
  })

  it('у каждой статьи RU и EN не пустые и отличаются (не забыли перевести)', () => {
    for (const a of articles()) {
      const ru = texts(a, 'ru')
      const en = texts(a, 'en')
      expect(ru.length).toBe(en.length)
      for (const s of ru) expect(plainText(s).trim().length, `${a.id}: ${s}`).toBeGreaterThan(0)
      // в RU-тексте есть кириллица, в EN — нет
      expect(ru.join(' '), a.id).toMatch(/[а-яё]/i)
      expect(en.join(' '), a.id).not.toMatch(/[а-яё]/i)
    }
  })

  it('ссылки — только сайты трейд-окна PoE 2 или GGG', () => {
    for (const a of articles()) {
      for (const b of blocks(a)) {
        if (b.kind !== 'link') continue
        expect(b.site === 'ggg' || isSiteOfGame(b.site, 'poe2'), `${a.id}: ${b.site}`).toBe(true)
      }
    }
  })

  it('переходы в POETH: вкладки PoE 2 и статьи справочника; regex пока скрыт — блок не показывается', () => {
    const tabs = ['campaign', 'priceCheck', 'guide'] as const
    const ids = articles().map((a) => a.id)
    for (const a of articles()) {
      for (const b of blocks(a)) {
        if (b.kind !== 'app') continue
        const target = resolveAppLink(b.to, [...tabs], ids)
        if (b.to === 'regex') expect(target, `${a.id}: regex`).toBeNull()
        else expect(target, `${a.id}: ${b.to}`).not.toBeNull()
      }
    }
  })

  it('о 1.0 — ничего до патчноутов: в «Старте» каркас pending и ссылка на показ GGG', () => {
    const start = articles().find((a) => a.id === 'poe2-start')!
    expect(start.patch).toEqual(['0.5', '1.0'])
    const when = start.sections.find((s) => s.id === 'when')!
    expect(when.blocks.map((b) => b.kind)).toEqual(['text', 'pending', 'link'])
  })

  it('поиск находит статьи по RU и EN названиям', () => {
    const all = articles()
    expect(searchGuide(all, 'обменник').map((h) => h.article.id)).toEqual(['poe2-currency'])
    expect(searchGuide(all, 'waystones').map((h) => h.article.id)).toEqual(['poe2-waystones'])
    expect(searchGuide(all, 'фильтр').map((h) => h.article.id)).toContain('poe2-lootfilter')
    expect(searchGuide(all, 'regex').map((h) => h.article.id)).toContain('poe2-regex')
  })
})

describe('poeth://data/poe2/guide/<файл>', () => {
  beforeEach(() => {
    state.dir = mkdtempSync(join(tmpdir(), 'poeth-guide2-'))
    const bundled = join(state.dir, 'res', 'data', 'poe2', 'guide')
    mkdirSync(bundled, { recursive: true })
    cpSync(DIR, bundled, { recursive: true })
  })
  afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

  it('протокол отдаёт встроенные статьи PoE 2; загрузка без ошибок, порядок как в index.json', async () => {
    const { resolveDataFile } = await import('../../src/main/protocol')
    const readP: GuideRead = async (file) => {
      const abs = await resolveDataFile('poe2', 'guide', file)
      return abs ? readFileSync(abs, 'utf8') : null
    }
    const res = await loadGuide(readP)
    expect(res.failed).toEqual([])
    expect(res.noIndex).toBe(false)
    expect(res.articles.map((a) => a.id)).toEqual(IDS)
  })
})
