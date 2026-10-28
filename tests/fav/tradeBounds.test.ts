import { describe, expect, it } from 'vitest'
import {
  boundsOverGame,
  gameSizeOf,
  GAME_SIZE_DEFAULT,
  normalizeGameSize,
  TRADE_MIN_SIZE
} from '../../src/main/windows/tradeBounds'

// Трейд-окно «поверх игры»: по центру клиентской области игры, размер — доля окна игры.

const FHD = { x: 0, y: 0, width: 1920, height: 1080 }

describe('boundsOverGame', () => {
  it('по умолчанию — доля окна игры, по центру', () => {
    const b = boundsOverGame(FHD)
    expect(b.width).toBe(Math.round(1920 * GAME_SIZE_DEFAULT.w))
    expect(b.height).toBe(Math.round(1080 * GAME_SIZE_DEFAULT.h))
    // по центру с точностью до пикселя округления
    expect(Math.abs(b.x * 2 + b.width - 1920)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.y * 2 + b.height - 1080)).toBeLessThanOrEqual(1)
  })

  it('игра на втором мониторе и в окне — внутри её клиентской области', () => {
    const area = { x: 2200, y: 140, width: 1600, height: 900 }
    const b = boundsOverGame(area, { w: 0.75, h: 0.8 })
    expect(b).toEqual({ x: 2400, y: 230, width: 1200, height: 720 })
  })

  it('не меньше минимума трейд-окна, но и не больше самой игры', () => {
    expect(boundsOverGame(FHD, { w: 0.4, h: 0.4 })).toMatchObject(TRADE_MIN_SIZE)
    const small = { x: 10, y: 20, width: 800, height: 600 }
    // ширина — не больше игры (800), высота — минимум окна (560) по центру
    expect(boundsOverGame(small)).toEqual({ x: 10, y: 40, width: 800, height: 560 })
  })

  it('мусор в файле — доля по умолчанию; пределы 0.4…1', () => {
    expect(normalizeGameSize(null)).toEqual(GAME_SIZE_DEFAULT)
    expect(normalizeGameSize({ w: 'x', h: Number.NaN })).toEqual(GAME_SIZE_DEFAULT)
    expect(normalizeGameSize({ w: 5, h: 0.1 })).toEqual({ w: 1, h: 0.4 })
  })

  it('ресайз запоминается долей и даёт тот же размер в следующий раз', () => {
    const size = gameSizeOf({ width: 1440, height: 864 }, FHD)
    expect(size).toEqual({ w: 0.75, h: 0.8 })
    expect(boundsOverGame(FHD, size)).toMatchObject({ width: 1440, height: 864 })
  })
})
