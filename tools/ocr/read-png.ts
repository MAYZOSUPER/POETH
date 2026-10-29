// Прочитать стакан «Курс / Кол-во» со скриншота (S28) — для новых фикстур от игроков:
//   npx vite-node tools/ocr/read-png.ts <файл.png> [высота цифр, точки = 13] [масштаб = 1]
// Печатает строки как в игре; «?» — ячейка, в которой распознаватель не уверен (в приложении — на проверку).
import path from 'path'
import { resize } from '../../src/shared/ocr/bitmap'
import { bookFromTable, readTable } from '../../src/shared/ocr/read'
import { createOcrEngine } from '../../src/main/ocr/engine'
import { readPng } from '../../tests/ocr/png'

async function main(): Promise<void> {
  const [file, hintArg, kArg] = process.argv.slice(2)
  if (!file) throw new Error('usage: read-png.ts <file.png> [glyph height] [scale]')
  const k = Number(kArg ?? 1)
  const src = readPng(file)
  const img = k === 1 ? src : resize(src, k)
  const engine = await createOcrEngine(path.resolve(__dirname, '../../resources/ocr'))
  const t0 = Date.now()
  const t = readTable(img, Number(hintArg ?? 13) * k, engine.read)
  if (!t) {
    console.log('таблица не найдена')
    return
  }
  const mark = (c: { text: string; sure: boolean }): string => `${c.text || '—'}${c.sure ? '' : '?'}`
  for (const r of t.rows) console.log(`${r.beyond ? '‹ ' : '  '}${mark(r.want)} : ${mark(r.have)}\t${mark(r.stock)}`)
  const book = bookFromTable(t, Date.now())
  console.log(`высота цифр ${t.glyphH}, вызовов ${t.calls}, ${Date.now() - t0} мс; на проверку: ${book ? book.doubt.length : 'всё'}`)
}

void main()
