// Образцы цифр числа стопки (S68) из размеченных снимков: снимок + разметка (tests/fixtures/screen/<игра>/*.json,
// поле count у ячеек) → распознавание вкладки → знаки чисел → resources/data/<игра>/screen/digits.json.
// Знаки берутся только там, где их столько же, сколько цифр в метке. Копии 0,75× и 1,5× — образцы для других
// разрешений.
//   node tools/screen/run.mjs tools/screen/harvest-digits.ts --game poe2 [--out resources/data/poe2/screen/digits.json]
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { inflateSync } from 'zlib'
import { resize } from '@shared/ocr/bitmap'
import { harvestDigits } from '@shared/screen/digits'
import { describe } from '@shared/screen/icons'
import { parseLayoutSet } from '@shared/screen/layout'
import { recognizeStash } from '@shared/screen/recognize'
import { stackGlyphs, type StackGlyphs } from '@shared/screen/stack'
import { decodeThumbs } from '@shared/screen/thumbs'
import { decodePng } from '../../src/main/screen/png'

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? def) : def
}

const game = arg('game', 'poe2') as 'poe1' | 'poe2'
const root = process.cwd()
const fix = path.join(root, 'tests/fixtures/screen', game)
const out = arg('out', path.join(root, `resources/data/${game}/screen/digits.json`))
const thumbs = decodeThumbs(new Uint8Array(inflateSync(readFileSync(path.join(fix, 'thumbs.bin')))))!
const icons = thumbs.map((t) => describe(t))
const layouts = parseLayoutSet(JSON.parse(readFileSync(path.join(root, `resources/data/${game}/screen/stash-layouts.json`), 'utf8')))
const entries: Array<{ s: StackGlyphs; label: string }> = []
const used: string[] = []
for (const f of readdirSync(fix).filter((n) => n.endsWith('.json'))) {
  const truth = JSON.parse(readFileSync(path.join(fix, f), 'utf8')) as { clientHeight: number; cells: Array<{ slot: number; count: number }> }
  const img = decodePng(readFileSync(path.join(fix, f.replace(/\.json$/, '.png'))))
  for (const k of [1, 0.75, 1.5]) {
    const shot = k === 1 ? img : resize(img, k)
    const r = recognizeStash({ img: shot, clientHeight: truth.clientHeight * k, icons, layouts })
    for (const t of truth.cells) {
      const c = r.cells.find((c) => c.slot === t.slot)
      const s = t.count > 0 && c ? stackGlyphs(shot, c.rect) : null
      if (s) entries.push({ s, label: String(t.count) })
    }
  }
  used.push(f.replace(/\.json$/, '.png'))
}
const set = harvestDigits(entries, 24, `tools/screen/harvest-digits.ts: ${used.join(', ')} (1×, 0,75×, 1,5×)`)
writeFileSync(out, JSON.stringify(set) + '\n')
console.log(`${out}: ${Object.entries(set.digits).map(([d, l]) => `${d}×${l.length}`).join(' ')}`)
