import { describe, expect, it } from 'vitest'
import {
  MAX_LIBRARY,
  applyImport,
  communityFile,
  copyAsMine,
  emptyLibrary,
  freeId,
  idFromName,
  importPlan,
  parseCommunityFile,
  parseLibrary,
  removeEntry,
  serializeLibrary,
  upsertMine,
  type Library
} from '@shared/advisor/library'
import { STRATEGY_ID } from '@shared/advisor/validate'
import type { AdvisorStrategy } from '@shared/types/advisor'
import { strategy, T } from './fixtures'

// Свои стратегии, импорт («уже есть», «заменить», «копией») и файлы каталога сообщества (S17).

const json = <V>(v: V): V => JSON.parse(JSON.stringify(v))
const official = strategy({ id: 'essence-basic', source: { kind: 'official', date: '2026-11' }, patch: '3.30' })
const friend = strategy({ id: 'strongbox-free', name: T('Сундуки без скарабея', 'Strongboxes, no scarab'), source: { kind: 'mine', author: 'Kotik', date: '2026-11-15' }, patch: '3.30' })
const lib = (...items: AdvisorStrategy[]): Library => ({ ...emptyLibrary(), items: items.map((s) => ({ strategy: s, addedAt: '2026-11-15' })) })

describe('советник: свои стратегии', () => {
  it('файл: проверенные записи, битые и повторы id отбрасываются, чужие виды источника → imported', () => {
    const raw = {
      schema: 1,
      nick: 'mapper_42',
      items: [
        { strategy: json(friend), addedAt: '2026-11-15' },
        { strategy: { ...json(friend) }, addedAt: '2026-11-16' }, // повтор id
        { strategy: { ...json(friend), id: 'x', name: { ru: '<script>' } } }, // HTML
        { strategy: { ...json(official), id: 'fake-official' }, addedAt: 'вчера' }, // official из файла → imported
        'мусор'
      ],
      draft: { v: 1, name: { ru: 'черновик' } }
    }
    const { library, invalid } = parseLibrary(raw)
    expect(invalid).toBe(3)
    expect(library.nick).toBe('mapper_42')
    expect(library.items.map((e) => [e.strategy.id, e.strategy.source.kind, e.addedAt])).toEqual([
      ['strongbox-free', 'mine', '2026-11-15'],
      ['fake-official', 'imported', '2026-11']
    ])
    expect(library.draft).toEqual(raw.draft)
    expect(parseLibrary(json(serializeLibrary(library))).library).toEqual(library)
  })

  it('чужой формат и новая схема — пусто, без исключений', () => {
    for (const raw of [null, 42, 'x', [], { schema: 2, items: [json(friend)] }, { schema: 1, items: 'нет' }]) {
      expect(parseLibrary(raw).library.items).toEqual([])
    }
    expect(parseLibrary({ schema: 1, nick: '<b>x</b>', items: [] }).library.nick).toBe('')
    expect(parseLibrary({ schema: 1, items: [], draft: { big: 'x'.repeat(200_000) } }).library.draft).toBeNull()
  })

  it('свободный id: правила id, суффиксы, не длиннее 48', () => {
    expect(freeId('essence-basic', new Set())).toBe('essence-basic')
    expect(freeId('essence-basic', new Set(['essence-basic']))).toBe('essence-basic-2')
    expect(freeId('essence-basic', new Set(['essence-basic', 'essence-basic-2']))).toBe('essence-basic-3')
    const long = 'a'.repeat(48)
    const id = freeId(long, new Set([long]))
    expect(id).toMatch(STRATEGY_ID)
    expect(id.length).toBeLessThanOrEqual(48)
    expect(freeId('Мой ФАРМ!!', new Set())).toBe('strategy')
    expect(idFromName('Essences + ambush', new Set())).toBe('my-essences-ambush')
    expect(idFromName('Сущности + засада', new Set(['my-strategy']))).toBe('my-strategy-2')
  })

  it('копия нашей стратегии: новый id, источник mine, без чужого замера', () => {
    const m = { ...official, measured: { maps: 36, hours: 3, perHour: 103, date: '2026-11-13' } }
    const c = copyAsMine(m, new Set(['essence-basic']), '2026-11-15')
    expect(c.id).toBe('my-essence-basic')
    expect(c.source).toEqual({ kind: 'mine', date: '2026-11-15' })
    expect(c.measured).toBeUndefined()
    expect(copyAsMine(m, new Set(['my-essence-basic']), '2026-11-15').id).toBe('my-essence-basic-2')
  })

  it('сохранить свою: замена по id, источник всегда mine', () => {
    let l = emptyLibrary()
    const r1 = upsertMine(l, { ...friend, source: { kind: 'official', date: '2026-11' } }, '2026-11-15')
    expect(r1.ok && r1.library.items[0].strategy.source.kind).toBe('mine')
    l = r1.ok ? r1.library : l
    const r2 = upsertMine(l, { ...friend, minutesPerMap: 7 }, '2026-11-20')
    expect(r2.ok && r2.library.items).toHaveLength(1)
    expect(r2.ok && r2.library.items[0]).toMatchObject({ addedAt: '2026-11-15', strategy: { minutesPerMap: 7 } })
    expect(removeEntry(r2.ok ? r2.library : l, 'strongbox-free').items).toEqual([])
  })
})

describe('советник: импорт по коду', () => {
  it('новая — «Добавить»: источник imported, автор и дата сохраняются', () => {
    expect(importPlan(friend, emptyLibrary(), [official])).toEqual({ match: 'new', existing: null })
    const r = applyImport(emptyLibrary(), friend, 'add', [official], '2026-11-16')
    expect(r.ok && r.library.items[0]).toEqual({ strategy: { ...friend, source: { ...friend.source, kind: 'imported' } }, addedAt: '2026-11-16' })
  })

  it('точно такая уже есть (своя или наша, даже под другим id) — «уже есть», добавить нельзя', () => {
    const mine = lib({ ...friend, source: { ...friend.source, kind: 'imported' } })
    expect(importPlan(friend, mine, [])).toMatchObject({ match: 'same', existing: { id: 'strongbox-free', kind: 'imported' } })
    expect(applyImport(mine, friend, 'add', [], '2026-11-16')).toEqual({ ok: false, error: 'exists' })
    expect(applyImport(mine, friend, 'copy', [], '2026-11-16')).toEqual({ ok: false, error: 'exists' })
    expect(importPlan({ ...official, source: { ...official.source, kind: 'mine' } }, emptyLibrary(), [official])).toMatchObject({ match: 'same', existing: { kind: 'official' } })
  })

  it('своя с тем же id, но другая — «Заменить мою» (id тот же) или «Добавить копией»', () => {
    const old = lib({ ...friend, source: { ...friend.source, kind: 'mine' }, minutesPerMap: 9 })
    expect(importPlan(friend, old, [])).toMatchObject({ match: 'conflict', existing: { id: 'strongbox-free', kind: 'mine' } })
    const rep = applyImport(old, friend, 'replace', [], '2026-11-16')
    expect(rep.ok && rep.id).toBe('strongbox-free')
    expect(rep.ok && rep.library.items).toHaveLength(1)
    expect(rep.ok && rep.library.items[0].strategy.minutesPerMap).toBe(5)
    const cp = applyImport(old, friend, 'copy', [], '2026-11-16')
    expect(cp.ok && cp.id).toBe('strongbox-free-2')
    expect(cp.ok && cp.library.items).toHaveLength(2)
    expect(applyImport(old, friend, 'add', [], '2026-11-16')).toEqual({ ok: false, error: 'exists' })
  })

  it('наша или из каталога с тем же id — только копией, заменить нельзя', () => {
    const changed = { ...official, minutesPerMap: 3, source: { ...official.source, kind: 'mine' as const } }
    expect(importPlan(changed, emptyLibrary(), [official])).toMatchObject({ match: 'conflict', existing: { kind: 'official' } })
    expect(applyImport(emptyLibrary(), changed, 'replace', [official], '2026-11-16')).toEqual({ ok: false, error: 'exists' })
    const cp = applyImport(emptyLibrary(), changed, 'copy', [official], '2026-11-16')
    expect(cp.ok && cp.id).toBe('essence-basic-2')
  })

  it('не больше MAX_LIBRARY своих', () => {
    const full = lib(...Array.from({ length: MAX_LIBRARY }, (_, i) => ({ ...friend, id: `s-${i}`, minutesPerMap: 1 + i / 1000 })))
    expect(applyImport(full, friend, 'add', [], '2026-11-16')).toEqual({ ok: false, error: 'full' })
  })
})

describe('советник: файлы каталога сообщества', () => {
  it('файл из кода: community, проверено, номер заявки; читается обратно', () => {
    const f = json(communityFile({ ...friend, draft: true }, '2026-11-20', 42))
    expect(f).toMatchObject({ schema: 1, checked: '2026-11-20', issue: 42, strategy: { source: { kind: 'community', author: 'Kotik' }, draft: false } })
    const r = parseCommunityFile(f, 'strongbox-free')
    expect(r.ok && r.entry).toMatchObject({ checked: '2026-11-20', issue: 42, strategy: { id: 'strongbox-free' } })
  })

  it('строго: лишние поля, другой источник, имя файла ≠ id, битая стратегия — ошибка', () => {
    const f = json(communityFile(friend, '2026-11-20')) as Record<string, unknown> & { strategy: Record<string, unknown> }
    expect(parseCommunityFile({ ...f, rating: 5 })).toMatchObject({ ok: false, error: expect.stringContaining('rating') })
    expect(parseCommunityFile({ ...f, checked: 'вчера' })).toMatchObject({ ok: false })
    expect(parseCommunityFile({ ...f, strategy: { ...f.strategy, source: { kind: 'official', date: '2026-11' } } })).toMatchObject({ ok: false, error: expect.stringContaining('community') })
    expect(parseCommunityFile(f, 'other-id')).toMatchObject({ ok: false, error: expect.stringContaining('имя файла') })
    expect(parseCommunityFile({ ...f, strategy: { ...f.strategy, why: { en: '<a href=x>' } } })).toMatchObject({ ok: false })
    expect(parseCommunityFile({ ...f, schema: 2 })).toMatchObject({ ok: false })
  })
})
