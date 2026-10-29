import { describe, expect, it } from 'vitest'
import { BuildTakenTracker } from '@shared/build/takenLog'

// «Взято ✓» по журналу (S39): строки вложения нод без имени персонажа относятся к персонажу текущего входа.

const P = '2026/10/30 12:00:00 123456 abc [INFO Client 1234]'
const login = `${P} Async connecting to pathofexile.login.pathofexile.com:6112`
const lvl = (name: string, n: number): string => `${P} : ${name} (Witch) is now level ${n}`
const lvlRu = (name: string, n: number): string => `${P} : ${name} (Ведьма) достигает ${n} уровня`
const alloc = (id: string, name: string): string => `${P} Successfully allocated passive skill id: ${id}, name: ${name}`
const unalloc = (id: string, name: string): string => `${P} Successfully unallocated passive skill id: ${id}, name: ${name}`

describe('BuildTakenTracker', () => {
  it('до первого повышения уровня — копит, потом отдаёт персонажу', () => {
    const t = new BuildTakenTracker()
    expect(t.ingest([login, alloc('spell_damage1', 'Spell Damage'), alloc('arcane_focus', 'Arcane Focus')])).toBe(true)
    expect(t.snapshot(true)).toEqual({ character: null, taken: ['spell_damage1', 'arcane_focus'], removed: [], log: true })
    t.ingest([lvl('Ведьмочка', 12), unalloc('spell_damage1', 'Spell Damage')])
    expect(t.snapshot(true)).toEqual({ character: 'Ведьмочка', taken: ['arcane_focus'], removed: ['spell_damage1'], log: true })
  })

  it('в группе: чужое повышение уровня после своего не меняет персонажа', () => {
    const t = new BuildTakenTracker()
    t.ingest([login, lvlRu('Моя', 5), lvl('Чужой', 30), alloc('a', 'A')])
    expect(t.snapshot(false).character).toBe('Моя')
    expect(t.snapshot(false).taken).toEqual(['a'])
  })

  it('новый вход другим персонажем — свои ноды у каждого', () => {
    const t = new BuildTakenTracker()
    t.ingest([login, lvl('Один', 3), alloc('a', 'A')])
    t.ingest([login, lvl('Два', 7), alloc('b', 'B')])
    expect(t.snapshot(true).taken).toEqual(['b'])
    t.ingest([login, lvl('Один', 4)])
    expect(t.snapshot(true).taken).toEqual(['a'])
  })

  it('ноды атласа и чужие строки — мимо', () => {
    const t = new BuildTakenTracker()
    expect(t.ingest([`${P} : hello`, alloc('atlas_strongbox_1', 'Strongbox')])).toBe(false)
    expect(t.snapshot(false)).toEqual({ character: null, taken: [], removed: [], log: false })
  })
})
