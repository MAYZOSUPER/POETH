import { describe, expect, it } from 'vitest'
import {
  boundsOverGame,
  gameSizeOf,
  normalizeGameSize,
  poeOverlaySize,
  TRADE_MIN_SIZE
} from '../../src/main/windows/tradeBounds'

// Трейд-окно «поверх игры»: по центру клиентской области игры; размер — как у браузера
// PoE Overlay (min(h·1.3, w·0.7) × 0.7·h), пока игрок не растянул окно сам.

const FHD = { x: 0, y: 0, width: 1920, height: 1080 }

describe('boundsOverGame', () => {
  it('по умолчанию — размер браузера PoE Overlay, по центру игры', () => {
    expect(poeOverlaySize(FHD)).toEqual({ width: 1344, height: 756 })
    expect(boundsOverGame(FHD)).toEqual({ x: 288, y: 162, width: 1344, height: 756 })
    // 21:9 — ширину ограничивает 1.3·высоты
    expect(poeOverlaySize({ width: 3440, height: 1440 })).toEqual({ width: 1872, height: 1008 })
  })

  it('игра на втором мониторе и в окне — внутри её клиентской области', () => {
    const area = { x: 2200, y: 140, width: 1600, height: 900 }
    expect(boundsOverGame(area, { w: 0.75, h: 0.8 })).toEqual({ x: 2400, y: 230, width: 1200, height: 720 })
  })

  it('не меньше минимума трейд-окна, но и не больше самой игры', () => {
    expect(boundsOverGame(FHD, { w: 0.4, h: 0.4 })).toMatchObject(TRADE_MIN_SIZE)
    const small = { x: 10, y: 20, width: 800, height: 600 }
    // ширина — не больше игры (800), высота — минимум окна (560) по центру
    expect(boundsOverGame(small)).toEqual({ x: 10, y: 40, width: 800, height: 560 })
  })

  it('мусор в файле — как у PoE Overlay; пределы доли 0.4…1', () => {
    expect(normalizeGameSize(null)).toBeNull()
    expect(normalizeGameSize({ w: 'x', h: 0.5 })).toBeNull()
    expect(normalizeGameSize({ w: 0.5, h: Number.NaN })).toBeNull()
    expect(normalizeGameSize({ w: 5, h: 0.1 })).toEqual({ w: 1, h: 0.4 })
    expect(boundsOverGame(FHD, { w: 'x' })).toEqual(boundsOverGame(FHD))
  })

  it('ресайз запоминается долей и даёт тот же размер в следующий раз', () => {
    const size = gameSizeOf({ width: 1440, height: 864 }, FHD)
    expect(size).toEqual({ w: 0.75, h: 0.8 })
    expect(boundsOverGame(FHD, size)).toMatchObject({ width: 1440, height: 864 })
  })
})
