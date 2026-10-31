import { describe, expect, it } from 'vitest'
import { cleanMark, emptyRumoursUser, normalizeRumoursUser, withMark, withPicked, RUMOUR_MARKS_MAX } from '@shared/rumours/marks'

// Пометки игрока и выбранные слухи (S65): файл с диска недоверенный.

describe('normalizeRumoursUser', () => {
  it('битое — пустое состояние', () => {
    expect(normalizeRumoursUser(null)).toEqual(emptyRumoursUser())
    expect(normalizeRumoursUser('x')).toEqual(emptyRumoursUser())
  })

  it('чистит выбор и пометки', () => {
    const s = normalizeRumoursUser({
      picked: ['fallen-stars', 'fallen-stars', 'BAD ID', 3, 'a1', 'b2', 'c3', 'd4', 'e5', 'f6'],
      pickedBy: 'item',
      pickedAt: '2026-10-31T10:00:00.000Z',
      marks: {
        sulphite: { tier: 3, skip: false, note: '  хорошо\nидёт  ' },
        'cold-as-ice': { tier: 9, skip: 'yes', note: '' },
        '../x': { tier: 1 }
      }
    })
    expect(s.picked).toEqual(['fallen-stars', 'a1', 'b2', 'c3', 'd4', 'e5'])
    expect(s.pickedBy).toBe('item')
    expect(s.marks).toEqual({ sulphite: { tier: 3, skip: false, note: 'хорошо идёт' } })
  })

  it('без выбранных нет и «как выбраны»', () => {
    const s = normalizeRumoursUser({ picked: [], pickedBy: 'manual', pickedAt: '2026-10-31T10:00:00.000Z' })
    expect(s.pickedBy).toBe(null)
    expect(s.pickedAt).toBe(null)
  })
})

describe('пометка', () => {
  it('пустая пометка снимается', () => {
    expect(cleanMark({ tier: null, skip: false, note: '  ' })).toBe(null)
    const s = withMark(withMark(emptyRumoursUser(), 'sulphite', { tier: 2 }), 'sulphite', { tier: null })
    expect(s.marks).toEqual({})
  })

  it('заметка — одна строка до 140, без служебных символов', () => {
    const m = cleanMark({ note: `a‮b${'x'.repeat(200)}` })
    expect(m?.note).toHaveLength(140)
    expect(m?.note?.includes('‮')).toBe(false)
  })

  it('сверх лимита новая пометка не встаёт, старую править можно', () => {
    let s = emptyRumoursUser()
    for (let i = 0; i < RUMOUR_MARKS_MAX; i++) s = withMark(s, `id-${i}`, { skip: true })
    expect(Object.keys(withMark(s, 'one-more', { skip: true }).marks)).toHaveLength(RUMOUR_MARKS_MAX)
    expect(withMark(s, 'id-0', { tier: 1 }).marks['id-0']).toEqual({ tier: 1, skip: false, note: null })
  })
})

describe('withPicked', () => {
  const now = new Date('2026-10-31T12:00:00Z')
  it('только известные id; пусто — сброс', () => {
    const known = new Set(['fallen-stars', 'sulphite'])
    const s = withPicked(emptyRumoursUser(), ['sulphite', 'nope', 'fallen-stars'], 'manual', now, known)
    expect(s).toMatchObject({ picked: ['sulphite', 'fallen-stars'], pickedBy: 'manual', pickedAt: '2026-10-31T12:00:00.000Z' })
    expect(withPicked(s, [], 'manual', now)).toMatchObject({ picked: [], pickedBy: null, pickedAt: null })
  })
})
