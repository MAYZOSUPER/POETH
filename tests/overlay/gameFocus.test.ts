import { describe, expect, it } from 'vitest'
import {
  getGameFocus,
  isGameFocused,
  isOverlayActive,
  onGameFocusChange,
  setGameFocus
} from '../../src/main/focus/gameFocus'
import type { OverlayFocusState } from '@shared/types'

describe('gameFocus', () => {
  it('подписчики получают только реальные изменения', () => {
    setGameFocus({ game: false, overlay: false, usingHotkey: false, tracking: true })
    const seen: OverlayFocusState[] = []
    const off = onGameFocusChange((next) => seen.push(next))

    setGameFocus({ game: true })
    setGameFocus({ game: true }) // без изменений — без события
    setGameFocus({ game: false })
    off()
    setGameFocus({ game: true }) // после отписки — тишина

    expect(seen).toEqual([
      { game: true, overlay: false, usingHotkey: false },
      { game: false, overlay: false, usingHotkey: false }
    ])
  })

  it('фокус игры снимает активность оверлея (как APT)', () => {
    setGameFocus({ game: false, overlay: true, tracking: true })
    expect(isOverlayActive()).toBe(true)
    setGameFocus({ game: true })
    expect(getGameFocus()).toMatchObject({ game: true, overlay: false })
  })

  it('явный overlay вместе с game не перетирается', () => {
    setGameFocus({ game: true, overlay: true })
    expect(isOverlayActive()).toBe(true)
  })

  it('запасной режим (нет нативного модуля): игра считается в фокусе', () => {
    setGameFocus({ game: false, overlay: false, tracking: false })
    expect(isGameFocused()).toBe(true)
    setGameFocus({ tracking: true })
    expect(isGameFocused()).toBe(false)
  })

  it('ошибка в подписчике не ломает остальных', () => {
    setGameFocus({ game: false, overlay: false, tracking: true })
    let called = false
    const off1 = onGameFocusChange(() => {
      throw new Error('boom')
    })
    const off2 = onGameFocusChange(() => {
      called = true
    })
    const err = console.error
    console.error = () => undefined
    try {
      setGameFocus({ game: true })
    } finally {
      console.error = err
      off1()
      off2()
    }
    expect(called).toBe(true)
  })
})
