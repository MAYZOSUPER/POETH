import { describe, expect, it } from 'vitest'
import { GAMES } from '@shared/games'
import { advisorDevFlag, advisorOn } from '@shared/advisor/flag'

describe('советник: флаг вкладки', () => {
  it('раскрыт в PoE 1, в PoE 2 скрыт', () => {
    expect(GAMES.poe1.features.advisor).toBe(true)
    expect(GAMES.poe2.features.advisor).toBe(false)
    expect(advisorOn(GAMES.poe1, false)).toBe(true)
    expect(advisorOn(GAMES.poe2, false)).toBe(false)
  })

  it('POETH_ADVISOR=1 включает только в PoE 1', () => {
    expect(advisorDevFlag({ POETH_ADVISOR: '1' })).toBe(true)
    expect(advisorDevFlag({ POETH_ADVISOR: 'true' })).toBe(false)
    expect(advisorDevFlag({})).toBe(false)
    expect(advisorOn(GAMES.poe1, true)).toBe(true)
    expect(advisorOn(GAMES.poe2, true)).toBe(false)
  })

  it('features.advisor = true (будущий релиз) включает без флага', () => {
    const def = { ...GAMES.poe1, features: { ...GAMES.poe1.features, advisor: true } }
    expect(advisorOn(def, false)).toBe(true)
  })
})
