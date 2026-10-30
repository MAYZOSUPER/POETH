import { crc32, inflateRawSync } from 'zlib'

// Минимальный читатель ZIP для архива релиза NeverSink (S53) — без зависимостей, только чтение из памяти.
// Ничего не распаковывает на диск и не создаёт путей: отдаёт список имён и байты ОДНОЙ выбранной записи.
// Защита:
//  - только «store» (0) и «deflate» (8); шифрование, ZIP64, многотомные архивы — отказ;
//  - все смещения и длины проверяются по размеру буфера; записей ≤ MAX_ENTRIES;
//  - распаковка с потолком maxOutputLength (zip-бомба обрывается), потом сверка размера и CRC-32
//    с центральным каталогом; имя в локальном заголовке должно совпасть с каталогом.

export const MAX_ENTRIES = 2000

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

export interface ZipEntry {
  name: string
  method: number
  flags: number
  crc: number
  compressedSize: number
  size: number
  localOffset: number
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const ZIP64_LOCATOR_SIG = 0x07064b50

function need(buf: Buffer, off: number, len: number): void {
  if (off < 0 || len < 0 || off + len > buf.length) throw new ZipError('out of bounds')
}

/** Конец центрального каталога: ищем подпись с конца (комментарий ≤ 64 КБ). */
function findEocd(buf: Buffer): number {
  if (buf.length < 22) throw new ZipError('too small')
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG && i + 22 + buf.readUInt16LE(i + 20) === buf.length) return i
  }
  throw new ZipError('no end of central directory')
}

/** Записи центрального каталога. Имена — UTF-8 (у GitHub флаг 0x800 не ставится, но имена ASCII/UTF-8). */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf)
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIG) throw new ZipError('zip64')
  const disk = buf.readUInt16LE(eocd + 4)
  const cdDisk = buf.readUInt16LE(eocd + 6)
  const onDisk = buf.readUInt16LE(eocd + 8)
  const total = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOff = buf.readUInt32LE(eocd + 16)
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) throw new ZipError('multi-disk')
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new ZipError('zip64')
  if (total > MAX_ENTRIES) throw new ZipError('too many entries')
  if (cdOff + cdSize > eocd) throw new ZipError('bad central directory')

  const out: ZipEntry[] = []
  let p = cdOff
  for (let i = 0; i < total; i++) {
    need(buf, p, 46)
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new ZipError('bad central header')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    need(buf, p + 46, nameLen + extraLen + commentLen)
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new ZipError('zip64')
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    out.push({ name, method, flags, crc, compressedSize, size, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  if (p > cdOff + cdSize) throw new ZipError('bad central directory')
  return out
}

/**
 * Байты одной записи. size из каталога > maxBytes — отказ до распаковки; распакованное больше заявленного —
 * отказ (zlib обрывает на maxOutputLength); размер и CRC-32 — как в каталоге.
 */
export function readZipEntry(buf: Buffer, e: ZipEntry, maxBytes: number): Buffer {
  if (e.flags & 0x1) throw new ZipError('encrypted')
  if (e.method !== 0 && e.method !== 8) throw new ZipError('unsupported method')
  if (e.size > maxBytes) throw new ZipError('too large')
  need(buf, e.localOffset, 30)
  if (buf.readUInt32LE(e.localOffset) !== LOC_SIG) throw new ZipError('bad local header')
  const nameLen = buf.readUInt16LE(e.localOffset + 26)
  const extraLen = buf.readUInt16LE(e.localOffset + 28)
  need(buf, e.localOffset + 30, nameLen + extraLen)
  const localName = buf.toString('utf8', e.localOffset + 30, e.localOffset + 30 + nameLen)
  if (localName !== e.name) throw new ZipError('name mismatch')
  const start = e.localOffset + 30 + nameLen + extraLen
  need(buf, start, e.compressedSize)
  const raw = buf.subarray(start, start + e.compressedSize)

  let data: Buffer
  if (e.method === 0) {
    if (e.compressedSize !== e.size) throw new ZipError('size mismatch')
    data = Buffer.from(raw)
  } else {
    try {
      // на байт больше заявленного: если поток длиннее — zlib бросит, и мы узнаем о лжи в каталоге
      data = inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size + 1) })
    } catch {
      throw new ZipError('inflate failed')
    }
  }
  if (data.length !== e.size) throw new ZipError('size mismatch')
  if (crc32(data) >>> 0 !== e.crc >>> 0) throw new ZipError('crc mismatch')
  return data
}
