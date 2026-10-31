import { inflateSync } from 'zlib'
import type { Bitmap } from '@shared/ocr/bitmap'

// Разбор PNG иконок предметов (S68): web.poecdn.com отдаёт 8-битный RGBA без чересстрочности; на всякий случай —
// серый, RGB, палитра (1–8 бит, tRNS). Только чтение байтов, ничего не исполняется. Результат — BGRA с альфой,
// как снимок окна игры. Чересстрочные и 16-битные — ошибка (иконку пропускаем).

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Иконка больше этого — не иконка (страховка от раздутых картинок). */
const MAX_SIDE = 1024

export function decodePng(buf: Uint8Array): Bitmap {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) throw new Error('png: bad signature')
  let width = 0
  let height = 0
  let depth = 0
  let color = 0
  let interlace = 0
  let palette: Buffer | null = null
  let trns: Buffer | null = null
  const idat: Buffer[] = []
  for (let p = 8; p + 8 <= b.length; ) {
    const len = b.readUInt32BE(p)
    const type = b.toString('latin1', p + 4, p + 8)
    if (p + 12 + len > b.length) throw new Error('png: truncated')
    const data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      color = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error('png: bad size')
  if (interlace) throw new Error('png: interlaced')
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color]
  if (!channels || (color === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8)) throw new Error(`png: unsupported (depth ${depth}, color ${color})`)
  if (color === 3 && !palette) throw new Error('png: no palette')
  const bpp = Math.max(1, (channels * depth) >> 3)
  const stride = Math.ceil((width * channels * depth) / 8)
  // предел распаковки — ровно размер картинки: «zip-бомба» в IDAT не раздует память
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height })
  if (raw.length < (stride + 1) * height) throw new Error('png: short data')
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const up = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      if (f === 1) v += a
      else if (f === 2) v += up
      else if (f === 3) v += (a + up) >> 1
      else if (f === 4) {
        const pa = Math.abs(up - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + up - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      }
      out[i] = v & 255
    }
  }
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const row = y * stride
      let r: number
      let g: number
      let bl: number
      let al = 255
      if (color === 3) {
        const bit = x * depth
        const idx = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
        r = palette![idx * 3] ?? 0
        g = palette![idx * 3 + 1] ?? 0
        bl = palette![idx * 3 + 2] ?? 0
        if (trns && idx < trns.length) al = trns[idx]
      } else {
        const s = row + x * channels
        if (channels < 3) {
          r = g = bl = px[s]
          if (channels === 2) al = px[s + 1]
        } else {
          r = px[s]
          g = px[s + 1]
          bl = px[s + 2]
          if (channels === 4) al = px[s + 3]
        }
      }
      data[o] = bl
      data[o + 1] = g
      data[o + 2] = r
      data[o + 3] = al
    }
  return { width, height, data }
}
