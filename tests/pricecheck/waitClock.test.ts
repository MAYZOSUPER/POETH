import { describe, expect, it } from 'vitest'
import { waitClock } from '../../src/renderer/src/overlay/pricecheck/format'

// S37: обратный отсчёт до повтора после лимита сайта — минуты и секунды, а не «0:120».
describe('waitClock', () => {
  it('меньше минуты — 0:SS', () => {
    expect(waitClock(45)).toBe('0:45')
    expect(waitClock(5)).toBe('0:05')
  })
  it('минута и больше — M:SS', () => {
    expect(waitClock(60)).toBe('1:00')
    expect(waitClock(120)).toBe('2:00')
    expect(waitClock(299.2)).toBe('5:00')
  })
  it('прошедшее время — 0:00', () => {
    expect(waitClock(-3)).toBe('0:00')
    expect(waitClock(0)).toBe('0:00')
  })
})
