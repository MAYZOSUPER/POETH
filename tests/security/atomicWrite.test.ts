import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readJson, writeJsonAtomic, writeJsonAtomicSync } from '../../src/main/services/atomicJson'

// Атомарная запись JSON (S29, по находкам S32): у каждой записи свой временный файл — одновременные записи
// одного файла не падают ENOENT/EPERM и не оставляют мусора; синхронная запись — для before-quit.

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-atomic-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const tmpLeft = async (): Promise<string[]> => (await fs.readdir(dir)).filter((f) => f.includes('.tmp'))

describe('writeJsonAtomic', () => {
  it('20 одновременных записей одного файла — без ENOENT, файл целый, временных файлов нет', async () => {
    const file = path.join(dir, 'profiles.json')
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeJsonAtomic(file, { i })))
    const last = (await readJson<{ i: number }>(file, { i: -1 })).i
    expect(last).toBeGreaterThanOrEqual(0)
    expect(await tmpLeft()).toEqual([])
    expect((await fs.readdir(dir)).sort()).toEqual(['profiles.json', 'profiles.json.bak'])
  })

  it('сбой rename (на месте файла — папка) — ошибка наружу, временный файл убран', async () => {
    const file = path.join(dir, 'busy.json')
    await fs.mkdir(path.join(file, 'inner'), { recursive: true })
    await expect(writeJsonAtomic(file, { a: 1 })).rejects.toThrow()
    expect(await tmpLeft()).toEqual([])
  })
})

describe('writeJsonAtomicSync', () => {
  it('пишет сразу, прежняя версия — в .bak, временных файлов нет', async () => {
    const file = path.join(dir, 'leveling.json')
    writeJsonAtomicSync(file, { v: 1 })
    writeJsonAtomicSync(file, { v: 2 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ v: 2 })
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8'))).toEqual({ v: 1 })
    expect(await tmpLeft()).toEqual([])
  })

  it('создаёт папку, если её ещё нет', () => {
    const file = path.join(dir, 'нет', 'ещё', 'x.json')
    writeJsonAtomicSync(file, { ok: true })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ok: true })
  })
})
