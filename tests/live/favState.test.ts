import { describe, expect, it } from 'vitest'
import { favLiveState } from '../../src/main/games/poe1/live/favState'

describe('молния избранного: состояние live-поиска', () => {
  it('состояния подключения → состояния молнии', () => {
    expect(favLiveState('idle', true)).toBe('off')
    expect(favLiveState('connecting', true)).toBe('connecting')
    expect(favLiveState('backoff', true)).toBe('connecting')
    expect(favLiveState('open', true)).toBe('on')
    expect(favLiveState('ratelimited', true)).toBe('paused')
    expect(favLiveState('auth', true)).toBe('auth')
    expect(favLiveState('invalid', true)).toBe('error')
  })

  it('главный выключатель Live выключен — всё «off»', () => {
    expect(favLiveState('open', false)).toBe('off')
  })
})
