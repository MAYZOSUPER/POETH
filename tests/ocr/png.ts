import { readFileSync, writeFileSync } from 'fs'
import { deflateSync, inflateSync } from 'zlib'
import type { Bitmap } from '@shared/ocr/bitmap'

// Чтение PNG-фикстур для тестов распознавания (без пакетов): 8 бит, RGB/RGBA/серый, без чересстрочности —
// так сохраняют «Ножницы» и nativeImage.toPNG. Результат — BGRA, как снимок окна игры (OverlayController.screenshot).

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function readPng(file: string): Bitmap {
  const buf = readFileSync(file)
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${file}: not a PNG`)
  let width = 0
  let height = 0
  let depth = 0
  let color = 0
  let interlace = 0
  const idat: Buffer[] = []
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      color = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[color as 0 | 2 | 4 | 6]
  if (depth !== 8 || !channels || interlace) throw new Error(`${file}: unsupported PNG (depth ${depth}, color ${color})`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= channels ? prev[i - channels] : 0
      let v = src[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[i] = v & 255
    }
  }
  const data = new Uint8Array(width * height * 4)
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const g = channels < 3
    const r = px[j]
    data[i * 4] = g ? r : px[j + 2]
    data[i * 4 + 1] = g ? r : px[j + 1]
    data[i * 4 + 2] = r
    data[i * 4 + 3] = channels === 4 ? px[j + 3] : channels === 2 ? px[j + 1] : 255
  }
  return { width, height, data }
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf: Buffer): number {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])))
  return Buffer.concat([head, data, crc])
}

/** BGRA → PNG RGBA (отладка и сбор фикстур в инструментах). */
export function writePng(file: string, img: Bitmap): void {
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height)
  for (let y = 0; y < img.height; y++) {
    const row = y * (img.width * 4 + 1)
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4
      const d = row + 1 + x * 4
      raw[d] = img.data[s + 2]
      raw[d + 1] = img.data[s + 1]
      raw[d + 2] = img.data[s]
      raw[d + 3] = img.data[s + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.width, 0)
  ihdr.writeUInt32BE(img.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  writeFileSync(file, Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
