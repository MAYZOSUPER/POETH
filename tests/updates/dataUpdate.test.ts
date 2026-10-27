import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { DataManifest } from '@shared/types'
import {
  applyDataUpdate,
  readAppliedManifest,
  recoverDataDir,
  resetDataOverride,
  sha256
} from '../../src/main/services/dataUpdate'

// Атомарная замена данных с откатом (S10a): userData/data/<game> — надстройка над встроенными.

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
})

async function setup(bundled: Record<string, string>) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-data-'))
  dirs.push(base)
  const bundledDir = path.join(base, 'resources', 'data', 'poe1')
  for (const [rel, text] of Object.entries(bundled)) {
    await fs.mkdir(path.dirname(path.join(bundledDir, rel)), { recursive: true })
    await fs.writeFile(path.join(bundledDir, rel), text)
  }
  return { root: path.join(base, 'userData', 'data'), bundledDir }
}

function manifest(version: string, files: Record<string, string>): DataManifest {
  const out: DataManifest = { version, game: 'poe1', files: {} }
  for (const [rel, text] of Object.entries(files)) out.files[rel] = { sha256: sha256(Buffer.from(text)), size: Buffer.byteLength(text) }
  return out
}

function server(files: Record<string, string>, log: string[] = []) {
  return async (rel: string): Promise<Buffer> => {
    log.push(rel)
    if (!(rel in files)) throw new Error(`404 ${rel}`)
    return Buffer.from(files[rel])
  }
}

async function list(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir, { recursive: true })).map((p) => String(p).replace(/\\/g, '/')).sort()
  } catch {
    return []
  }
}

describe('applyDataUpdate', () => {
  it('качает только изменённые файлы, совпадающие с комплектом не кладёт', async () => {
    const { root, bundledDir } = await setup({ 'en/stats.ndjson': 'old stats', 'en/items.ndjson': 'items' })
    const files = { 'en/stats.ndjson': 'NEW stats', 'en/items.ndjson': 'items', 'regex/maps.en.json': '{"m":1}' }
    const fetched: string[] = []
    const res = await applyDataUpdate(manifest('3.30.0-1', files), { root, bundledDir, fetchFile: server(files, fetched) })
    expect(res).toEqual({ status: 'applied', changed: 2, downloaded: 2 })
    expect(fetched.sort()).toEqual(['en/stats.ndjson', 'regex/maps.en.json'])
    expect(await list(path.join(root, 'poe1'))).toEqual(['en', 'en/stats.ndjson', 'manifest.json', 'regex', 'regex/maps.en.json'])
    expect(await fs.readFile(path.join(root, 'poe1', 'en/stats.ndjson'), 'utf8')).toBe('NEW stats')
    expect((await readAppliedManifest(root, 'poe1'))?.version).toBe('3.30.0-1')
    // временных папок не осталось
    expect((await fs.readdir(root)).filter((n) => n.startsWith('.'))).toEqual([])
  })

  it('та же версия — ничего не качаем', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    const files = { 'a.txt': 'b' }
    await applyDataUpdate(manifest('1', files), { root, bundledDir, fetchFile: server(files) })
    const fetched: string[] = []
    const res = await applyDataUpdate(manifest('1', files), { root, bundledDir, fetchFile: server(files, fetched) })
    expect(res).toEqual({ status: 'unchanged' })
    expect(fetched).toEqual([])
  })

  it('пакет совпадает с комплектом и надстройки нет — нечего делать', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    const res = await applyDataUpdate(manifest('1', { 'a.txt': 'a' }), { root, bundledDir, fetchFile: server({}) })
    expect(res).toEqual({ status: 'unchanged' })
    expect(await list(path.join(root, 'poe1'))).toEqual([])
  })

  it('уже скачанный файл с тем же sha256 копируется, не качается заново', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a', 'b.txt': 'b' })
    await applyDataUpdate(manifest('1', { 'a.txt': 'A1', 'b.txt': 'b' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A1' }) })
    const fetched: string[] = []
    const v2 = { 'a.txt': 'A1', 'b.txt': 'B2' }
    const res = await applyDataUpdate(manifest('2', v2), { root, bundledDir, fetchFile: server(v2, fetched) })
    expect(res).toEqual({ status: 'applied', changed: 2, downloaded: 1 })
    expect(fetched).toEqual(['b.txt'])
  })

  it('файл вернулся к комплектному — надстройка его больше не держит', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    await applyDataUpdate(manifest('1', { 'a.txt': 'A1' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A1' }) })
    const res = await applyDataUpdate(manifest('2', { 'a.txt': 'a' }), { root, bundledDir, fetchFile: server({}) })
    expect(res).toEqual({ status: 'applied', changed: 0, downloaded: 0 })
    expect(await list(path.join(root, 'poe1'))).toEqual(['manifest.json'])
  })

  it('неверный sha256 — откат: прежние данные целы, временных папок нет', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a', 'b.txt': 'b' })
    await applyDataUpdate(manifest('1', { 'a.txt': 'A1', 'b.txt': 'b' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A1' }) })
    const m2 = manifest('2', { 'a.txt': 'A2', 'b.txt': 'B2' })
    const res = await applyDataUpdate(m2, { root, bundledDir, fetchFile: server({ 'a.txt': 'A2', 'b.txt': 'TAMPERED' }) })
    expect(res.status).toBe('failed')
    expect(res.status === 'failed' && res.error).toMatch(/size mismatch|sha256 mismatch/)
    expect(await fs.readFile(path.join(root, 'poe1', 'a.txt'), 'utf8')).toBe('A1')
    expect((await readAppliedManifest(root, 'poe1'))?.version).toBe('1')
    expect((await fs.readdir(root)).filter((n) => n.startsWith('.'))).toEqual([])
  })

  it('та же длина, другое содержимое — именно sha256 mismatch', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    const res = await applyDataUpdate(manifest('1', { 'a.txt': 'GOOD' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'EVIL' }) })
    expect(res).toEqual({ status: 'failed', error: 'sha256 mismatch: a.txt' })
  })

  it('сбой сети посреди пакета — откат', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    const res = await applyDataUpdate(manifest('1', { 'a.txt': 'A', 'b.txt': 'B' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A' }) })
    expect(res).toEqual({ status: 'failed', error: '404 b.txt' })
    expect(await list(path.join(root, 'poe1'))).toEqual([])
  })

  it('сбой подмены папок — прежняя надстройка возвращается на место', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    await applyDataUpdate(manifest('1', { 'a.txt': 'A1' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A1' }) })
    let calls = 0
    const rename = async (from: string, to: string): Promise<void> => {
      calls++
      if (calls === 2) throw new Error('EBUSY: file in use') // staging → target
      await fs.rename(from, to)
    }
    const res = await applyDataUpdate(manifest('2', { 'a.txt': 'A2' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A2' }), rename })
    expect(res).toEqual({ status: 'failed', error: 'EBUSY: file in use' })
    expect(await fs.readFile(path.join(root, 'poe1', 'a.txt'), 'utf8')).toBe('A1')
    expect((await fs.readdir(root)).filter((n) => n.startsWith('.'))).toEqual([])
  })
})

describe('recoverDataDir / resetDataOverride', () => {
  it('авария посреди подмены: папки игры нет, бэкап есть — бэкап возвращается', async () => {
    const { root } = await setup({})
    await fs.mkdir(path.join(root, '.backup-poe1-100', 'en'), { recursive: true })
    await fs.writeFile(path.join(root, '.backup-poe1-100', 'en', 'x.txt'), 'kept')
    await fs.mkdir(path.join(root, '.staging-poe1-101'), { recursive: true })
    await recoverDataDir(root, 'poe1')
    expect(await fs.readFile(path.join(root, 'poe1', 'en', 'x.txt'), 'utf8')).toBe('kept')
    expect((await fs.readdir(root)).sort()).toEqual(['poe1'])
  })

  it('откат к встроенным данным — удалить надстройку', async () => {
    const { root, bundledDir } = await setup({ 'a.txt': 'a' })
    await applyDataUpdate(manifest('1', { 'a.txt': 'A1' }), { root, bundledDir, fetchFile: server({ 'a.txt': 'A1' }) })
    await resetDataOverride(root, 'poe1')
    expect(await readAppliedManifest(root, 'poe1')).toBeNull()
  })
})
