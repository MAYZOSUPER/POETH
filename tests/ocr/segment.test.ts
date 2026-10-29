import path from 'path'
import { describe, expect, it } from 'vitest'
import { crop, resize } from '@shared/ocr/bitmap'
import { countGlyphs, glyphsOf } from '@shared/ocr/cells'
import { components, findTable, textLines, type Box } from '@shared/ocr/segment'
import { readPng } from './png'

// Разметка стакана (S28): где таблица, строки, ячейки и знаки — без распознавателя.

const alt = readPng(path.resolve(__dirname, '../fixtures/ocr/poe1/market-ratio-alt-en.png'))
const exchange = readPng(path.resolve(__dirname, '../fixtures/ocr/poe1/exchange-window-en.png'))

describe('findTable', () => {
  // от ~720p до 4K относительно скриншота пользователя
  for (const k of [0.66, 0.75, 0.9, 1, 1.25, 1.33, 1.5, 2, 3]) {
    it(`${k}×: шесть строк, «‹» только у последней, шаг строк ровный`, () => {
      const t = findTable(k === 1 ? alt : resize(alt, k), 13 * k)
      expect(t?.rows).toHaveLength(6)
      expect(t!.rows.map((r) => r.beyond)).toEqual([false, false, false, false, false, true])
      // верх строки гуляет на высоту «выносных» цифр (6 и 8 выше, 3 и 9 ниже) — не больше трети цифры
      const steps = t!.rows.slice(1).map((r, i) => r.y0 - t!.rows[i].y0)
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(t!.glyphH * 0.35)
    })
  }

  it('окно обмена без Alt — не таблица', () => {
    expect(findTable(exchange, 13)).toBeNull()
  })

  it('область у курсора (как в приложении): таблица находится и без остального окна', () => {
    // курсор над «Рыночным курсом» (≈ 385, 60 на скриншоте) — область bookArea при высоте цифр 13
    const area = crop(alt, { x: 385 - 13 * 22, y: 60 - 13 * 8, width: 13 * 44, height: 13 * 34 })
    expect(findTable(area, 13)?.rows).toHaveLength(6)
  })

  it('пустой снимок — не таблица', () => {
    expect(findTable({ width: 200, height: 120, data: new Uint8Array(200 * 120 * 4) }, 13)).toBeNull()
  })
})

describe('строки и знаки', () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) })

  it('компоненты маски: 8-связность', () => {
    const w = 6
    const mask = new Uint8Array([1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    expect(components(mask, w, 3).map((b) => [b.x0, b.y0, b.x1, b.y1, b.area])).toEqual([
      [0, 0, 2, 2, 2],
      [5, 0, 6, 2, 2]
    ])
  })

  it('цифры «старого стиля» (выше/ниже строки) — одна строка; мелкие метки — к ближней строке', () => {
    const lines = textLines([box(0, 2, 6, 13), box(8, 0, 14, 13), box(16, 2, 22, 15), box(30, 6, 32, 8), box(0, 40, 6, 51)], 13)
    expect(lines).toHaveLength(2)
    expect(lines[0].boxes).toHaveLength(4)
  })

  it('знаки ячейки: обломки цифры склеиваются, точка внизу между цифрами — точка', () => {
    // «2», порванная на малом разрешении: верх и хвост снизу
    expect(countGlyphs([box(0, 0, 7, 8), box(0, 9, 7, 11)], 11, 0, 11)).toEqual({ digits: 1, dots: 0, sure: true })
    // «1.04»
    const g = glyphsOf([box(0, 0, 4, 11), box(6, 9, 8, 11), box(10, 0, 17, 11), box(18, 0, 25, 11)], 11, 0, 11)
    expect(g.map((x) => x.kind)).toEqual(['digit', 'dot', 'digit', 'digit'])
    // слипшиеся «18» шире обычной цифры — счёт ненадёжен
    expect(countGlyphs([box(0, 0, 14, 11)], 11, 0, 11).sure).toBe(false)
  })
})
