import { describe, expect, it } from 'vitest'
import { GAMES } from '@shared/games'
import { buildDevFlag, buildOn } from '@shared/build/flag'

describe('вкладка «Билд»: флаг', () => {
  it('раскрыта в PoE 1, в PoE 2 — пока нет (экран PoE 2 — S66, включает лид флагом features.build)', () => {
    expect(buildOn(GAMES.poe1, false)).toBe(true)
    expect(buildOn(GAMES.poe2, false)).toBe(false)
  })

  it('POETH_BUILD=1 включает в обеих играх (S66: в PoE 2 — свой экран)', () => {
    expect(buildDevFlag({ POETH_BUILD: '1' })).toBe(true)
    expect(buildDevFlag({ POETH_BUILD: 'true' })).toBe(false)
    expect(buildDevFlag({})).toBe(false)
    expect(buildOn(GAMES.poe1, true)).toBe(true)
    expect(buildOn(GAMES.poe2, true)).toBe(true)
  })

  it('features.build = true (будущий релиз) включает без флага', () => {
    const def = { ...GAMES.poe1, features: { ...GAMES.poe1.features, build: true } }
    expect(buildOn(def, false)).toBe(true)
  })
})
