import { describe, expect, it } from 'vitest'
import { resize, type Bitmap } from '@shared/ocr/bitmap'
import { recognizeGrid } from '@shared/screen/grid'
import { decodeThumbs } from '@shared/screen/thumbs'
import { readFileSync } from 'fs'
import path from 'path'
import { inflateSync } from 'zlib'
import { FIX, loadIcons } from './helpers'

// Окно с обычной сеткой (S68, заготовка для Ритуала и торговца Экспедиции): решётка 12×10 из нарисованных ячеек,
// предметы 1×1 — эскизы иконок PoE 1, растянутые на ячейку, и два «крупных предмета» 2×3 (шум). Снимков окон из
// игры пока нет — проверяется геометрия (решётка при 1080p / 1440p) и узнавание предметов 1×1.

const thumbs = decodeThumbs(new Uint8Array(inflateSync(readFileSync(path.join(FIX, 'poe1/thumbs.bin')))))!

function gridWindow(): { img: Bitmap; items: Array<{ col: number; row: number; name: string }> } {
  const W = 1920
  const H = 1080
  const data = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) data.set([20, 22, 26, 255], i * 4)
  const set = (x: number, y: number, b: number, g: number, r: number): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    data.set([b, g, r, 255], (y * W + x) * 4)
  }
  const X0 = 300
  const Y0 = 220
  const P = 52
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 12; i++)
      for (let y = 0; y < P; y++)
        for (let x = 0; x < P; x++) {
          const edge = x === 0 || y === 0
          const v = edge ? 90 : 14 + ((x * 7 + y * 3) % 5)
          set(X0 + i * P + x, Y0 + j * P + y, v, edge ? 80 : v, edge ? 70 : v)
        }
  // правая и нижняя линии решётки
  for (let k = 0; k <= 12 * P; k++) set(X0 + k, Y0 + 10 * P, 90, 80, 70)
  for (let k = 0; k <= 10 * P; k++) set(X0 + 12 * P, Y0 + k, 90, 80, 70)
  const items: Array<{ col: number; row: number; name: string }> = []
  const used = new Set<string>()
  const pick = thumbs.filter((_, i) => i % 7 === 0).slice(0, 18)
  pick.forEach((t, n) => {
    const col = (n * 5) % 12
    const row = Math.floor((n * 5) / 12) * 2 % 10
    if (used.has(`${col},${row}`) || (col >= 8 && row >= 4)) return
    used.add(`${col},${row}`)
    items.push({ col, row, name: t.name })
    const inner = Math.round(P * 0.88)
    const ox = X0 + col * P + Math.round((P - inner) / 2)
    const oy = Y0 + row * P + Math.round((P - inner) / 2)
    for (let y = 0; y < inner; y++)
      for (let x = 0; x < inner; x++) {
        const sx = Math.min(t.size - 1, Math.floor((x / inner) * t.size))
        const sy = Math.min(t.size - 1, Math.floor((y / inner) * t.size))
        const q = (sy * t.size + sx) * 4
        const a = t.rgba[q + 3] / 255
        const p = ((oy + y) * W + ox + x) * 4
        data[p] = Math.round(data[p] * (1 - a) + t.rgba[q + 2] * a)
        data[p + 1] = Math.round(data[p + 1] * (1 - a) + t.rgba[q + 1] * a)
        data[p + 2] = Math.round(data[p + 2] * (1 - a) + t.rgba[q] * a)
      }
  })
  // «крупный предмет» 2×3 в правом нижнем углу: шумный рисунок
  for (let y = 4; y < 3 * P - 4; y++)
    for (let x = 4; x < 2 * P - 4; x++) {
      const v = 60 + ((x * 13 + y * 7) % 120)
      set(X0 + 9 * P + x, Y0 + 5 * P + y, v, v - 20, v + 30)
    }
  return { img: { width: W, height: H, data }, items }
}

describe('сетка окна (Ритуал, торговец Экспедиции)', () => {
  const icons = loadIcons('poe1')
  const { img, items } = gridWindow()
  for (const k of [1, 4 / 3])
    it(k === 1 ? '1080p' : '1440p', () => {
      const shot = k === 1 ? img : resize(img, k)
      const r = recognizeGrid({ img: shot, clientHeight: Math.round(1080 * k), icons })
      expect(r.lattice).not.toBeNull()
      const lat = r.lattice!
      expect(lat.cols).toBe(12)
      expect(lat.rows).toBe(10)
      expect(lat.pitch).toBeGreaterThan(52 * k * 0.95)
      expect(lat.pitch).toBeLessThan(52 * k * 1.05)
      let ok = 0
      for (const it of items) {
        const c = r.cells.find((c) => c.slot === it.row * lat.cols + it.col)
        if (c?.present && c.item === it.name) ok++
        else console.log(`  ${it.name} @${it.col},${it.row} → ${c?.item} ${c?.present} ${c?.match.toFixed(2)}`)
      }
      const big = r.cells.filter((c) => c.present && !c.item).length
      const empty = r.cells.filter((c) => !c.present).length
      console.log(`сетка ${k === 1 ? '1080p' : '1440p'}: ${lat.cols}×${lat.rows}, шаг ${lat.pitch.toFixed(1)}; 1×1 узнано ${ok}/${items.length}; занято без узнавания ${big}; пусто ${empty}; ${Math.round(r.ms)} мс`)
      expect(ok / items.length).toBeGreaterThanOrEqual(0.9)
      // 6 ячеек крупного предмета — «заняты, не узнаны»; пустые не путаются с занятыми
      expect(big).toBeGreaterThanOrEqual(6)
      expect(empty).toBeGreaterThanOrEqual(120 - items.length - 6 - 2)
    }, 30_000)
})
