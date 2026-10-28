import { describe, expect, it } from 'vitest'
import { LIMITS, validateStrategy } from '@shared/advisor/validate'
import { strategy, T } from './fixtures'

// Строгая проверка стратегии — ей же пройдёт импорт чужой стратегии (S17): недоверенные данные.

const err = (raw: unknown): string => {
  const r = validateStrategy(raw)
  return r.ok ? 'ok' : r.error
}
const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v))

describe('советник: валидатор стратегии', () => {
  it('полная стратегия проходит и не теряет полей', () => {
    const s = strategy({
      league: 'Settlers',
      measured: { maps: 40, hours: 3.5, perHour: 120, date: '2026-10-20', patch: '3.29' },
      source: { kind: 'imported', author: 'Exile_42', url: 'https://example.com/guide?a=1', date: '2026-10-21', note: { en: 'measured' } }
    })
    const r = validateStrategy(json(s))
    expect(r.ok && r.strategy).toEqual(s)
  })

  it('неизвестные поля на любом уровне — ошибка (цены в стратегии не хранятся)', () => {
    expect(err({ ...strategy(), price: 5 })).toContain('неизвестные поля price')
    const s = json(strategy()) as { outputs: Array<Record<string, unknown>> }
    s.outputs[0].chaos = 12
    expect(err(s)).toContain('outputs[0]: неизвестные поля chaos')
    const t = json(strategy()) as { name: Record<string, string> }
    t.name.de = 'Essenz'
    expect(err(t)).toContain('name: неизвестные поля de')
    const it2 = json(strategy()) as { inputs: Array<{ item: Record<string, unknown> }> }
    it2.inputs[1].item.name = 'Essence Scarab'
    expect(err(it2)).toContain('item: неизвестные поля name')
  })

  it('только простой текст: HTML, управляющие символы и смена направления — ошибка', () => {
    expect(err(strategy({ name: T('<b>Сущности</b>', 'Essences') }))).toContain('name.ru: HTML')
    expect(err(strategy({ why: T('ок', '<img src=x onerror=alert(1)>') }))).toContain('why.en: HTML')
    expect(err(strategy({ steps: [T('шаг\u0007', 'step')] }))).toContain('HTML или служебные')
    expect(err(strategy({ summary: T('текст‮текст', 'text') }))).toContain('служебные')
    // сравнения и переносы строк — можно
    expect(err(strategy({ why: T('урон > 1000\nи живучесть ≥ 5k', 'damage > 1000') }))).toBe('ok')
  })

  it('тексты: хотя бы один язык, не пустые, в пределах длины', () => {
    expect(err(strategy({ name: { en: 'Only English' } }))).toBe('ok')
    expect(err(strategy({ name: {} }))).toContain('хотя бы на одном языке')
    expect(err(strategy({ name: { ru: '   ' } }))).toContain('name.ru: пусто')
    expect(err(strategy({ name: T('я'.repeat(LIMITS.name + 1), 'x') }))).toContain(`длиннее ${LIMITS.name}`)
  })

  it('лимиты числа предметов и шагов', () => {
    const line = { item: { kind: 'stackable' as const, ref: 'Chaos Orb' }, qty: 1 }
    expect(err(strategy({ outputs: Array(LIMITS.outputs + 1).fill(line) }))).toContain('outputs: от 1')
    expect(err(strategy({ outputs: [] }))).toContain('outputs: от 1')
    expect(err(strategy({ steps: [] }))).toContain('steps: от 1')
    expect(err(strategy({ steps: Array(LIMITS.steps + 1).fill(T('шаг')) }))).toContain('steps')
  })

  it('предмет: стабильный ref (английское имя), не текст на русском; ref или label', () => {
    const out = (item: unknown) => strategy({ outputs: [{ item: item as never, qty: 1 }] })
    expect(err(out({ kind: 'unique', ref: 'Mjölner' }))).toBe('ok')
    expect(err(out({ kind: 'stackable', ref: "Uul-Netol's Breachstone" }))).toBe('ok')
    expect(err(out({ kind: 'stackable', ref: 'Сфера хаоса' }))).toBe('ok') // буквы любого алфавита — цены просто не будет
    expect(err(out({ kind: 'stackable', ref: 'Chaos Orb; DROP' }))).toContain('английское имя')
    expect(err(out({ kind: 'stackable' }))).toContain('нужно ref или label')
    expect(err(out({ kind: 'armour', ref: 'X' }))).toContain('kind')
    expect(err(out({ kind: 'map', ref: 'Strand Map', tier: 18 }))).toContain('tier')
  })

  it('числа: количество > 0 и конечное, время карты в пределах', () => {
    const out = (qty: unknown) => strategy({ outputs: [{ item: { kind: 'stackable', ref: 'Chaos Orb' }, qty: qty as number }] })
    expect(err(out(0))).toContain('qty')
    expect(err(out(-1))).toContain('qty')
    expect(err(out(Number.POSITIVE_INFINITY))).toContain('qty')
    expect(err(out('5'))).toContain('qty')
    expect(err(strategy({ minutesPerMap: 0 }))).toContain('minutesPerMap')
    expect(err(strategy({ minutesPerMap: 500 }))).toContain('minutesPerMap')
  })

  it('источник: вид из списка, ссылка только https, у wealthy — сайт WE, автор и ссылка обязательны', () => {
    const src = (source: unknown) => strategy({ source: source as never })
    expect(err(src({ kind: 'mine', date: '2026-10' }))).toContain('source.kind')
    expect(err(src({ kind: 'imported', date: '2026-10', url: 'http://example.com' }))).toContain('только https')
    expect(err(src({ kind: 'imported', date: '2026-10', url: 'javascript:alert(1)' }))).toContain('только https')
    expect(err(src({ kind: 'imported', date: '2026-10', url: 'https://user:pw@example.com' }))).toContain('только https')
    expect(err(src({ kind: 'wealthy', date: '2026-10', author: 'A', url: 'https://example.com/s/1' }))).toContain('wealthyexile.com')
    expect(err(src({ kind: 'wealthy', date: '2026-10', url: 'https://wealthyexile.com/strategies/1/x' }))).toContain('атрибуция')
    expect(err(src({ kind: 'wealthy', date: '2026-10', author: 'A', url: 'https://wealthyexile.com/strategies/1/x' }))).toBe('ok')
    expect(err(src({ kind: 'community', date: 'вчера' }))).toContain('source.date')
    expect(err(src({ kind: 'community', date: '2026-10', author: 'x'.repeat(LIMITS.author + 1) }))).toContain('source.author')
  })

  it('замер: только числа, дата и версия; аккаунт и персонаж — неизвестные поля', () => {
    const m = (measured: unknown) => strategy({ measured: measured as never })
    expect(err(m({ maps: 10, hours: 1, perHour: 50, date: '2026-10-20' }))).toBe('ok')
    expect(err(m({ maps: 0, hours: 1, perHour: 50, date: '2026-10-20' }))).toContain('measured.maps')
    expect(err(m({ maps: 10, hours: 1, perHour: 50, date: '2026-10' }))).toContain('measured.date')
    expect(err(m({ maps: 10, hours: 1, perHour: 50, date: '2026-10-20', account: 'me' }))).toContain('неизвестные поля account')
    expect(err(m({ maps: 10, hours: 1, perHour: 50, date: '2026-10-20', character: 'Hero' }))).toContain('character')
  })

  it('версия игры обязательна (у импорта нет значений по умолчанию)', () => {
    const { patch: _p, ...raw } = strategy()
    expect(err(raw)).toContain('patch')
    expect(validateStrategy(raw, { patch: '3.29' }).ok).toBe(true)
    expect(err(strategy({ patch: 'latest' }))).toContain('patch')
  })

  it('не объект и мусор — ошибка без исключения', () => {
    expect(err(null)).toContain('не объект')
    expect(err([])).toContain('не объект')
    expect(err('POETH1:abc')).toContain('не объект')
    expect(err({ ...strategy(), id: '../../etc' })).toBe('id')
  })
})
