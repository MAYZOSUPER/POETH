import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { resize, type Bitmap } from '@shared/ocr/bitmap'
import { bookFromTable, decide, fitsGlyphs, normalizeNumber, readTable, splitRatio, type TableRead } from '@shared/ocr/read'
import { bookUsable } from '@shared/flip/book'
import { createOcrEngine, OCR_FILES, type OcrEngine } from '../../src/main/ocr/engine'
import { readPng } from './png'

// Стакан Market Ratio с экрана (S28): скриншоты пользователя (EN-клиент, Valdo's Puzzle Box за Chaos Orb)
// и их копии 0,75× / 1,33× / 2× — разные разрешения и масштаб Windows. Распознаватель — настоящий
// tesseract из resources/ocr (как в приложении), без сети.

const FIX = path.resolve(__dirname, '../fixtures/ocr/poe1')
const OCR_DIR = path.resolve(__dirname, '../../resources/ocr')
/** высота цифр на скриншоте пользователя, точки (подсказка разметке; ищет в 0,5…2×) */
const HINT = 13

const EXPECTED = [
  { want: 1, have: 296, stock: 2 },
  { want: 1, have: 299, stock: 1 },
  { want: 1, have: 303, stock: 16 },
  { want: 1, have: 310, stock: 1 },
  { want: 1, have: 318, stock: 6 },
  { want: 1, have: 318, stock: 200, beyond: true }
]

let engine: OcrEngine
let alt: Bitmap
let exchange: Bitmap

beforeAll(async () => {
  engine = await createOcrEngine(OCR_DIR)
  alt = readPng(path.join(FIX, 'market-ratio-alt-en.png'))
  exchange = readPng(path.join(FIX, 'exchange-window-en.png'))
}, 30_000)

const read = (img: Bitmap, k: number): TableRead | null => readTable(k === 1 ? img : resize(img, k), HINT * k, engine.read)

describe('файлы распознавателя', () => {
  it('хэши в OCR_FILES совпадают с resources/ocr (иначе приложение откажется грузить)', () => {
    for (const f of Object.values(OCR_FILES)) {
      const sha = createHash('sha256')
        .update(readFileSync(path.join(OCR_DIR, f.name)))
        .digest('hex')
      expect(sha, f.name).toBe(f.sha256)
    }
  })
})

describe('стакан со скриншота пользователя', () => {
  for (const k of [1, 1.33, 2]) {
    it(`${k}×: ровно таблица из игры, все ячейки уверенные`, () => {
      const t = read(alt, k)
      expect(t).not.toBeNull()
      const book = bookFromTable(t!, 1000)
      expect(book?.rows).toEqual(EXPECTED)
      expect(book?.doubt).toEqual([])
      expect(bookUsable(book)).toBe(true)
    })
  }

  it('0,75×: строки найдены; что не уверено — на проверку, ни одного неверного «уверенного» числа', () => {
    const t = read(alt, 0.75)
    expect(t?.rows).toHaveLength(6)
    t!.rows.forEach((r, i) => {
      const want = EXPECTED[i]
      expect(r.beyond).toBe(!!want.beyond)
      if (r.want.sure) expect(r.want.value).toBe(want.want)
      if (r.have.sure) expect(r.have.value).toBe(want.have)
      if (r.stock.sure) expect(r.stock.value).toBe(want.stock)
    })
    const book = bookFromTable(t!, 1000)
    // с сомнениями стакан в расчёт без проверки игроком не идёт
    if (book && book.doubt.length) expect(bookUsable(book)).toBe(false)
  })

  it('окно обмена без Alt — таблицы нет (курс посреди окна — не стакан)', () => {
    for (const k of [0.75, 1, 1.33, 2]) expect(read(exchange, k)).toBeNull()
  })
})

describe('голосование и формат чисел', () => {
  const g = (digits: number, dots = 0, sure = true) => ({ digits, dots, sure })

  it('нормализация: разделители тысяч у количества, запятая — дробная часть курса', () => {
    expect(normalizeNumber(' 1 200 ', 'stock')).toBe('1200')
    expect(normalizeNumber('1,200', 'stock')).toBe('1200')
    expect(normalizeNumber('1,04', 'ratio')).toBe('1.04')
    expect(splitRatio('1 : 296')).toEqual(['1', '296'])
    expect(splitRatio('1:2:3')).toBeNull()
    expect(splitRatio(':296')).toBeNull()
  })

  it('число знаков и точка сверяются с разметкой', () => {
    expect(fitsGlyphs('318', 'ratio', g(3))).toBe(true)
    expect(fitsGlyphs('38', 'ratio', g(3))).toBe(false)
    expect(fitsGlyphs('1.04', 'ratio', g(3, 1))).toBe(true)
    expect(fitsGlyphs('104', 'ratio', g(3, 1))).toBe(false)
    expect(fitsGlyphs('0', 'stock', g(1))).toBe(false)
    // слипшиеся цифры — число знаков не сверяем, формат — да
    expect(fitsGlyphs('38', 'ratio', g(2, 0, false))).toBe(true)
  })

  it('пустое прочтение — воздержание; спорные — не уверенно', () => {
    const fits = (s: string): boolean => fitsGlyphs(s, 'ratio', g(1))
    expect(decide(['', '', '', '1', '1'], fits, 'ratio')).toEqual({ text: '1', sure: true })
    expect(decide(['', '', '', '7', '1'], fits, 'ratio').sure).toBe(false)
    expect(decide(['', '', '', '', '1'], fits, 'ratio').sure).toBe(false)
    const three = (s: string): boolean => fitsGlyphs(s, 'ratio', g(3))
    // большинство прочитало «38», но в ячейке три знака: «318» не уверено, «38» не берём
    expect(decide(['38', '318', '318', '38', '38'], three, 'ratio')).toEqual({ text: '318', sure: false })
    expect(decide(['38', '318', '318', '318', '318'], three, 'ratio')).toEqual({ text: '318', sure: true })
  })
})
