import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  GUIDE_LIMITS,
  GUIDE_SCHEMA,
  isNewerSchema,
  parseInline,
  plainText,
  validateArticle,
  validateIndex,
  type GuideArticle
} from '@shared/guide/article'

// «Справочник» (S55): строгий валидатор статьи — файл может прийти каналом данных, не из сборки.

const DIR = join(__dirname, '../../resources/data/poe1/guide')
const read = (f: string): unknown => JSON.parse(readFileSync(join(DIR, f), 'utf8'))

const t = (ru: string, en = ru) => ({ ru, en })

function base(): Record<string, unknown> {
  return {
    schema: 1,
    id: 'sample',
    rev: 2,
    updated: '2026-10-30',
    patch: ['3.29', '3.30'],
    title: t('Пример', 'Sample'),
    summary: t('Коротко', 'Short'),
    sections: [{ id: 'one', title: t('Раздел', 'Section'), blocks: [{ kind: 'text', text: t('Текст **жирный** `Ctrl+D`', 'Text') }] }]
  }
}

/** Подменить блок первого раздела. */
const withBlock = (b: unknown): Record<string, unknown> => {
  const a = base()
  ;(a.sections as { blocks: unknown[] }[])[0].blocks = [b]
  return a
}

const bad = (raw: unknown): string => {
  const r = validateArticle(raw)
  expect(r.ok).toBe(false)
  return r.ok ? '' : r.error
}

describe('встроенные статьи', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')

  it('index.json валиден и перечисляет ровно файлы папки', () => {
    const idx = validateIndex(read('index.json'))
    expect(idx.ok).toBe(true)
    if (!idx.ok) return
    expect([...idx.value.articles].sort()).toEqual(files.map((f) => f.replace(/\.json$/, '')).sort())
  })

  it.each(files)('%s проходит проверку, id = имя файла, есть RU и EN', (f) => {
    const r = validateArticle(read(f))
    if (!r.ok) throw new Error(`${f}: ${r.error}`)
    expect(r.value.id).toBe(f.replace(/\.json$/, ''))
    expect(readFileSync(join(DIR, f)).length).toBeLessThanOrEqual(GUIDE_LIMITS.bytes)
  })

  it('«Старт лиги»: актуально для 3.29 / 3.30, раздел 3.30 — пустой каркас «появится после патчноутов»', () => {
    const r = validateArticle(read('league-start.json'))
    if (!r.ok) throw new Error(r.error)
    const a: GuideArticle = r.value
    expect(a.patch).toEqual(['3.29', '3.30'])
    const s330 = a.sections.find((s) => s.id === 'new-330')
    expect(s330?.blocks[0].kind).toBe('pending')
    // в каркасе 3.30 только пометка и ссылка на патчноуты — никаких фактов о лиге
    expect(s330?.blocks.map((b) => b.kind)).toEqual(['pending', 'link'])
    expect(a.sections.some((s) => s.expert)).toBe(true)
  })
})

describe('мусор — отказ', () => {
  it.each([null, undefined, 42, 'статья', [], [base()], true])('%j', (raw) => {
    bad(raw)
  })

  it('неизвестные поля на любом уровне', () => {
    expect(bad({ ...base(), html: '<b>' })).toMatch(/неизвестные поля html/)
    const a = base()
    ;(a.sections as Record<string, unknown>[])[0].onclick = 'x'
    expect(bad(a)).toMatch(/неизвестные поля onclick/)
    expect(bad(withBlock({ kind: 'text', text: t('a'), script: 'alert(1)' }))).toMatch(/неизвестные поля script/)
    expect(bad({ ...base(), title: { ru: 'a', en: 'b', de: 'c' } })).toMatch(/неизвестные поля de/)
  })

  it('неизвестный блок', () => {
    expect(bad(withBlock({ kind: 'html', text: t('a') }))).toMatch(/неизвестный блок/)
    expect(bad(withBlock({ kind: 'image', src: 'https://www.pathofexile.com/a.png' }))).toMatch(/неизвестный блок/)
  })

  it('нужны оба языка', () => {
    expect(bad({ ...base(), title: { ru: 'Только RU' } })).toMatch(/title\.en/)
    expect(bad(withBlock({ kind: 'text', text: { en: 'Only EN' } }))).toMatch(/text\.ru/)
    expect(bad(withBlock({ kind: 'text', text: t('  ') }))).toMatch(/пусто/)
  })

  it('обязательные поля и типы', () => {
    for (const k of ['schema', 'id', 'rev', 'updated', 'patch', 'title', 'summary', 'sections']) {
      const a = base()
      delete a[k]
      bad(a)
    }
    bad({ ...base(), id: 'Bad Id' })
    bad({ ...base(), id: '../x' })
    bad({ ...base(), rev: 0 })
    bad({ ...base(), rev: 1.5 })
    bad({ ...base(), updated: '30.10.2026' })
    bad({ ...base(), updated: '2026-02-30' })
    bad({ ...base(), patch: ['3.30.1'] })
    bad({ ...base(), patch: [] })
    bad({ ...base(), sections: [] })
  })

  it('id разделов не повторяются, ревизия раздела не больше ревизии статьи', () => {
    const a = base()
    const s = (a.sections as Record<string, unknown>[])[0]
    a.sections = [s, { ...s }]
    expect(bad(a)).toMatch(/повторяются/)
    const b = base()
    ;(b.sections as Record<string, unknown>[])[0].rev = 3
    expect(bad(b)).toMatch(/rev/)
  })
})

describe('слишком длинное — отказ', () => {
  const L = GUIDE_LIMITS
  it('тексты', () => {
    expect(bad({ ...base(), title: t('я'.repeat(L.title + 1)) })).toMatch(/длиннее 80/)
    expect(bad({ ...base(), summary: t('a'.repeat(L.summary + 1)) })).toMatch(/длиннее/)
    expect(bad(withBlock({ kind: 'text', text: t('a'.repeat(L.text + 1)) }))).toMatch(/длиннее/)
    expect(bad(withBlock({ kind: 'list', items: [t('a'.repeat(L.item + 1))] }))).toMatch(/длиннее/)
    // на пределе — можно
    expect(validateArticle(withBlock({ kind: 'text', text: t('a'.repeat(L.text)) })).ok).toBe(true)
  })

  it('число разделов, блоков, пунктов, терминов', () => {
    const a = base()
    const s = (a.sections as Record<string, unknown>[])[0]
    a.sections = Array.from({ length: L.sections + 1 }, (_, i) => ({ ...s, id: `s${i}` }))
    expect(bad(a)).toMatch(/sections: от 1 до/)
    const b = base()
    ;(b.sections as { blocks: unknown[] }[])[0].blocks = Array.from({ length: L.blocks + 1 }, () => ({ kind: 'text', text: t('a') }))
    expect(bad(b)).toMatch(/blocks: от 1 до/)
    expect(bad(withBlock({ kind: 'list', items: Array.from({ length: L.items + 1 }, () => t('a')) }))).toMatch(/items: от 1 до/)
    const term = { term: t('a'), def: t('b') }
    expect(bad(withBlock({ kind: 'terms', items: Array.from({ length: L.terms + 1 }, () => term) }))).toMatch(/items: от 1 до/)
  })
})

describe('HTML и служебные символы — отказ', () => {
  it.each([
    '<b>жирный</b>',
    'текст <script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<!-- комментарий -->',
    '</p>',
    '< a href="x">',
    'строка\nвторая',
    'таб\tтут',
    'нуль\u0000',
    'смена ‮направления'
  ])('%j', (s) => {
    expect(bad(withBlock({ kind: 'text', text: t(s) }))).toMatch(/HTML или служебные символы/)
  })

  it('«меньше 75%» и стрелки — обычный текст', () => {
    expect(validateArticle(withBlock({ kind: 'text', text: t('если сопротивлений <75%, → добирайте; 3 > 2') })).ok).toBe(true)
  })

  it('незакрытая разметка и разметка в подписях', () => {
    expect(bad(withBlock({ kind: 'text', text: t('**жирный') }))).toMatch(/незакрытая/)
    expect(bad(withBlock({ kind: 'text', text: t('`Ctrl+D') }))).toMatch(/незакрытая/)
    expect(bad(withBlock({ kind: 'text', text: t('пусто ****') }))).toMatch(/незакрытая/)
    expect(bad({ ...base(), title: t('**Заголовок**') })).toMatch(/незакрытая/)
    expect(bad(withBlock({ kind: 'app', to: 'regex', label: t('`Regex`') }))).toMatch(/незакрытая/)
  })
})

describe('ссылки', () => {
  const link = (over: Record<string, unknown>) => withBlock({ kind: 'link', label: t('Сайт'), ...over })

  it('сайт реестра S43 — без адреса (главная) или с адресом этого сайта', () => {
    expect(validateArticle(link({ site: 'poelab' })).ok).toBe(true)
    expect(validateArticle(link({ site: 'ninja', url: 'https://poe.ninja/poe1/economy' })).ok).toBe(true)
    expect(validateArticle(link({ site: 'wiki', url: 'https://www.poewiki.net/wiki/Labyrinth' })).ok).toBe(true)
    expect(bad(link({ site: 'ninja', url: 'https://poedb.tw/ru/' }))).toMatch(/адрес не сайта ninja/)
  })

  it('GGG — только с адресом pathofexile.com, можно свой для RU и EN', () => {
    expect(
      validateArticle(
        link({
          site: 'ggg',
          url: { ru: 'https://ru.pathofexile.com/forum/view-forum/patch-notes', en: 'https://www.pathofexile.com/forum/view-forum/patch-notes' }
        })
      ).ok
    ).toBe(true)
    expect(bad(link({ site: 'ggg' }))).toMatch(/нужен адрес/)
    expect(bad(link({ site: 'ggg', url: 'https://pathofexile.com.evil.example/' }))).toMatch(/адрес не сайта ggg/)
    expect(bad(link({ site: 'ggg', url: { ru: 'https://ru.pathofexile.com/' } }))).toMatch(/url\.en/)
  })

  it('не https, логин, порт, javascript: и чужие сайты — отказ', () => {
    expect(bad(link({ site: 'ggg', url: 'http://www.pathofexile.com/' }))).toMatch(/только https/)
    expect(bad(link({ site: 'ggg', url: 'https://user:pw@www.pathofexile.com/' }))).toMatch(/только https/)
    expect(bad(link({ site: 'ggg', url: 'https://www.pathofexile.com:8443/' }))).toMatch(/только https/)
    expect(bad(link({ site: 'ggg', url: 'javascript:alert(1)' }))).toMatch(/только https/)
    expect(bad(link({ site: 'youtube', url: 'https://www.youtube.com/' }))).toMatch(/сайт реестра или ggg/)
    expect(bad(link({ site: 'ggg', url: `https://www.pathofexile.com/${'a'.repeat(300)}` }))).toMatch(/адрес до/)
  })

  it('переход в приложение: вкладка или вкладка/страница', () => {
    const app = (to: string) => withBlock({ kind: 'app', to, label: t('Открыть') })
    for (const to of ['priceCheck', 'regex/vendor', 'guide/league-start', 'settings']) expect(validateArticle(app(to)).ok).toBe(true)
    for (const to of ['', 'https://x', 'regex/vendor/x', '../settings', 'Price', 'a']) bad(app(to))
  })
})

describe('схема', () => {
  it('новее — не ошибка данных, а «нужен новый POETH»; старше или та же — по валидатору', () => {
    expect(isNewerSchema({ ...base(), schema: GUIDE_SCHEMA + 1 })).toBe(true)
    expect(isNewerSchema(base())).toBe(false)
    expect(isNewerSchema({ schema: '2' })).toBe(false)
    expect(bad({ ...base(), schema: GUIDE_SCHEMA + 1 })).toMatch(/schema/)
  })

  it('index: id статей, без повторов', () => {
    expect(validateIndex({ schema: 1, articles: ['a1', 'b2'] }).ok).toBe(true)
    expect(validateIndex({ schema: 1, articles: [] }).ok).toBe(true)
    for (const raw of [null, { schema: 1 }, { schema: 1, articles: ['a1', 'a1'] }, { schema: 1, articles: ['../x'] }, { schema: 1, articles: [], extra: 1 }]) {
      expect(validateIndex(raw).ok).toBe(false)
    }
  })
})

describe('разметка внутри текста', () => {
  it('**жирный** и `клавиша`', () => {
    expect(parseInline('Нажмите `Ctrl+D` и **проверьте** цену')).toEqual([
      { kind: 'text', text: 'Нажмите ' },
      { kind: 'key', text: 'Ctrl+D' },
      { kind: 'text', text: ' и ' },
      { kind: 'bold', text: 'проверьте' },
      { kind: 'text', text: ' цену' }
    ])
    expect(parseInline('просто текст')).toEqual([{ kind: 'text', text: 'просто текст' }])
  })

  it('незакрытое, пустое и вложенное — null', () => {
    for (const s of ['**a', 'a`', '****', '``', '**a `b` c**', '`a**b`']) expect(parseInline(s)).toBeNull()
  })

  it('plainText — без разметки', () => {
    expect(plainText('**Старт** лиги `G`')).toBe('Старт лиги G')
  })
})
