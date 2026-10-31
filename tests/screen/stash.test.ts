import { readFileSync } from 'fs'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { resize, type Bitmap } from '@shared/ocr/bitmap'
import type { IconDesc } from '@shared/screen/icons'
import type { LayoutSet } from '@shared/screen/layout'
import { recognizeStash } from '@shared/screen/recognize'
import { parseDigitSet, type DigitSet } from '@shared/screen/digits'
import { readStack } from '@shared/screen/stack'
import { createOcrEngine, type OcrEngine } from '../../src/main/ocr/engine'
import { readPng } from '../ocr/png'
import { compare, embed, FIX, loadIcons, loadLayouts, loadTruth, ROOT } from './helpers'

// Особые вкладки тайника PoE 2 на настоящих пикселях игры (S68): эталоны poe2pricer (серые вырезы окна 1440p,
// MIT) и их копии под 1080p, 4K и другой масштаб интерфейса — вставлены в «окно» 16:9 на место тайника.
// Иконки — эскизы с web.poecdn.com из фикстур, раскладки — resources/data/poe2/screen. Распознаватель чисел —
// настоящий tesseract S28 из resources/ocr и образцы цифр (собраны с этих же эталонов — по числам тест оптимистичен,
// честная перекрёстная проверка — в отчёте S68). Цель этапа: ≥ 95 % ячеек (предмет и «есть / пусто»); уверенно
// неверных чисел — ни одного (они попали бы в итог вкладки).

let icons: IconDesc[]
let layouts: LayoutSet
let engine: OcrEngine
let digits: DigitSet | null

beforeAll(async () => {
  icons = loadIcons('poe2')
  layouts = loadLayouts('poe2')
  digits = parseDigitSet(JSON.parse(readFileSync(path.join(ROOT, 'resources/data/poe2/screen/digits.json'), 'utf8')))
  engine = await createOcrEngine(path.join(ROOT, 'resources/ocr'))
}, 30_000)

const SAMPLES = ['p2p-orbs-1440-gray', 'p2p-essence-1440-gray']

/** Окно высотой 1440·res, интерфейс ещё и в ui раз; вырез стоял в (40, 240) окна 1440. */
function windowOf(img: Bitmap, res: number, ui: number): { shot: Bitmap; clientHeight: number } {
  const k = res * ui
  const part = k === 1 ? img : resize(img, k)
  const h = Math.round(1440 * res)
  const w = Math.round((h * 16) / 9)
  return { shot: embed(part, w, h, Math.round(40 * k), Math.round(240 * k)), clientHeight: h }
}

describe('особые вкладки PoE 2', () => {
  for (const name of SAMPLES)
    for (const [label, res, ui] of [
      ['1440p', 1, 1],
      ['1080p', 0.75, 1],
      ['4K', 1.5, 1],
      ['1440p, интерфейс 0,85', 1, 0.85],
      ['1080p, интерфейс 1,15', 0.75, 1.15]
    ] as const)
      it(`${name}: ${label}`, () => {
        const truth = loadTruth(`poe2/${name}.json`)
        const { shot, clientHeight } = windowOf(readPng(path.join(FIX, 'poe2', `${name}.png`)), res, ui)
        const r = recognizeStash({ img: shot, clientHeight, icons, layouts, readCount: (img, cell) => readStack(img, cell, engine.read, digits) })
        const s = compare(r.cells, truth)
        console.log(
          `${name} ${label}: ячейки ${s.cells}/${s.total}, числа ${s.counts}/${s.filled}, уверенно неверных ${s.sureWrong}; ` +
            `масштаб ${r.scale?.toFixed(3)}; ${Math.round(r.ms.find)}+${Math.round(r.ms.match)}+${Math.round(r.ms.ocr)} мс` +
            (s.errors.length ? `\n  ${s.errors.join('\n  ')}` : '')
        )
        expect(r.tab).toBe(truth.tab)
        expect(r.scale).toBeCloseTo(res * ui, 1)
        expect(s.cells / s.total).toBeGreaterThanOrEqual(0.95)
        expect(s.sureWrong).toBe(0)
      }, 30_000)
})
