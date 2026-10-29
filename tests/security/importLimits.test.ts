import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BT_IMPORT_MAX, emptyFavorites, importBt } from '../../src/shared/favorites/model'
import { readImportJson } from '../../src/main/services/importFile'

// Лимиты размера импорта (S29): вставка Better Trading и файл библиотеки regex не вешают main.

describe('importBt: лимит вставки', () => {
  const ids = (): (() => string) => {
    let n = 0
    return () => `id${++n}`
  }

  it('больше BT_IMPORT_MAX — «не похоже на код» без разбора', () => {
    const big = `3:${'A'.repeat(BT_IMPORT_MAX)}`
    const r = importBt(emptyFavorites(), big, ids())
    expect(r).toMatchObject({ folders: 0, searches: 0, invalid: 1 })
  })

  it('обычная вставка разбирается как раньше', () => {
    const r = importBt(emptyFavorites(), 'не код', ids())
    expect(r).toMatchObject({ folders: 0, searches: 0, invalid: 0 })
  })
})

describe('readImportJson: размер — до чтения', () => {
  let dir = ''
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-import-'))
  })
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('JSON в пределах лимита (и с BOM) читается', async () => {
    const f = path.join(dir, 'lib.json')
    await fs.writeFile(f, String.fromCharCode(0xfeff) + '{"entries":[]}', 'utf8')
    expect(await readImportJson(f, 1024)).toEqual({ entries: [] })
  })

  it('больше лимита, не JSON, папка, нет файла — undefined', async () => {
    const big = path.join(dir, 'big.json')
    await fs.writeFile(big, JSON.stringify({ x: 'y'.repeat(4096) }))
    expect(await readImportJson(big, 1024)).toBeUndefined()
    const bad = path.join(dir, 'bad.json')
    await fs.writeFile(bad, '{oops')
    expect(await readImportJson(bad, 1024)).toBeUndefined()
    expect(await readImportJson(dir, 1024)).toBeUndefined()
    expect(await readImportJson(path.join(dir, 'none.json'), 1024)).toBeUndefined()
  })
})
