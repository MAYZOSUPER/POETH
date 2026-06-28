// Generates a default tray icon (resources/brand/tray-default.png, 32x32 RGBA)
// — a small gold compass cross with a red gem. Pure Node (no deps). Used as the
// tray fallback when the user hasn't dropped their own app_icon.png in brand/.

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'resources', 'brand', 'tray-default.png')

const S = 32
const cx = 15.5
const cy = 15.5
const GOLD = [200, 168, 96, 255]
const GOLD_DIM = [150, 120, 60, 220]
const RED = [191, 58, 44, 255]

const raw = Buffer.alloc(S * S * 4) // RGBA, transparent by default

function put(x, y, [r, g, b, a]) {
  const i = (y * S + x) * 4
  raw[i] = r
  raw[i + 1] = g
  raw[i + 2] = b
  raw[i + 3] = a
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = x - cx
    const dy = y - cy
    const r = Math.sqrt(dx * dx + dy * dy)
    let color = null
    if (r >= 11.5 && r <= 13.5) color = GOLD_DIM // ring
    if (Math.abs(dx) / 14 + Math.abs(dy) / 3 <= 1) color = GOLD // E-W arm
    if (Math.abs(dx) / 3 + Math.abs(dy) / 14 <= 1) color = GOLD // N-S blade
    if (Math.abs(dx) / 2.6 + Math.abs(dy) / 3.6 <= 1) color = RED // gem
    if (color) put(x, y, color)
  }
}

// --- PNG encode (color type 6 = RGBA, 8-bit) ---
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
// 10,11,12 = 0 (compression, filter, interlace)

// add filter byte (0) per scanline
const stride = S * 4
const filtered = Buffer.alloc((stride + 1) * S)
for (let y = 0; y < S; y++) {
  filtered[y * (stride + 1)] = 0
  raw.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride)
}
const idat = deflateSync(filtered)

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, png)
console.log(`Wrote ${OUT} (${png.length} bytes)`)
