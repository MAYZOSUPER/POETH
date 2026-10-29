import { describe, expect, it } from 'vitest'
import { GAMES } from '@shared/games'
import { buildDevFlag, buildOn } from '@shared/build/flag'

describe('вкладка «Билд»: флаг', () => {
  it('до релиза скрыта в обеих играх', () => {
    expect(buildOn(GAMES.poe1, false)).toBe(false)
    expect(buildOn(GAMES.poe2, false)).toBe(false)
  })

  it('POETH_BUILD=1 включает только в PoE 1', () => {
    expect(buildDevFlag({ POETH_BUILD: '1' })).toBe(true)
    expect(buildDevFlag({ POETH_BUILD: 'true' })).toBe(false)
    expect(buildDevFlag({})).toBe(false)
    expect(buildOn(GAMES.poe1, true)).toBe(true)
    expect(buildOn(GAMES.poe2, true)).toBe(false)
  })

  it('features.build = true (будущий релиз) включает без флага', () => {
    const def = { ...GAMES.poe1, features: { ...GAMES.poe1.features, build: true } }
    expect(buildOn(def, false)).toBe(true)
  })
})
