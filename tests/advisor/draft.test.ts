import { describe, expect, it } from 'vitest'
import {
  draftFromStrategy,
  draftToStrategy,
  emptyDraft,
  measureSessions,
  parseDraft,
  parseQty,
  stepHasErrors,
  type AdvisorDraft
} from '@shared/advisor/draft'
import { validateStrategy } from '@shared/advisor/validate'
import { done, strategy, T } from './fixtures'

// Редактор стратегии (S17): черновик ↔ стратегия схемы 1, ошибки по шагам мастера.

const ctx = { patch: '3.30', date: '2026-11-15' }

function filledDraft(): AdvisorDraft {
  const d = emptyDraft('ru')
  d.name = { ru: 'Сущности + засада' }
  d.summary = { ru: 'Скарабей засады к сущностям' }
  d.why = { ru: 'Сундуки окупают скарабея' }
  d.tags = ['essence', 'strongbox', 'maps']
  d.inputs.push({ key: 'a', kind: 'stackable', ref: 'Essence Scarab', ru: 'Скарабей Сущности', qty: '1' })
  d.outputs = [{ key: 'b', kind: 'stackable', ref: 'Deafening Essence of Greed', qty: '0,7' }]
  d.steps = [{ ru: 'Карта и два скарабея' }, { ru: '' }]
  d.atlas = [{ ru: 'Ветки сущностей и сундуков' }, {}]
  d.atlasTree = 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/3.30.0/AAAA'
  d.difficulty = 1
  d.build = { damage: 2, survival: 2, speed: 1, note: { ru: 'Нужна живучесть' } }
  return d
}

describe('советник: черновик редактора', () => {
  it('заполненный черновик → стратегия, которая проходит строгий валидатор', () => {
    const r = draftToStrategy(filledDraft(), ctx)
    expect(r.errors).toEqual([])
    expect(r.strategy).not.toBeNull()
    expect(validateStrategy(JSON.parse(JSON.stringify(r.strategy))).ok).toBe(true)
    expect(r.strategy).toMatchObject({
      name: { ru: 'Сущности + засада' },
      tags: ['essence', 'strongbox'], // только механики
      steps: [{ ru: 'Карта и два скарабея' }], // пустой шаг отброшен
      atlas: [{ ru: 'Ветки сущностей и сундуков' }],
      inputs: [{ item: { kind: 'map', label: { ru: 'Своя карта T14–16', en: 'Own map T14–16' } }, qty: 1, own: true }, { item: { kind: 'stackable', ref: 'Essence Scarab' }, qty: 1 }],
      outputs: [{ item: { kind: 'stackable', ref: 'Deafening Essence of Greed' }, qty: 0.7 }],
      source: { kind: 'mine', date: '2026-11-15' },
      patch: '3.30',
      atlasTree: 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/3.30.0/AAAA'
    })
  })

  it('пустой черновик: ошибки на шагах 1, 3, 4, 5; шаг 2 (только своя карта) — без ошибок', () => {
    const r = draftToStrategy(emptyDraft('ru'), ctx)
    expect(r.strategy).toBeNull()
    expect([1, 2, 3, 4, 5].map((s) => stepHasErrors(r.errors, s))).toEqual([true, false, true, true, true])
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['name.required', 'outputs.none', 'steps.none', 'difficulty', 'build']))
  })

  it('ошибки полей: количество, длина, HTML, ссылка без https, предмет без имени', () => {
    const d = filledDraft()
    d.inputs[1].qty = '0'
    d.outputs.push({ key: 'c', kind: 'stackable', qty: '1' })
    d.summary = { ru: 'я'.repeat(201) }
    d.why = { ru: '<b>жирно</b>' }
    d.atlasTree = 'pathofexile.com/fullscreen-atlas-skill-tree'
    const r = draftToStrategy(d, ctx)
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { step: 2, field: 'inputs.1', code: 'line.qty' },
        { step: 3, field: 'outputs.1', code: 'line.item' },
        { step: 1, field: 'summary.ru', code: 'text.long', max: 200 },
        { step: 1, field: 'why.ru', code: 'text.unsafe' },
        { step: 4, field: 'atlasTree', code: 'tree.https' }
      ])
    )
  })

  it('два языка: в стратегию идут оба; выключенный язык не попадает', () => {
    const d = filledDraft()
    d.langs = ['ru', 'en']
    d.name = { ru: 'Сущности', en: 'Essences' }
    expect(draftToStrategy(d, ctx).strategy?.name).toEqual({ ru: 'Сущности', en: 'Essences' })
    d.langs = ['en']
    d.summary = { ru: 'только по-русски', en: 'English' }
    d.why = { en: 'why' }
    d.steps = [{ en: 'step' }]
    d.atlas = []
    d.build.note = {}
    const r = draftToStrategy(d, ctx)
    expect(r.strategy?.name).toEqual({ en: 'Essences' })
    expect(r.strategy?.summary).toEqual({ en: 'English' })
  })

  it('туда-обратно: своя стратегия → черновик → та же стратегия', () => {
    const s = strategy({
      id: 'my-x',
      source: { kind: 'mine', date: '2026-11-15' },
      tags: ['essence'],
      build: { damage: 2, survival: 1, speed: 3, note: T('заметка', 'note') },
      atlas: [T('ветка', 'branch')],
      warnings: [T('осторожно', 'careful')],
      atlasTree: 'https://poeplanner.com/atlas/AAAA',
      measured: { maps: 41, hours: 3.5, perHour: 88, date: '2026-11-14', patch: '3.30' },
      patch: '3.30'
    })
    const d = draftFromStrategy(s, 'my-x')
    d.outFrom = 'sessions' // замер своей сохраняется
    const r = draftToStrategy(d, ctx)
    expect(r.errors).toEqual([])
    expect(r.strategy).toEqual(validateStrategy(JSON.parse(JSON.stringify(s))).ok && { ...s })
  })

  it('количество: запятая и точка; мусор — null', () => {
    expect(parseQty('0,5')).toBe(0.5)
    expect(parseQty(' 2 ')).toBe(2)
    expect(parseQty('.3')).toBe(0.3)
    for (const bad of ['', 'abc', '1e3', '-1', '1,2,3', 'NaN']) expect(parseQty(bad)).toBeNull()
  })

  it('черновик из хранилища: только своей версии и формы', () => {
    expect(parseDraft(filledDraft())).not.toBeNull()
    for (const bad of [null, 1, [], { v: 2 }, { v: 1, inputs: 'x' }]) expect(parseDraft(bad)).toBeNull()
  })

  it('замер из сессий фарма: только сессии с учётом тайника, минимум 3 карты', () => {
    const tracked = [done({ maps: 15, durationMs: 75 * 60_000, profitChaos: 110 }), done({ maps: 14, durationMs: 72 * 60_000, profitChaos: 100 })]
    const untracked = done({ maps: 9, durationMs: 48 * 60_000, profitChaos: null })
    const m = measureSessions([...tracked, untracked], { date: '2026-11-15', patch: '3.30' })
    expect(m).toEqual({ measured: { maps: 29, hours: 2.45, perHour: 86, date: '2026-11-15', patch: '3.30' }, minutes: 5.1 })
    expect(measureSessions([untracked], { date: '2026-11-15', patch: '3.30' })).toBeNull()
    expect(measureSessions([done({ maps: 2, durationMs: 600_000, profitChaos: 5 })], { date: '2026-11-15', patch: '3.30' })).toBeNull()
  })
})
