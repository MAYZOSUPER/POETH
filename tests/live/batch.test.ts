import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HitBatcher, ToastThrottle } from '../../src/main/games/poe1/live/batch'

const id = (n: number) => n.toString(16).padStart(64, 'a')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('батч находок', () => {
  it('копит 300 мс от первого id и отдаёт одной пачкой', () => {
    const out: Array<[string, string[]]> = []
    const b = new HitBatcher({ onFlush: (s, ids) => out.push([s, ids]) })
    b.push('s1', [id(1)])
    vi.advanceTimersByTime(200)
    b.push('s1', [id(2), id(3)])
    expect(out).toHaveLength(0)
    vi.advanceTimersByTime(100)
    expect(out).toEqual([['s1', [id(1), id(2), id(3)]]])
  })

  it('пачки не больше 10 id (лимит fetch)', () => {
    const out: string[][] = []
    const b = new HitBatcher({ onFlush: (_s, ids) => out.push(ids) })
    b.push('s1', Array.from({ length: 23 }, (_, i) => id(i + 1)))
    vi.advanceTimersByTime(300)
    expect(out.map((c) => c.length)).toEqual([10, 10, 3])
  })

  it('дедуп: повторы и уже виденные id не уходят второй раз', () => {
    const out: string[][] = []
    const b = new HitBatcher({ onFlush: (_s, ids) => out.push(ids) })
    expect(b.push('s1', [id(1), id(1), id(2)])).toBe(2)
    vi.advanceTimersByTime(300)
    expect(b.push('s1', [id(2), id(3)])).toBe(1)
    vi.advanceTimersByTime(300)
    expect(out).toEqual([[id(1), id(2)], [id(3)]])
  })

  it('поиски независимы: один и тот же предмет в двух поисках', () => {
    const out: Array<[string, string[]]> = []
    const b = new HitBatcher({ onFlush: (s, ids) => out.push([s, ids]) })
    b.push('s1', [id(1)])
    b.push('s2', [id(1)])
    vi.advanceTimersByTime(300)
    expect(out.sort()).toEqual([['s1', [id(1)]], ['s2', [id(1)]]])
  })

  it('мусор во входе отбрасывается', () => {
    const out: string[][] = []
    const b = new HitBatcher({ onFlush: (_s, ids) => out.push(ids) })
    expect(b.push('s1', 'nope')).toBe(0)
    expect(b.push('s1', [42, null, '', 'короткий', '../../etc', id(7)])).toBe(1)
    vi.advanceTimersByTime(300)
    expect(out).toEqual([[id(7)]])
  })

  it('память дедупа ограничена: старые id вытесняются', () => {
    const out: string[][] = []
    const b = new HitBatcher({ onFlush: (_s, ids) => out.push(ids), seenMax: 2 })
    b.push('s1', [id(1), id(2), id(3)])
    vi.advanceTimersByTime(300)
    expect(b.push('s1', [id(1)])).toBe(1) // id(1) уже забыт
    expect(b.push('s1', [id(3)])).toBe(0)
  })

  it('drop: удалённый поиск не присылает отложенную пачку', () => {
    const out: string[][] = []
    const b = new HitBatcher({ onFlush: (_s, ids) => out.push(ids) })
    b.push('s1', [id(1)])
    b.drop('s1')
    vi.advanceTimersByTime(1000)
    expect(out).toHaveLength(0)
  })
})

describe('антиспам тостов', () => {
  it('не больше N в минуту на поиск, окно скользит', () => {
    const t = new ToastThrottle(3)
    const res = [0, 1000, 2000, 3000].map((now) => t.allow('s1', now))
    expect(res).toEqual([true, true, true, false])
    expect(t.allow('s2', 3000)).toBe(true)
    expect(t.allow('s1', 60_001)).toBe(true)
  })
})
