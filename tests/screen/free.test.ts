import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { resize } from '@shared/ocr/bitmap'
import type { LayoutSet } from '@shared/screen/layout'
import { recognizeStash } from '@shared/screen/recognize'
import { readPng } from '../ocr/png'
import { compare, compareFree, embed, FIX, loadIcons, loadTruth, type FreeTruth } from './helpers'

// PoE 1 (S68): снимков особых вкладок из игры пока нет — синтетика из настоящих иконок PoE 1 (tools/screen/
// make-synthetic.ts). Два пути:
// - с раскладкой (как у PoE 2): раскладка здесь собрана из разметки синтетики — проверяет, что путь работает на
//   иконках PoE 1 (цвет, 48 точек, другой размер ячейки); настоящие раскладки PoE 1 — с образцов пользователя;
// - без раскладки (запасной: PoE 1 сейчас и новые вкладки после патча) — только замер, порог ниже: ≈ 75 % на
//   синтетике, пропуски — рамки, проигравшие квадратам «на полшага». PoE 2 без раскладки — тоже замер.

describe('без раскладки: синтетика PoE 1', () => {
  const truth = JSON.parse(readFileSync(path.join(FIX, 'poe1/synthetic-currency-1080.json'), 'utf8')) as FreeTruth
  const src = readPng(path.join(FIX, 'poe1/synthetic-currency-1080.png'))
  const icons = loadIcons('poe1')
  for (const [label, res, ui] of [
    ['1080p', 1, 1],
    ['1440p', 4 / 3, 1],
    ['4K', 2, 1],
    ['1080p, интерфейс 0,85', 1, 0.85],
    ['1440p, интерфейс 1,2', 4 / 3, 1.2]
  ] as const)
    it(label, () => {
      const k = res * ui
      const H = Math.round(1080 * res)
      const dx = Math.round(truth.offset.x * k)
      const dy = Math.round(truth.offset.y * k)
      const shot = embed(k === 1 ? src : resize(src, k), Math.round((H * 16) / 9), H, dx, dy)
      const r = recognizeStash({ img: shot, clientHeight: H, icons })
      const s = compareFree(r.cells, truth, k, dx, dy)
      console.log(`PoE 1 синтетика ${label}: ячейки ${s.cells}/${s.total}; найдено ${r.cells.length}; ${Math.round(r.ms.find)}+${Math.round(r.ms.match)} мс` + (s.errors.length ? `\n  ${s.errors.join('\n  ')}` : ''))
      expect(r.tab).toBeNull()
      expect(s.cells / s.total).toBeGreaterThanOrEqual(0.65)
      // лишние «ячейки» (рисунок фона) — не больше 5 %
      expect(r.cells.length).toBeLessThanOrEqual(Math.ceil(s.total * 1.05))
    }, 30_000)
})

describe('с раскладкой: синтетика PoE 1', () => {
  const truth = JSON.parse(readFileSync(path.join(FIX, 'poe1/synthetic-currency-1080.json'), 'utf8')) as FreeTruth
  const src = readPng(path.join(FIX, 'poe1/synthetic-currency-1080.png'))
  const icons = loadIcons('poe1')
  const layouts: LayoutSet = {
    version: 1,
    game: 'poe1',
    refHeight: truth.clientHeight,
    tabs: [
      {
        id: 'synthetic',
        slots: truth.cells.map((c) => ({
          x: c.rect.x + truth.offset.x + c.rect.width / 2,
          y: c.rect.y + truth.offset.y + c.rect.height / 2,
          w: c.rect.width,
          h: c.rect.height,
          item: c.item
        }))
      }
    ]
  }
  const asTruth = { clientHeight: truth.clientHeight, tab: 'synthetic', cells: truth.cells.map((c, slot) => ({ slot, item: c.item, count: c.count })) }
  for (const [label, res, ui] of [
    ['1080p', 1, 1],
    ['1440p', 4 / 3, 1],
    ['4K', 2, 1],
    ['1080p, интерфейс 0,85', 1, 0.85],
    ['1440p, интерфейс 1,2', 4 / 3, 1.2]
  ] as const)
    it(label, () => {
      const k = res * ui
      const H = Math.round(1080 * res)
      const shot = embed(k === 1 ? src : resize(src, k), Math.round((H * 16) / 9), H, Math.round(truth.offset.x * k), Math.round(truth.offset.y * k))
      const r = recognizeStash({ img: shot, clientHeight: H, icons, layouts })
      const s = compare(r.cells, asTruth)
      const errs = s.errors.filter((e) => !e.includes('число'))
      console.log(`PoE 1 синтетика с раскладкой ${label}: ячейки ${s.cells}/${s.total}; ${Math.round(r.ms.find)}+${Math.round(r.ms.match)} мс ${errs.join('; ')}`)
      expect(r.tab).toBe('synthetic')
      expect(s.cells / s.total).toBeGreaterThanOrEqual(0.95)
    }, 30_000)
})

describe('без раскладки: эталоны PoE 2', () => {
  const icons = loadIcons('poe2')
  for (const name of ['p2p-orbs-1440-gray', 'p2p-essence-1440-gray'])
    it(name, () => {
      const truth = loadTruth(`poe2/${name}.json`)
      const shot = embed(readPng(path.join(FIX, 'poe2', `${name}.png`)), 2560, 1440, 40, 240)
      const r = recognizeStash({ img: shot, clientHeight: 1440, icons })
      // номеров ячеек без раскладки нет — сверка по месту: ячейка разметки ↔ ячейка раскладки, найденная по месту
      const layouts = JSON.parse(readFileSync(path.join(FIX, '../../../resources/data/poe2/screen/stash-layouts.json'), 'utf8'))
      const tab = layouts.tabs.find((t: { id: string }) => t.id === truth.tab)
      const placed = r.cells.map((c) => {
        const cx = c.rect.x + c.rect.width / 2
        const cy = c.rect.y + c.rect.height / 2
        const slot = tab.slots.findIndex((s: { x: number; y: number; w: number }) => Math.hypot(s.x - cx, s.y - cy) < s.w * 0.34)
        return { ...c, slot: slot >= 0 ? slot : undefined, item: c.item, alt: c.alt }
      })
      const fixed = placed.map((c) => (c.slot !== undefined && c.alt?.includes(tab.slots[c.slot].item) ? { ...c, item: tab.slots[c.slot].item } : c))
      const s = compare(fixed, truth)
      console.log(`PoE 2 без раскладки ${name}: ячейки ${s.cells}/${s.total}; найдено ${r.cells.length}`)
      // без раскладки PoE 2 слабее (уровни одного рисунка, пустые силуэты без числа) — только замер, без порога
      expect(s.cells).toBeGreaterThan(0)
    }, 30_000)
})
