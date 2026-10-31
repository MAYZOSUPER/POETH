import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { cpSync, promises as fsp, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { DataManifest } from '@shared/types'
import { isQuietDataUpdate, validateDataManifest } from '@shared/updates'
import { applyDataUpdate, sha256 } from '../../src/main/services/dataUpdate'
import { MAX_PREV, assertFullHistory, gitDataHistory, nonPriceChanges, prevVersions } from '../../tools/data/data-channel.mjs'

// S67: (1) суточный выпуск цен PoE 2 меняет только prices/ поверх опубликованного пакета; без тоста «Перезапустите»;
// (2) у файла пакета `prev` — прежние версии из истории main: встроенный файл новее пакета не откатывается.

const ROOT = resolve(__dirname, '../..')
const PUBLISH = join(ROOT, 'tools/data/publish-data.mjs')
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

describe('prev: прежние версии файла (data-channel.mjs)', () => {
  it('версия из истории — только старше неё; не из истории — вся история; без повторов, не больше MAX_PREV', () => {
    expect(prevVersions(['c', 'b', 'a'], 'b')).toEqual(['a'])
    expect(prevVersions(['c', 'b', 'a'], 'c')).toEqual(['b', 'a'])
    expect(prevVersions(['c', 'b', 'a'], 'snapshot')).toEqual(['c', 'b', 'a'])
    expect(prevVersions(['a', 'b', 'a'], 'a')).toEqual(['b'])
    expect(prevVersions([], 'x')).toEqual([])
    expect(prevVersions(Array.from({ length: 150 }, (_, i) => `v${i}`), 'new')).toHaveLength(MAX_PREV)
  })

  it('история git данных: первая версия — содержимое файла в HEAD; история полная', () => {
    expect(() => assertFullHistory(ROOT)).not.toThrow()
    const hist = gitDataHistory(ROOT, 'poe2') as Map<string, string[]>
    const rel = 'data.meta.json'
    const head = execFileSync('git', ['show', `HEAD:resources/data/poe2/${rel}`], { cwd: ROOT })
    expect(hist.get(rel)?.[0]).toBe(sha(head))
    expect(hist.get('prices/index.json')?.length).toBeGreaterThan(0)
    for (const list of hist.values()) for (const s of list) expect(s).toMatch(/^[0-9a-f]{64}$/)
  })

  it('обрезанная история HEAD (clone --depth) — ошибка; обрезанная чужая ветка (fetch --depth=1 data) — нет', () => {
    const base = mkdtempSync(join(tmpdir(), 'poeth-s67-shallow-'))
    const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd, stdio: 'pipe' })
    try {
      const up = join(base, 'up')
      g(base, 'init', '-q', '-b', 'main', up)
      for (const v of ['1', '2']) {
        writeFileSync(join(up, 'f.txt'), v)
        g(up, 'add', '.')
        g(up, 'commit', '-q', '-m', v)
      }
      g(up, 'checkout', '-q', '--orphan', 'data')
      g(up, 'commit', '-q', '-m', 'data')
      g(up, 'checkout', '-q', 'main')
      const url = `file://${up.replace(/\\/g, '/')}`
      g(base, 'clone', '-q', '--depth', '1', url, 'shallow')
      expect(() => assertFullHistory(join(base, 'shallow'))).toThrow(/обрезана/)
      g(base, 'clone', '-q', url, 'full')
      g(join(base, 'full'), 'fetch', '-q', '--depth', '1', 'origin', 'data')
      expect(() => assertFullHistory(join(base, 'full'))).not.toThrow()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('манифест с prev проходит проверку приложения; битый prev — пакет отклонён', () => {
    const f = { sha256: 'a'.repeat(64), size: 1 }
    const ok = validateDataManifest({ version: '1', game: 'poe2', files: { 'a.txt': { ...f, prev: ['b'.repeat(64)] } } }, '1.0.0')
    expect(ok.ok && ok.manifest.files['a.txt'].prev).toEqual(['b'.repeat(64)])
    const old = validateDataManifest({ version: '1', game: 'poe2', files: { 'a.txt': f } }, '1.0.0')
    expect(old.ok && old.manifest.files['a.txt'].prev).toBeUndefined()
    for (const prev of ['x', ['nothex'], Array.from({ length: 201 }, () => 'c'.repeat(64))]) {
      expect(validateDataManifest({ version: '1', game: 'poe2', files: { 'a.txt': { ...f, prev } } }, '1.0.0').ok).toBe(false)
    }
  })
})

describe('применение пакета с prev (dataUpdate.ts)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  async function setup(bundled: Record<string, string>) {
    const base = mkdtempSync(join(tmpdir(), 'poeth-s67-prev-'))
    dirs.push(base)
    const bundledDir = join(base, 'resources/data/poe2')
    for (const [rel, text] of Object.entries(bundled)) {
      await fsp.mkdir(join(bundledDir, rel, '..'), { recursive: true })
      writeFileSync(join(bundledDir, rel), text)
    }
    return { root: join(base, 'userData/data'), bundledDir }
  }
  const file = (text: string, prev?: string[]) => ({ sha256: sha256(Buffer.from(text)), size: Buffer.byteLength(text), ...(prev ? { prev: prev.map((p) => sha256(Buffer.from(p))) } : {}) })
  const serve = (files: Record<string, string>, log: string[] = []) => async (rel: string) => (log.push(rel), Buffer.from(files[rel]))

  it('встроенный новее пакета (его нет в prev) — остаётся встроенный; старее (есть в prev) — заменяется', async () => {
    // сборка вышла позже выпуска данных: regex у неё «v3», в пакете «v2» (prev: v1); цены в пакете новее встроенных
    const { root, bundledDir } = await setup({ 'regex/regex.en.json': 'v3', 'prices/index.json': 'p1' })
    const m: DataManifest = { version: '2', game: 'poe2', files: { 'regex/regex.en.json': file('v2', ['v1']), 'prices/index.json': file('p2', ['p1', 'p0']) } }
    const fetched: string[] = []
    const res = await applyDataUpdate(m, { root, bundledDir, fetchFile: serve({ 'regex/regex.en.json': 'v2', 'prices/index.json': 'p2' }, fetched) })
    expect(res).toEqual({ status: 'applied', changed: 1, downloaded: 1, kept: 1, paths: ['prices/index.json'] })
    expect(fetched).toEqual(['prices/index.json'])
    await expect(fsp.access(join(root, 'poe2/regex/regex.en.json'))).rejects.toThrow()
    expect(readFileSync(join(root, 'poe2/prices/index.json'), 'utf8')).toBe('p2')
    expect(isQuietDataUpdate(res.status === 'applied' ? res.paths : ['x'])).toBe(true)
  })

  it('пакет без prev (до S67) — заменяется, как раньше', async () => {
    const { root, bundledDir } = await setup({ 'regex/regex.en.json': 'v3' })
    const m: DataManifest = { version: '2', game: 'poe2', files: { 'regex/regex.en.json': file('v2') } }
    const res = await applyDataUpdate(m, { root, bundledDir, fetchFile: serve({ 'regex/regex.en.json': 'v2' }) })
    expect(res).toMatchObject({ status: 'applied', changed: 1, kept: 0, paths: ['regex/regex.en.json'] })
  })

  it('всё в пакете старее встроенного и надстройки нет — «без изменений», ничего не качаем', async () => {
    const { root, bundledDir } = await setup({ 'a.json': 'new' })
    const fetched: string[] = []
    const res = await applyDataUpdate({ version: '2', game: 'poe2', files: { 'a.json': file('old', ['older']) } }, { root, bundledDir, fetchFile: serve({}, fetched) })
    expect(res).toEqual({ status: 'unchanged' })
    expect(fetched).toEqual([])
  })

  it('тост: только цены — тихо; цены и regex — тост; файл ушёл из надстройки — это тоже изменение', async () => {
    const { root, bundledDir } = await setup({ 'regex/r.json': 'r1', 'prices/x.json': 'x1' })
    const all = { 'regex/r.json': 'r2', 'prices/x.json': 'x2' }
    const v1 = await applyDataUpdate({ version: '1', game: 'poe2', files: { 'regex/r.json': file('r2', ['r1']), 'prices/x.json': file('x2', ['x1']) } }, { root, bundledDir, fetchFile: serve(all) })
    expect(v1.status === 'applied' && v1.paths).toEqual(['regex/r.json', 'prices/x.json'])
    expect(isQuietDataUpdate(v1.status === 'applied' ? v1.paths : [])).toBe(false)
    // суточный выпуск: regex тот же, цены новые
    const v2 = await applyDataUpdate({ version: '2', game: 'poe2', files: { 'regex/r.json': file('r2', ['r1']), 'prices/x.json': file('x3', ['x2', 'x1']) } }, { root, bundledDir, fetchFile: serve({ ...all, 'prices/x.json': 'x3' }) })
    expect(v2).toMatchObject({ status: 'applied', downloaded: 1, paths: ['prices/x.json'] })
    expect(isQuietDataUpdate(v2.status === 'applied' ? v2.paths : [])).toBe(true)
    // в новом пакете regex-файла нет — игрок снова видит встроенный r1: изменение, тост
    const v3 = await applyDataUpdate({ version: '3', game: 'poe2', files: { 'prices/x.json': file('x3', ['x2', 'x1']) } }, { root, bundledDir, fetchFile: serve({}) })
    expect(v3.status === 'applied' && v3.paths).toEqual(['regex/r.json'])
    expect(isQuietDataUpdate([])).toBe(true)
  })
})

describe('выпуск только цен (publish-data --base-manifest)', () => {
  const work = mkdtempSync(join(tmpdir(), 'poeth-s67-prices-only-'))
  afterAll(() => rmSync(work, { recursive: true, force: true }))
  const publish = (...args: string[]) => execFileSync(process.execPath, [PUBLISH, '--game', 'poe2', ...args], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })

  // «опубликованный пакет»: полный выпуск PoE 2 с minApp старой версии приложения
  publish('--out', join(work, 'published'), '--min-app', '0.0.7', '--version', '2026.10.30-1')
  const baseManifest = join(work, 'published/manifest-poe2.json')
  const base = JSON.parse(readFileSync(baseManifest, 'utf8')) as DataManifest
  const priceFile = Object.keys(base.files).find((k) => k.startsWith('prices/') && k !== 'prices/index.json')!

  it('свежие цены поверх опубликованного: остальное и minApp — как у опубликованного', () => {
    const src = join(work, 'src-ok')
    cpSync(join(work, 'published'), src, { recursive: true })
    const p = join(src, 'poe2', priceFile)
    const snap = JSON.parse(readFileSync(p, 'utf8'))
    snap.at += 86_400_000
    writeFileSync(p, JSON.stringify(snap))
    const log = publish('--src', src, '--base-manifest', join(src, 'manifest-poe2.json'), '--out', join(work, 'out-ok'))
    expect(log).toMatch(/только цены поверх опубликованного/)
    const m = JSON.parse(readFileSync(join(work, 'out-ok/manifest-poe2.json'), 'utf8')) as DataManifest
    expect(m.minApp).toBe('0.0.7')
    expect(nonPriceChanges(base.files, m.files)).toEqual([])
    expect(m.files[priceFile].sha256).not.toBe(base.files[priceFile].sha256)
    // снимок CI в истории не найден — prev = все закоммиченные версии файла цен (встроенный среди них)
    const committed = sha(execFileSync('git', ['show', `HEAD:resources/data/poe2/${priceFile}`], { cwd: ROOT }))
    expect(m.files[priceFile].prev).toContain(committed)
  })

  it('что-то вне prices/ отличается — ошибка, пакета нет', () => {
    const src = join(work, 'src-bad')
    cpSync(join(work, 'published'), src, { recursive: true })
    writeFileSync(join(src, 'poe2/en/client_strings.json'), '{"tampered":true}')
    expect(() => publish('--src', src, '--base-manifest', join(src, 'manifest-poe2.json'), '--out', join(work, 'out-bad'))).toThrow(/не только prices\/.*en\/client_strings\.json/s)
    expect(() => readFileSync(join(work, 'out-bad/manifest-poe2.json'))).toThrow()
  })

  it('nonPriceChanges: добавлен, удалён, изменён — вне prices/', () => {
    const f = (s: string) => ({ sha256: s, size: 1 })
    expect(nonPriceChanges({ 'a': f('1'), 'b': f('2'), 'prices/x': f('3') }, { 'a': f('1'), 'c': f('4'), 'prices/x': f('5'), 'prices/y': f('6') })).toEqual(['b', 'c'])
  })
})
