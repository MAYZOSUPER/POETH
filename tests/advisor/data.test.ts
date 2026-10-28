import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { ADVISOR_DATA_FILE, DEFAULT_MINUTES_PER_MAP, parseAdvisorData, tx } from '@shared/advisor/data'
import type { AdvisorText } from '@shared/types/advisor'
import { strategy, T } from './fixtures'

const DATA = resolve(__dirname, '../../resources/data/poe1')
const read = (rel: string): string => readFileSync(resolve(DATA, rel), 'utf8')

const file = (strategies: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  patch: '3.29',
  updatedAt: '2026-10-28',
  draft: true,
  strategies,
  ...extra
})

describe('советник: разбор strategies.json', () => {
  it('не наш формат или версия новее — данных нет', () => {
    expect(parseAdvisorData(null).data).toBeNull()
    expect(parseAdvisorData({ version: 2, strategies: [] }).data).toBeNull()
    expect(parseAdvisorData({ version: 1 }).data).toBeNull()
  })

  it('корректная стратегия проходит, значения по умолчанию — из файла', () => {
    const { minutesPerMap: _m, draft: _d, patch: _p, ...raw } = strategy()
    const res = parseAdvisorData(file([raw], { defaults: { minutesPerMap: 7 } }))
    expect(res.invalid).toBe(0)
    expect(res.errors).toEqual([])
    const s = res.data!.strategies[0]
    expect(s.minutesPerMap).toBe(7)
    expect(s.draft).toBe(true)
    expect(s.patch).toBe('3.29')
    expect(s.inputs[0]).toEqual({ item: { kind: 'map', label: T('Карта', 'Map') }, qty: 1, own: true })
  })

  it('без defaults — время карты по умолчанию', () => {
    const res = parseAdvisorData(file([]))
    expect(res.data!.defaults.minutesPerMap).toBe(DEFAULT_MINUTES_PER_MAP)
  })

  it('битая стратегия отбрасывается одна, остальные остаются', () => {
    const good = strategy({ id: 'good' })
    const bad = [
      strategy({ id: 'Bad Id' }),
      { ...strategy({ id: 'no-en' }), name: { ru: 'Только русский' } },
      strategy({ id: 'zero-qty', outputs: [{ item: { kind: 'stackable', name: 'X' }, qty: 0 }] }),
      strategy({ id: 'no-out', outputs: [] }),
      strategy({ id: 'bad-diff', difficulty: 4 as never }),
      strategy({ id: 'no-name', outputs: [{ item: { kind: 'stackable' }, qty: 1 }] }),
      strategy({ id: 'bad-kind', outputs: [{ item: { kind: 'armour' as never, name: 'X' }, qty: 1 }] }),
      strategy({ id: 'no-steps', steps: [] }),
      strategy({ id: 'bad-date', source: { text: T('x'), date: 'вчера' } }),
      strategy({ id: 'good' })
    ]
    const res = parseAdvisorData(file([good, ...bad]))
    expect(res.data!.strategies.map((s) => s.id)).toEqual(['good'])
    expect(res.invalid).toBe(bad.length)
    expect(res.errors.some((e) => e.includes('id повторяется'))).toBe(true)
  })

  it('битый термин словаря отбрасывается', () => {
    const res = parseAdvisorData(file([], { glossary: { ok: { term: T('а'), tip: T('б') }, bad: { term: T('а') } } }))
    expect(Object.keys(res.data!.glossary)).toEqual(['ok'])
    expect(res.errors).toHaveLength(1)
  })

  it('текст на языке интерфейса', () => {
    expect(tx(T('да', 'yes'), 'ru')).toBe('да')
    expect(tx(T('да', 'yes'), 'en')).toBe('yes')
  })
})

describe('советник: данные в комплекте', () => {
  const res = parseAdvisorData(JSON.parse(read(ADVISOR_DATA_FILE)))
  const data = res.data!
  const texts: AdvisorText[] = []
  for (const s of data.strategies) {
    texts.push(s.name, s.summary, s.why, s.source.text, ...s.atlas, ...s.steps, ...s.warnings)
    if (s.build.note) texts.push(s.build.note)
    for (const l of [...s.inputs, ...s.outputs]) {
      if (l.item.label) texts.push(l.item.label)
      if (l.note) texts.push(l.note)
    }
  }
  for (const g of Object.values(data.glossary)) texts.push(g.term, g.tip)

  it('файл проходит проверку без ошибок; 2–3 демо-стратегии, черновик 3.29', () => {
    expect(res.errors).toEqual([])
    expect(res.invalid).toBe(0)
    expect(data.strategies.length).toBeGreaterThanOrEqual(2)
    expect(data.patch).toBe('3.29')
    expect(data.strategies.every((s) => s.draft)).toBe(true)
  })

  it('RU — по-русски, EN — без кириллицы', () => {
    expect(texts.filter((t) => !/[а-яё]/i.test(t.ru)).map((t) => t.ru)).toEqual([])
    expect(texts.filter((t) => /[а-яё]/i.test(t.en)).map((t) => t.en)).toEqual([])
  })

  it('термины стратегий есть в словаре', () => {
    for (const s of data.strategies) for (const k of s.terms) expect(data.glossary[k], `${s.id}: ${k}`).toBeDefined()
  })

  it('предметы с именем есть на обмене валюты GGG (цена) и в русских данных APT (имя)', () => {
    const exchange = new Set(Object.values(JSON.parse(read('wealth/exchange-ids.json')).names as Record<string, string>))
    const ru = new Set(
      read('ru/items.ndjson')
        .split('\n')
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { refName: string }).refName)
    )
    for (const s of data.strategies) {
      for (const l of [...s.inputs, ...s.outputs]) {
        const name = l.item.name
        if (!name) continue
        if (l.item.kind === 'stackable') expect(exchange.has(name), `${s.id}: ${name} на обмене`).toBe(true)
        expect(ru.has(name), `${s.id}: ${name} в ru/items.ndjson`).toBe(true)
      }
    }
  })
})
