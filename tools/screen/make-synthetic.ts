// Синтетическая особая вкладка (S68) для тестов пути «без раскладки», пока нет снимков из игры: настоящие иконки
// с web.poecdn.com (User-Agent POETH, без входа) в ячейках с рамкой на шумном тёмном фоне, часть ячеек — пустые
// (серый тёмный силуэт, как рисует игра), у заполненных — число стопки простым шрифтом с обводкой (числа на
// синтетике не проверяются: шрифт не игровой). Окно 1080p; другие разрешения тест получает масштабированием.
//   node tools/screen/run.mjs tools/screen/make-synthetic.ts --game poe1 --out tests/fixtures/screen/poe1/synthetic-currency-1080
// Пишет <out>.png и <out>.json (разметка). Не снимок игры: вид ячеек приблизительный, пороги проверять на образцах.
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { Bitmap } from '@shared/ocr/bitmap'
import { parseCatalog, type CatalogEntry } from '@shared/screen/catalog'
import { decodePng } from '../../src/main/screen/png'
import { writePng } from '../../tests/ocr/png'

const UA = 'POETH/0.1.0-rc.13 (+https://github.com/MAYZOSUPER/POETH)'
/** Что сохраняется в файл: панель тайника с запасом. */
const CROP = { x: 0, y: 110, width: 680, height: 660 }

function crop0(img: Bitmap, r: typeof CROP): Bitmap {
  const data = new Uint8Array(r.width * r.height * 4)
  for (let y = 0; y < r.height; y++) data.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.width) * 4), y * r.width * 4)
  return { width: r.width, height: r.height, data }
}

const ITEMS: Record<'poe1' | 'poe2', string[]> = {
  poe1: [
    'Orb of Transmutation', 'Orb of Augmentation', 'Orb of Alteration', 'Orb of Alchemy', 'Chaos Orb', 'Exalted Orb',
    'Divine Orb', 'Regal Orb', 'Orb of Scouring', 'Orb of Regret', 'Blessed Orb', 'Vaal Orb',
    "Jeweller's Orb", 'Orb of Fusing', 'Chromatic Orb', "Gemcutter's Prism", "Glassblower's Bauble", "Cartographer's Chisel",
    'Orb of Chance', 'Orb of Annulment', 'Mirror of Kalandra', 'Ancient Orb', 'Orb of Binding', 'Orb of Horizons',
    "Harbinger's Orb", "Engineer's Orb", 'Sacred Orb', 'Stacked Deck', 'Silver Coin', 'Enkindling Orb',
    'Instilling Orb', "Armourer's Scrap", "Blacksmith's Whetstone", 'Scroll of Wisdom', 'Portal Scroll', "Awakener's Orb",
    'Whispering Essence of Greed', 'Muttering Essence of Greed', 'Weeping Essence of Greed', 'Wailing Essence of Greed',
    'Screaming Essence of Greed', 'Shrieking Essence of Greed', 'Deafening Essence of Greed', 'Shrieking Essence of Anger',
    'Deafening Essence of Anger', 'Essence of Hysteria', 'Essence of Insanity', 'Essence of Horror'
  ],
  poe2: []
}

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? def) : def
}

/** Детерминированный ГСЧ (тесты воспроизводимы). */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

async function icon(e: CatalogEntry, cache: string): Promise<Bitmap> {
  const file = path.join(cache, `${Buffer.from(e.icon).toString('base64url').slice(-60)}.png`)
  let b: Uint8Array
  try {
    b = new Uint8Array(await fs.readFile(file))
  } catch {
    const u = new URL(e.icon)
    if (u.hostname !== 'web.poecdn.com') throw new Error('host')
    const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'error' })
    b = new Uint8Array(await res.arrayBuffer())
    await fs.writeFile(file, b)
  }
  return decodePng(b)
}

// простой шрифт цифр 3×5 (масштабируется), только чтобы в ячейке было число как в игре
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111']
}

async function main(): Promise<void> {
  const game = arg('game', 'poe1') as 'poe1' | 'poe2'
  const out = arg('out')
  if (!out) throw new Error('--out <file без расширения> required')
  const cache = arg('cache', path.join(os.tmpdir(), 'poeth-screen-icons', game))
  await fs.mkdir(cache, { recursive: true })
  const nd = await fs.readFile(path.join(process.cwd(), `resources/data/${game}/en/items.ndjson`), 'utf8')
  const want = new Set(ITEMS[game])
  const catalog = parseCatalog(nd, game, want).filter((e) => want.has(e.name))
  const W = 1920
  const H = 1080
  const rand = rng(68)
  const data = new Uint8Array(W * H * 4)
  // фон: тёмная «ткань» с крупным и мелким шумом, панель тайника чуть светлее
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4
      const panel = x >= 14 && x < 650 && y >= 120 && y < 760
      const base = panel ? 38 : 16
      const n = Math.sin(x * 0.05 + y * 0.013) * 5 + Math.sin(x * 0.011 - y * 0.07) * 4 + rand() * 4
      data[p] = Math.max(0, base + n - 6)
      data[p + 1] = Math.max(0, base + n - 2)
      data[p + 2] = Math.max(0, base + n + 4)
      data[p + 3] = 255
    }
  const img: Bitmap = { width: W, height: H, data }
  const set = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const p = (y * W + x) * 4
    data[p] = b
    data[p + 1] = g
    data[p + 2] = r
  }
  // ячейки: 4 группы по 3 ряда × 4 (как ряды валюты), шаг 47, ячейка 42
  const slot = 42
  const pitch = 47
  const cells: Array<{ slot: number; item: string; count: number; rect: { x: number; y: number; width: number; height: number } }> = []
  let idx = 0
  const groups = [
    [40, 150],
    [250, 150],
    [460, 150],
    [40, 330],
    [250, 330],
    [460, 330],
    [40, 510],
    [250, 510]
  ]
  for (const [gx, gy] of groups)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        if (idx >= catalog.length) break
        const e = catalog[idx]
        const x0 = gx + c * pitch
        const y0 = gy + r * pitch
        // рамка: светлая линия снаружи, тёмная полоса внутри, тёмно-синее дно
        for (let i = -1; i <= slot; i++) {
          set(x0 + i, y0 - 1, 120, 104, 76)
          set(x0 + i, y0 + slot, 120, 104, 76)
          set(x0 - 1, y0 + i, 120, 104, 76)
          set(x0 + slot, y0 + i, 120, 104, 76)
        }
        const filled = rand() > 0.3
        for (let y = 0; y < slot; y++)
          for (let x = 0; x < slot; x++) {
            const edge = x < 2 || y < 2 || x >= slot - 2 || y >= slot - 2
            if (edge) set(x0 + x, y0 + y, 8, 8, 10)
            else if (filled) set(x0 + x, y0 + y, 14, 20, 40)
            else set(x0 + x, y0 + y, 10, 10, 13)
          }
        const ic = await icon(e, cache)
        const inner = Math.round(slot * 0.88)
        const ox = x0 + Math.round((slot - inner) / 2)
        const oy = y0 + Math.round((slot - inner) / 2)
        for (let y = 0; y < inner; y++)
          for (let x = 0; x < inner; x++) {
            // билинейно из иконки, смешивание по альфе
            const sx = ((x + 0.5) * ic.width) / inner - 0.5
            const sy = ((y + 0.5) * ic.height) / inner - 0.5
            const ax = Math.max(0, Math.floor(sx))
            const ay = Math.max(0, Math.floor(sy))
            const bx = Math.min(ic.width - 1, ax + 1)
            const by = Math.min(ic.height - 1, ay + 1)
            const fx = Math.min(1, Math.max(0, sx - ax))
            const fy = Math.min(1, Math.max(0, sy - ay))
            const px = (c2: number): number => {
              const at = (xx: number, yy: number): number => ic.data[(yy * ic.width + xx) * 4 + c2]
              return (at(ax, ay) * (1 - fx) + at(bx, ay) * fx) * (1 - fy) + (at(ax, by) * (1 - fx) + at(bx, by) * fx) * fy
            }
            const a = px(3) / 255
            if (a <= 0.01) continue
            const p = ((oy + y) * W + ox + x) * 4
            let B = px(0)
            let G = px(1)
            let R = px(2)
            if (!filled) {
              const l = (0.299 * R + 0.587 * G + 0.114 * B) * 0.3
              B = G = R = l
            }
            data[p] = Math.round(data[p] * (1 - a) + B * a)
            data[p + 1] = Math.round(data[p + 1] * (1 - a) + G * a)
            data[p + 2] = Math.round(data[p + 2] * (1 - a) + R * a)
          }
        const count = filled ? 1 + Math.floor(rand() ** 3 * 2000) : 0
        if (filled) {
          // число: белые пиксели 2×2 на точку шрифта, чёрная обводка
          const text = String(count)
          const sc = 2
          for (const pass of [0, 1])
            for (let t = 0; t < text.length; t++)
              FONT[text[t]].forEach((row, ry) =>
                [...row].forEach((on, rx) => {
                  if (on !== '1') return
                  for (let yy = 0; yy < sc; yy++)
                    for (let xx = 0; xx < sc; xx++) {
                      const px0 = x0 + 4 + t * 4 * sc + rx * sc + xx
                      const py0 = y0 + 3 + ry * sc + yy
                      if (pass === 0) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) set(px0 + dx, py0 + dy, 0, 0, 0)
                      else set(px0, py0, 235, 235, 230)
                    }
                })
              )
        }
        cells.push({ slot: idx, item: e.name, count, rect: { x: x0, y: y0, width: slot, height: slot } })
        idx++
      }
  // в файл — только вырез с панелью (меньше весит); тест вставляет его обратно в окно 1920×1080 на CROP
  const crop = crop0(img, CROP)
  for (const c of cells) {
    c.rect.x -= CROP.x
    c.rect.y -= CROP.y
  }
  writePng(`${out}.png`, crop)
  await fs.writeFile(
    `${out}.json`,
    JSON.stringify(
      {
        about: `Синтетика S68 (tools/screen/make-synthetic.ts): настоящие иконки ${game} с web.poecdn.com в нарисованных ячейках, окно 1920×1080. Не снимок игры.`,
        clientHeight: H,
        window: { width: W, height: H },
        offset: { x: CROP.x, y: CROP.y },
        tab: null,
        cells
      },
      null,
      1
    ) + '\n'
  )
  console.log(`${out}.png/.json: ${cells.length} ячеек, заполнено ${cells.filter((c) => c.count > 0).length}; нет в каталоге: ${ITEMS[game].filter((n) => !catalog.some((e) => e.name === n)).join(', ') || '—'}`)
}

void main()
