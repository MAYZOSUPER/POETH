import { describe, expect, it } from 'vitest'
import {
  isNewerSchema,
  itemRefKey,
  mainItem,
  rumourIdOf,
  validateRumour,
  validateRumoursFile
} from '@shared/rumours/schema'
import { bundled, bundledRaw, rec } from './fixtures'

// Схема и валидатор «Слухов журнала» (S65): встроенные данные патча 0.5.5.5 и защита от битого пакета данных.

describe('встроенные данные', () => {
  it('20 слухов проходят валидатор без отброшенных полей и отказов', () => {
    const v = validateRumoursFile(bundledRaw())
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value.failed).toEqual([])
    expect(v.value.dropped).toEqual([])
    expect(v.value.file.rumours).toHaveLength(20)
    expect(v.value.file.patch).toBe('0.5.5.5')
  })

  it('категории как в игре: 11 экспедиций, 4 уникальные карты, 5 боссов', () => {
    const c = { expedition: 0, unique: 0, boss: 0 }
    for (const r of bundled().rumours) c[r.category]++
    expect(c).toEqual({ expedition: 11, unique: 4, boss: 5 })
  })

  it('у каждого слуха строка и остров на EN и RU, тир, сложность и строка RU/EN', () => {
    for (const r of bundled().rumours) {
      expect(r.text.ru, r.id).toBeTruthy()
      expect(r.island.ru, r.id).toBeTruthy()
      expect(r.tier, r.id).not.toBeNull()
      expect(r.difficulty, r.id).not.toBeNull()
      expect(r.note?.ru, r.id).toBeTruthy()
      expect(r.note?.en, r.id).toBeTruthy()
      expect((r.note?.ru ?? '').length, r.id).toBeLessThanOrEqual(140)
      expect((r.note?.en ?? '').length, r.id).toBeLessThanOrEqual(140)
    }
  })

  it('строки как в клиенте: «Fallen stars...» = «Упавшие звёзды...» → Moor of Fallen Skies / Причал Падших небес', () => {
    const r = bundled().rumours.find((x) => x.id === 'fallen-stars')!
    expect(r.text).toEqual({ en: 'Fallen stars...', ru: 'Упавшие звёзды...' })
    expect(r.island).toEqual({ en: 'Moor of Fallen Skies', ru: 'Причал Падших небес' })
    expect(r.area).toBe('ExpeditionLogBook_Heath')
  })

  it('главная награда — предмет с путём метаданных и RU-именем из игры', () => {
    const r = bundled().rumours.find((x) => x.id === 'fallen-stars')!
    const it = mainItem(r)!
    expect(itemRefKey(it)).toBe('ITEM:Perfect Flux')
    expect(it.meta).toMatch(/^Metadata\/Items\/Currency\//)
    expect(it.name.ru).toBe('Совершенный расплав')
  })

  it('острова боссов знают боссов по-русски', () => {
    const r = bundled().rumours.find((x) => x.id === 'origin-of-the-fall')!
    expect(r.category).toBe('boss')
    expect(r.bosses).toEqual([{ en: 'Olroth, Origin of the Fall', ru: 'Олрот, Исток падения' }])
  })
})

describe('валидатор', () => {
  it('нормальная запись', () => {
    const v = validateRumour(rec('cold-as-ice'))
    expect(v.ok).toBe(true)
  })

  it('RU-строки может не быть: «записать с RU-клиента»', () => {
    const v = validateRumour(rec('x-y', { text: { en: 'Cold as ice...', ru: null } }))
    expect(v.ok && v.value.text.ru).toBe(null)
  })

  it('HTML, адреса и переводы строк в тексте — отказ', () => {
    expect(validateRumour(rec('a-b', { note: { ru: '<b>жирно</b>' } })).ok).toBe(false)
    expect(validateRumour(rec('a-b', { note: { en: 'see poe.gnejs.app' } })).ok).toBe(false)
    expect(validateRumour(rec('a-b', { text: { en: 'two\nlines', ru: null } })).ok).toBe(false)
    expect(validateRumour(rec('a-b', { note: { ru: 'x'.repeat(141) } })).ok).toBe(false)
  })

  it('награда: ровно одно из item или kind; повтор — отказ', () => {
    expect(validateRumour({ ...rec('a-b'), rewards: [{ kind: 'gold', item: {} }] }).ok).toBe(false)
    expect(validateRumour({ ...rec('a-b'), rewards: [{ kind: 'gold' }, { kind: 'gold' }] }).ok).toBe(false)
    expect(validateRumour({ ...rec('a-b'), rewards: [{ kind: 'mirror' }] }).ok).toBe(false)
    const bad = { item: { ns: 'ITEM', ref: 'X', meta: '../etc', name: { en: 'X', ru: null } } }
    expect(validateRumour({ ...rec('a-b'), rewards: [bad] }).ok).toBe(false)
  })

  it('тир и сложность — 1, 2, 3 или null', () => {
    expect(validateRumour({ ...rec('a-b'), tier: 4 }).ok).toBe(false)
    const v = validateRumour({ ...rec('a-b'), tier: null, difficulty: null })
    expect(v.ok && v.value.tier).toBe(null)
  })

  it('неизвестные поля отбрасываются, но запись годится', () => {
    const v = validateRumour({ ...rec('a-b'), community: 'S+' })
    expect(v.ok).toBe(true)
    expect(v.ok && v.dropped).toEqual(['a-b.community'])
  })

  it('файл: повтор id, области или строки — только эта запись в failed', () => {
    const raw = {
      schema: 1,
      patch: '0.5.5.5',
      updatedAt: '2026-10-31',
      rumours: [rec('a-b'), rec('a-b'), { ...rec('c-d'), area: 'Area_a_b' }, { ...rec('e-f'), text: { en: 'A-B EN...', ru: null } }, { id: 'BAD' }]
    }
    const v = validateRumoursFile(raw)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value.file.rumours.map((r) => r.id)).toEqual(['a-b'])
    expect(v.value.failed.map((f) => f.error)).toEqual(['id: повтор', 'area: повтор', 'text: такая строка уже есть', expect.stringMatching(/^id:/)])
  })

  it('шапка битая — весь файл не годится; схема новее — отдельный признак', () => {
    expect(validateRumoursFile({ schema: 1, patch: 'x', updatedAt: '2026-10-31', rumours: [] }).ok).toBe(false)
    expect(isNewerSchema({ schema: 2 })).toBe(true)
    expect(isNewerSchema({ schema: 1 })).toBe(false)
  })
})

describe('rumourIdOf', () => {
  it('id из английской строки', () => {
    expect(rumourIdOf("Somethin' fishy...")).toBe('somethin-fishy')
    expect(rumourIdOf('Sulphite!')).toBe('sulphite')
    expect(rumourIdOf("It's dry at least...")).toBe('its-dry-at-least')
  })
})
