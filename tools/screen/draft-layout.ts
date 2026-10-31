// Черновик раскладки особой вкладки со снимка (S68) — так делаются раскладки PoE 1 из образцов пользователя:
// ячейки — путь без раскладки (рамки + иконки), предмет — ближайшая иконка; рядом PNG с номерами ячеек для сверки
// глазами. Черновик правится руками (пропущенные ячейки, предметы пустых ячеек) и добавляется вкладкой в
// resources/data/<игра>/screen/stash-layouts.json. Иконки — эскизы из --thumbs (fetch-thumbs.ts).
//   node tools/screen/run.mjs tools/screen/draft-layout.ts <снимок.png> --game poe1 --tab currency \
//     --thumbs <thumbs.bin> [--out <черновик.json>]
// Снимок — вся клиентская область окна игры (высота окна = эталонная высота раскладки).
import { readFileSync, writeFileSync } from 'fs'
import { inflateSync } from 'zlib'
import { recognizeStash } from '@shared/screen/recognize'
import { describe } from '@shared/screen/icons'
import { decodeThumbs } from '@shared/screen/thumbs'
import { decodePng } from '../../src/main/screen/png'
import { writePng } from '../../tests/ocr/png'

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? def) : def
}

const file = process.argv[2]
if (!file || file.startsWith('--')) throw new Error('usage: draft-layout.ts <shot.png> --game poe1 --tab <id> --thumbs <thumbs.bin>')
const game = arg('game', 'poe1')
const tab = arg('tab', 'tab')
const out = arg('out', file.replace(/\.png$/i, `.${tab}.layout.json`))
const img = decodePng(readFileSync(file))
const thumbs = decodeThumbs(new Uint8Array(inflateSync(readFileSync(arg('thumbs')))))
if (!thumbs) throw new Error('bad thumbs')
const r = recognizeStash({ img, clientHeight: img.height, icons: thumbs.map((t) => describe(t)) })
const slots = r.cells.map((c) => ({
  x: Math.round((c.rect.x + c.rect.width / 2) * 10) / 10,
  y: Math.round((c.rect.y + c.rect.height / 2) * 10) / 10,
  w: Math.round(c.rect.width * 10) / 10,
  h: Math.round(c.rect.height * 10) / 10,
  // пустая ячейка: предмет угадан по силуэту — проверить
  item: c.item,
  ...(c.present ? {} : { check: 'пусто: предмет по силуэту' }),
  ...(c.alt?.length ? { alt: c.alt } : {})
}))
writeFileSync(out, JSON.stringify({ version: 1, game, refHeight: img.height, tabs: [{ id: tab, slots }] }, null, 1) + '\n')
// сверка глазами: рамки ячеек (зелёная — предмет, красная — пусто), номер — порядок в черновике
const d = img.data
r.cells.forEach((c) => {
  const x0 = Math.round(c.rect.x)
  const y0 = Math.round(c.rect.y)
  const s = Math.round(c.rect.width)
  for (let i = 0; i <= s; i++)
    for (const [x, y] of [
      [x0 + i, y0],
      [x0 + i, y0 + s],
      [x0, y0 + i],
      [x0 + s, y0 + i]
    ]) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const p = (y * img.width + x) * 4
      d[p] = 0
      d[p + 1] = c.present ? 255 : 0
      d[p + 2] = c.present ? 0 : 255
    }
})
writePng(out.replace(/\.json$/, '.png'), img)
console.log(`${out}: ${slots.length} ячеек (${r.cells.filter((c) => c.present).length} с предметом); сверьте ${out.replace(/\.json$/, '.png')}`)
