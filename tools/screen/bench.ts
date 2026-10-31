// Замер распознавания особой вкладки (S68): эталон PoE 2 «Эссенции» в окне 1080p / 1440p / 4K, после прогрева —
// N прогонов, медиана и худший по частям (поиск и привязка, иконки, числа стопок). Время снимка окна
// (OverlayController.screenshot) здесь не мерится — оно в ScreenRead.ms.capture живого приложения.
//   node tools/screen/run.mjs tools/screen/bench.ts [N=5]
import { readFileSync } from 'fs'
import path from 'path'
import { inflateSync } from 'zlib'
import { resize, type Bitmap } from '@shared/ocr/bitmap'
import { parseDigitSet } from '@shared/screen/digits'
import { describe } from '@shared/screen/icons'
import { parseLayoutSet } from '@shared/screen/layout'
import { recognizeStash } from '@shared/screen/recognize'
import { readStack } from '@shared/screen/stack'
import { decodeThumbs } from '@shared/screen/thumbs'
import { createOcrEngine } from '../../src/main/ocr/engine'
import { decodePng } from '../../src/main/screen/png'

const root = process.cwd()
const N = Number(process.argv[2] ?? 5)

function embed(img: Bitmap, w: number, h: number, x: number, y: number): Bitmap {
  const data = new Uint8Array(w * h * 4).fill(24)
  for (let j = 0; j < img.height; j++) data.set(img.data.subarray(j * img.width * 4, (j + 1) * img.width * 4), ((y + j) * w + x) * 4)
  return { width: w, height: h, data }
}

async function main(): Promise<void> {
  const fix = path.join(root, 'tests/fixtures/screen/poe2')
  const icons = decodeThumbs(new Uint8Array(inflateSync(readFileSync(path.join(fix, 'thumbs.bin')))))!.map((t) => describe(t))
  const layouts = parseLayoutSet(JSON.parse(readFileSync(path.join(root, 'resources/data/poe2/screen/stash-layouts.json'), 'utf8')))
  const digits = parseDigitSet(JSON.parse(readFileSync(path.join(root, 'resources/data/poe2/screen/digits.json'), 'utf8')))
  const engine = await createOcrEngine(path.join(root, 'resources/ocr'))
  const src = decodePng(readFileSync(path.join(fix, 'p2p-essence-1440-gray.png')))
  for (const [label, H] of [
    ['1080p', 1080],
    ['1440p', 1440],
    ['4K', 2160]
  ] as const) {
    const k = H / 1440
    const shot = embed(k === 1 ? src : resize(src, k), Math.round((H * 16) / 9), H, Math.round(40 * k), Math.round(240 * k))
    const run = () => recognizeStash({ img: shot, clientHeight: H, icons, layouts, readCount: (img, cell) => readStack(img, cell, engine.read, digits) })
    run()
    const rows: Array<{ find: number; match: number; ocr: number; total: number }> = []
    for (let i = 0; i < N; i++) rows.push(run().ms)
    const stat = (key: 'find' | 'match' | 'ocr' | 'total'): string => {
      const v = rows.map((r) => r[key]).sort((a, b) => a - b)
      return `${Math.round(v[v.length >> 1])}/${Math.round(v[v.length - 1])}`
    }
    console.log(`${label}: всего ${stat('total')} мс (медиана/худший); поиск ${stat('find')}, иконки ${stat('match')}, числа ${stat('ocr')}`)
  }
  engine.close()
}

void main()
