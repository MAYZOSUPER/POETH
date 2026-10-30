import { describe, expect, it } from 'vitest'
import { listZipEntries, readZipEntry, ZipError } from '../../src/main/lootFilter/zip'
import { makeZip } from './zipFixture'

// S53: свой читатель ZIP — только из памяти, store/deflate, потолок распаковки, CRC и размер из каталога.

const text = 'Show\n\tSetFontSize 45\n'.repeat(200)

describe('listZipEntries / readZipEntry', () => {
  it('читает store и deflate', () => {
    const buf = makeZip([
      { name: 'r/', method: 0 },
      { name: 'r/a.filter', data: text, method: 8 },
      { name: 'r/b.txt', data: 'plain', method: 0 }
    ])
    const list = listZipEntries(buf)
    expect(list.map((e) => e.name)).toEqual(['r/', 'r/a.filter', 'r/b.txt'])
    expect(readZipEntry(buf, list[1], 1 << 20).toString('utf8')).toBe(text)
    expect(readZipEntry(buf, list[2], 1 << 20).toString('utf8')).toBe('plain')
  })

  it('размер больше потолка — отказ до распаковки', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: text }])
    const [e] = listZipEntries(buf)
    expect(() => readZipEntry(buf, e, 100)).toThrow(ZipError)
  })

  it('zip-бомба: в каталоге заявлено мало, поток длиннее — обрыв', () => {
    const big = Buffer.alloc(5 * 1024 * 1024, 0x41)
    const buf = makeZip([{ name: 'r/a.filter', data: big, size: 1000 }])
    const [e] = listZipEntries(buf)
    expect(e.size).toBe(1000)
    expect(() => readZipEntry(buf, e, 8 * 1024 * 1024)).toThrow(/inflate failed|size mismatch/)
  })

  it('CRC не совпал — отказ', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: text, crc: 12345 }])
    const [e] = listZipEntries(buf)
    expect(() => readZipEntry(buf, e, 1 << 20)).toThrow(/crc/)
  })

  it('зашифрованная запись — отказ', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: text, flags: 1 }])
    const [e] = listZipEntries(buf)
    expect(() => readZipEntry(buf, e, 1 << 20)).toThrow(/encrypted/)
  })

  it('имя в локальном заголовке другое — отказ', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: text, localName: '../a.filter' }])
    const [e] = listZipEntries(buf)
    expect(() => readZipEntry(buf, e, 1 << 20)).toThrow(/name mismatch/)
  })

  it('не ZIP или обрезанный архив — отказ', () => {
    expect(() => listZipEntries(Buffer.from('not a zip at all, just text'))).toThrow(ZipError)
    const buf = makeZip([{ name: 'r/a.filter', data: text }])
    expect(() => listZipEntries(buf.subarray(0, buf.length - 30))).toThrow(ZipError)
    const cut = buf.subarray(10)
    expect(() => {
      const list = listZipEntries(cut)
      readZipEntry(cut, list[0], 1 << 20)
    }).toThrow(ZipError)
  })

  it('ZIP64 (размер 0xFFFFFFFF) — отказ', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: text, size: 0xffffffff }])
    expect(() => listZipEntries(buf)).toThrow(/zip64/)
  })

  it('неизвестный метод сжатия — отказ', () => {
    const buf = makeZip([{ name: 'r/a.filter', data: 'x', method: 0 }])
    const [e] = listZipEntries(buf)
    expect(() => readZipEntry(buf, { ...e, method: 12 }, 1 << 20)).toThrow(/method/)
  })
})
