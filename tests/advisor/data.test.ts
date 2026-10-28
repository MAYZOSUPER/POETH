import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { ADVISOR_DATA_FILE, DEFAULT_MINUTES_PER_MAP, foreignLang, isOutdated, parseAdvisorData, strategyTexts, tx } from '@shared/advisor/data'
import { strategy, T } from './fixtures'

const DATA = resolve(__dirname, '../../resources/data/poe1')
const read = (rel: string): string => readFileSync(resolve(DATA, rel), 'utf8')

const file = (strategies: unknown[], extra: Record<string, unknown> = {}) => ({
  schema: 1,
  patch: '3.29',
  updatedAt: '2026-10-28',
  draft: true,
  strategies,
  ...extra
})

describe('советник: разбор strategies.json', () => {
  it('не наш формат, схема новее или нет версии игры — данных нет', () => {
    expect(parseAdvisorData(null).data).toBeNull()
    expect(parseAdvisorData({ schema: 2, patch: '3.29', strategies: [] }).data).toBeNull()
    expect(parseAdvisorData({ version: 1, patch: '3.29', strategies: [] }).data).toBeNull()
    expect(parseAdvisorData({ schema: 1, strategies: [] }).data).toBeNull()
  })

  it('корректная стратегия проходит, значения по умолчанию — из файла', () => {
    const { minutesPerMap: _m, draft: _d, patch: _p, ...raw } = strategy()
    const res = parseAdvisorData(file([raw], { defaults: { minutesPerMap: 7 } }))
    expect(res.errors).toEqual([])
    expect(res.invalid).toBe(0)
    const s = res.data!.strategies[0]
    expect(s.minutesPerMap).toBe(7)
    expect(s.draft).toBe(true)
    expect(s.patch).toBe('3.29')
    expect(s.source).toEqual({ kind: 'official', date: '2026-10', note: T('оценка', 'estimate') })
    expect(s.inputs[0]).toEqual({ item: { kind: 'map', label: T('Карта', 'Map') }, qty: 1, own: true })
  })

  it('без defaults — время карты по умолчанию; неизвестное поле файла — в ошибки, файл читается', () => {
    const res = parseAdvisorData(file([], { extra: 1 }))
    expect(res.data!.defaults.minutesPerMap).toBe(DEFAULT_MINUTES_PER_MAP)
    expect(res.errors).toEqual(['файл: неизвестные поля extra (пропущены)'])
  })

  it('битая стратегия отбрасывается одна (с причиной), повтор id — тоже', () => {
    const res = parseAdvisorData(file([strategy({ id: 'good' }), strategy({ id: 'bad', difficulty: 4 as never }), strategy({ id: 'good' })]))
    expect(res.data!.strategies.map((s) => s.id)).toEqual(['good'])
    expect(res.invalid).toBe(2)
    expect(res.errors).toEqual(['стратегия «bad»: difficulty: 1, 2 или 3', 'стратегия «good»: id повторяется'])
  })

  it('битый термин словаря отбрасывается', () => {
    const res = parseAdvisorData(
      file([], { glossary: { ok: { term: T('а'), tip: T('б') }, bad: { term: T('а') }, 'Bad Key': { term: T('а'), tip: T('б') } } })
    )
    expect(Object.keys(res.data!.glossary)).toEqual(['ok'])
    expect(res.errors).toHaveLength(2)
  })
})

describe('советник: язык текста и устаревание', () => {
  it('нет текста на языке интерфейса — берём другой', () => {
    expect(tx(T('да', 'yes'), 'ru')).toBe('да')
    expect(tx(T('да', 'yes'), 'en')).toBe('yes')
    expect(tx({ en: 'yes' }, 'ru')).toBe('yes')
    expect(tx({ ru: 'да' }, 'en')).toBe('да')
  })

  it('стратегия только на английском — «написано на английском» в RU, ничего в EN', () => {
    const s = strategy({ name: { en: 'Essences' }, steps: [{ en: 'Go' }] })
    expect(foreignLang(s, 'ru')).toBe('en')
    expect(foreignLang(s, 'en')).toBeNull()
    expect(foreignLang(strategy(), 'ru')).toBeNull()
    expect(foreignLang(strategy({ why: { ru: 'потому' } }), 'en')).toBe('ru')
  })

  it('другая версия игры — может устареть', () => {
    expect(isOutdated(strategy({ patch: '3.29' }), '3.30')).toBe(true)
    expect(isOutdated(strategy({ patch: '3.30' }), '3.30')).toBe(false)
    expect(isOutdated(strategy(), null)).toBe(false)
  })
})

describe('советник: данные в комплекте', () => {
  const res = parseAdvisorData(JSON.parse(read(ADVISOR_DATA_FILE)))
  const data = res.data!
  const texts = data.strategies.flatMap(strategyTexts)
  for (const g of Object.values(data.glossary)) texts.push(g.term, g.tip)

  it('файл проходит строгую проверку; 2–3 демо-стратегии POETH, черновик 3.29', () => {
    expect(res.errors).toEqual([])
    expect(res.invalid).toBe(0)
    expect(data.strategies.length).toBeGreaterThanOrEqual(2)
    expect(data.patch).toBe('3.29')
    expect(data.strategies.every((s) => s.draft && s.source.kind === 'official' && s.patch === '3.29')).toBe(true)
  })

  it('наши стратегии на обоих языках: RU — по-русски, EN — без кириллицы', () => {
    expect(texts.filter((t) => !t.ru || !t.en)).toEqual([])
    expect(texts.filter((t) => !/[а-яё]/i.test(t.ru!)).map((t) => t.ru)).toEqual([])
    expect(texts.filter((t) => /[а-яё]/i.test(t.en!)).map((t) => t.en)).toEqual([])
  })

  it('термины стратегий есть в словаре', () => {
    for (const s of data.strategies) for (const k of s.terms) expect(data.glossary[k], `${s.id}: ${k}`).toBeDefined()
  })

  it('предметы по ref есть на обмене валюты GGG (цена) и в русских данных APT (имя)', () => {
    const exchange = new Set(Object.values(JSON.parse(read('wealth/exchange-ids.json')).names as Record<string, string>))
    const ru = new Set(
      read('ru/items.ndjson')
        .split('\n')
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { refName: string }).refName)
    )
    for (const s of data.strategies) {
      for (const l of [...s.inputs, ...s.outputs]) {
        const ref = l.item.ref
        if (!ref) continue
        if (l.item.kind === 'stackable') expect(exchange.has(ref), `${s.id}: ${ref} на обмене`).toBe(true)
        expect(ru.has(ref), `${s.id}: ${ref} в ru/items.ndjson`).toBe(true)
      }
    }
  })
})
