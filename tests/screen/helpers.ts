import { readFileSync } from 'fs'
import path from 'path'
import { inflateSync } from 'zlib'
import type { Bitmap } from '@shared/ocr/bitmap'
import { describe as describeIcon, type IconDesc } from '@shared/screen/icons'
import { parseLayoutSet, type LayoutSet } from '@shared/screen/layout'
import { decodeThumbs } from '@shared/screen/thumbs'
import type { ScreenCell } from '@shared/types/screen'

// Общее для тестов распознавания окон (S68): эскизы иконок из фикстур, раскладки из resources, вставка выреза в
// «окно игры» нужного размера, сверка с разметкой.

export const ROOT = path.resolve(__dirname, '../..')
export const FIX = path.join(ROOT, 'tests/fixtures/screen')

export function loadIcons(game: 'poe1' | 'poe2'): IconDesc[] {
  const thumbs = decodeThumbs(new Uint8Array(inflateSync(readFileSync(path.join(FIX, game, 'thumbs.bin')))))
  if (!thumbs) throw new Error('bad thumbs fixture')
  return thumbs.map((t) => describeIcon(t))
}

export function loadLayouts(game: 'poe1' | 'poe2'): LayoutSet {
  const set = parseLayoutSet(JSON.parse(readFileSync(path.join(ROOT, `resources/data/${game}/screen/stash-layouts.json`), 'utf8')))
  if (!set) throw new Error('bad layouts')
  return set
}

/** Вставить картинку в тёмное «окно» w×h в точку (x, y) — как вкладка в клиентской области игры. */
export function embed(img: Bitmap, w: number, h: number, x: number, y: number, seed = 7): Bitmap {
  const data = new Uint8Array(w * h * 4)
  // тёмный шумный фон (сцена игры за панелью)
  let s = seed
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const v = 18 + (s % 23)
    data[i * 4] = v
    data[i * 4 + 1] = v + 3
    data[i * 4 + 2] = v + 6
    data[i * 4 + 3] = 255
  }
  for (let j = 0; j < img.height; j++) {
    const ty = y + j
    if (ty < 0 || ty >= h) continue
    for (let i = 0; i < img.width; i++) {
      const tx = x + i
      if (tx < 0 || tx >= w) continue
      data.set(img.data.subarray((j * img.width + i) * 4, (j * img.width + i) * 4 + 4), (ty * w + tx) * 4)
    }
  }
  return { width: w, height: h, data }
}

export interface Truth {
  clientHeight: number
  tab: string
  cells: Array<{ slot: number; item: string; count: number }>
}

export function loadTruth(file: string): Truth {
  return JSON.parse(readFileSync(path.join(FIX, file), 'utf8')) as Truth
}

export interface Score {
  total: number
  /** ячейка найдена, предмет и «есть / пусто» верны */
  cells: number
  /** у заполненных: число прочитано верно */
  counts: number
  filled: number
  /** уверенные неверные числа (хуже всего: попадают в итог) */
  sureWrong: number
  errors: string[]
}

/** Сверка результата с разметкой: ячейка по номеру в раскладке. */
export function compare(cells: readonly ScreenCell[], truth: Truth): Score {
  const bySlot = new Map(cells.map((c) => [c.slot, c]))
  const out: Score = { total: truth.cells.length, cells: 0, counts: 0, filled: 0, sureWrong: 0, errors: [] }
  for (const t of truth.cells) {
    const c = bySlot.get(t.slot)
    const present = t.count > 0
    if (present) out.filled++
    if (!c) {
      out.errors.push(`#${t.slot} не найдена`)
      continue
    }
    const itemOk = t.item === '?' ? true : c.item === t.item
    if (itemOk && c.present === present) out.cells++
    else out.errors.push(`#${t.slot} ${t.item}/${present ? 'есть' : 'пусто'} → ${c.item}/${c.present ? 'есть' : 'пусто'}`)
    if (present) {
      if (c.count === t.count) out.counts++
      else {
        out.errors.push(`#${t.slot} число ${t.count} → ${c.count}${c.countSure ? ' (уверенно!)' : ''}`)
        if (c.countSure && c.count !== null) out.sureWrong++
      }
    }
  }
  return out
}
