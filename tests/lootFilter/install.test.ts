import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { gitBlobSha1, installFilter, recordFor, sha256, targetPath, withRecord, type Net } from '../../src/main/lootFilter/install'
import type { InstalledRecord } from '../../src/main/lootFilter/store'
import { isLootFilterUrl } from '@shared/lootFilter/source'
import { RELEASE_JSON, ROOT, filterText, gitSha, makeZip, releaseEntries, treeJson, type FixtureEntry } from './zipFixture'

// S53: установка целиком на подменённом архиве и временной «папке фильтров» (реальная папка игрока не трогается).

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'poeth-lf-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

interface FakeNetOpts {
  entries?: FixtureEntry[]
  zip?: Buffer
  tree?: unknown
  release?: unknown
  fail?: Partial<Record<'release' | 'tree' | 'zip', 'network' | 'rate-limited' | 'too-large'>>
}

function fakeNet(o: FakeNetOpts = {}): Net & { urls: string[] } {
  const entries = o.entries ?? releaseEntries()
  const urls: string[] = []
  return {
    urls,
    json: async (url) => {
      urls.push(url)
      if (url.includes('/releases/latest')) {
        if (o.fail?.release) return { ok: false, error: o.fail.release }
        return { ok: true, json: o.release ?? RELEASE_JSON }
      }
      if (o.fail?.tree) return { ok: false, error: o.fail.tree }
      return { ok: true, json: o.tree ?? treeJson(entries) }
    },
    zip: async (url) => {
      urls.push(url)
      if (o.fail?.zip) return { ok: false, error: o.fail.zip }
      return { ok: true, body: o.zip ?? makeZip(entries) }
    }
  }
}

const file1 = 'POETH-NeverSink-1-REGULAR.filter'
const listDir = (): string[] => readdirSync(dir).sort()

describe('installFilter', () => {
  it('ставит свой файл уровня с байтами из архива и записью манифеста', async () => {
    const net = fakeNet()
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net, now: () => new Date('2026-10-30T10:00:00Z') })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const bytes = readFileSync(path.join(dir, file1))
    expect(bytes.toString('utf8')).toBe(filterText('1-REGULAR'))
    expect(out.record).toEqual({
      file: file1,
      level: 1,
      style: 'default',
      tag: '8.20.2',
      sha256: sha256(bytes),
      size: bytes.length,
      installedAt: '2026-10-30T10:00:00.000Z',
      dir: path.resolve(dir)
    })
    expect(listDir()).toEqual([file1]) // ни mp3, ни других файлов, ни временного файла
  })

  it('стиль кладётся в тот же файл уровня', async () => {
    const out = await installFilter({ req: { level: 3, style: 'abyss' }, dir, records: [], net: fakeNet() })
    expect(out.ok).toBe(true)
    expect(readFileSync(path.join(dir, 'POETH-NeverSink-3-STRICT.filter'), 'utf8')).toBe(filterText('3-STRICT', 'ABYSS'))
  })

  it('ходит только на api.github.com и codeload.github.com', async () => {
    const net = fakeNet()
    await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net })
    expect(net.urls).toHaveLength(3)
    for (const u of net.urls) expect(isLootFilterUrl(u), u).toBe(true)
    expect(net.urls.map((u) => new URL(u).hostname)).toEqual(['api.github.com', 'api.github.com', 'codeload.github.com'])
  })

  it('чужие фильтры игрока в папке не трогает', async () => {
    const theirs: Record<string, string> = {
      "NeverSink's filter - 1-REGULAR.filter": 'их копия',
      'MyFilter.filter': 'Show # мой',
      'POETH-NeverSink-1-REGULAR.filter.bak': 'бэкап игрока',
      'production_Config.ini': '[GAME]'
    }
    for (const [n, c] of Object.entries(theirs)) writeFileSync(path.join(dir, n), c)
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet() })
    expect(out.ok).toBe(true)
    for (const [n, c] of Object.entries(theirs)) expect(readFileSync(path.join(dir, n), 'utf8'), n).toBe(c)
    expect(listDir()).toEqual([...Object.keys(theirs), file1].sort())
  })

  it('свой файл не менялся — обновляет молча', async () => {
    const first = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet() })
    if (!first.ok) throw new Error('first install failed')
    const entries = releaseEntries().map((e) =>
      e.name.endsWith("- 1-REGULAR.filter") && !e.name.includes('(STYLE)') ? { ...e, data: filterText('1-REGULAR', 'DEFAULT', 'Show # new') } : e
    )
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [first.record], net: fakeNet({ entries }) })
    expect(out.ok).toBe(true)
    expect(readFileSync(path.join(dir, file1), 'utf8')).toContain('Show # new')
  })

  it('свой файл игрок менял — спрашивает и ничего не качает; с «Перезаписать» — заменяет', async () => {
    const first = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet() })
    if (!first.ok) throw new Error('first install failed')
    writeFileSync(path.join(dir, file1), 'Show # правка игрока')
    const net = fakeNet()
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [first.record], net })
    expect(out).toEqual({ ok: false, error: 'refused', confirm: 'modified' })
    expect(net.urls).toEqual([]) // вопрос — до загрузки
    expect(readFileSync(path.join(dir, file1), 'utf8')).toBe('Show # правка игрока')

    const again = await installFilter({ req: { level: 1, style: 'default', confirm: true }, dir, records: [first.record], net: fakeNet() })
    expect(again.ok).toBe(true)
    expect(readFileSync(path.join(dir, file1), 'utf8')).toBe(filterText('1-REGULAR'))
  })

  it('файл с нашим именем, которого POETH не помнит, — спрашивает (unknown)', async () => {
    writeFileSync(path.join(dir, file1), 'Show # непонятно чей')
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet() })
    expect(out).toEqual({ ok: false, error: 'refused', confirm: 'unknown' })
    expect(readFileSync(path.join(dir, file1), 'utf8')).toBe('Show # непонятно чей')
  })

  it('запись манифеста из другой папки — не наша', async () => {
    const other: InstalledRecord = {
      file: file1,
      level: 1,
      style: 'default',
      tag: '8.20.1',
      sha256: sha256(Buffer.from('Show # x')),
      size: 8,
      installedAt: '',
      dir: path.join(dir, 'elsewhere')
    }
    writeFileSync(path.join(dir, file1), 'Show # x')
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [other], net: fakeNet() })
    expect(out).toEqual({ ok: false, error: 'refused', confirm: 'unknown' })
  })

  it('по пути папка — отказ даже с подтверждением', async () => {
    mkdirSync(path.join(dir, file1))
    const out = await installFilter({ req: { level: 1, style: 'default', confirm: true }, dir, records: [], net: fakeNet() })
    expect(out).toEqual({ ok: false, error: 'refused' })
  })

  it('по пути ссылка на чужой файл — отказ, файл по ссылке цел', async () => {
    const victim = path.join(dir, 'victim.txt')
    writeFileSync(victim, 'не трогать')
    try {
      symlinkSync(victim, path.join(dir, file1), 'file')
    } catch {
      return // без прав на симлинки (Windows без режима разработчика) — проверка не применима
    }
    const out = await installFilter({ req: { level: 1, style: 'default', confirm: true }, dir, records: [], net: fakeNet() })
    expect(out).toEqual({ ok: false, error: 'refused' })
    expect(readFileSync(victim, 'utf8')).toBe('не трогать')
  })

  it('архив с обходом пути — bad-archive, ничего не записано', async () => {
    const entries = [...releaseEntries(), { name: `${ROOT}/../../../evil.filter`, data: filterText('1-REGULAR') }]
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ entries }) })
    expect(out).toMatchObject({ ok: false, error: 'bad-archive' })
    expect(listDir()).toEqual([])
    expect(readdirSync(path.dirname(dir)).includes('evil.filter')).toBe(false)
  })

  it('не ZIP вместо архива — bad-archive', async () => {
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ zip: Buffer.from('<html>oops</html>') }) })
    expect(out).toMatchObject({ ok: false, error: 'bad-archive' })
    expect(listDir()).toEqual([])
  })

  it('файл фильтра больше потолка — too-large', async () => {
    const huge = 'Show\n' + '#'.repeat(9 * 1024 * 1024)
    const entries = releaseEntries().map((e) => (e.name === `${ROOT}/NeverSink's filter - 1-REGULAR.filter` ? { ...e, data: huge } : e))
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ entries }) })
    expect(out).toMatchObject({ ok: false, error: 'too-large' })
    expect(listDir()).toEqual([])
  })

  it('архив больше потолка (сеть оборвала) — too-large', async () => {
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ fail: { zip: 'too-large' } }) })
    expect(out).toMatchObject({ ok: false, error: 'too-large' })
  })

  it('содержимое не совпало с деревом GitHub — verify-failed', async () => {
    const tree = treeJson(releaseEntries()) as { tree: { path: string; sha: string }[] }
    for (const e of tree.tree) if (e.path === "NeverSink's filter - 1-REGULAR.filter") e.sha = gitSha('другое')
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ tree }) })
    expect(out).toMatchObject({ ok: false, error: 'verify-failed' })
    expect(listDir()).toEqual([])
  })

  it('файла нет в дереве — verify-failed', async () => {
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ tree: { truncated: false, tree: [] } }) })
    expect(out).toMatchObject({ ok: false, error: 'verify-failed' })
  })

  it('в архиве под именем фильтра — не фильтр — not-filter', async () => {
    const entries = releaseEntries().map((e) => (e.name === `${ROOT}/NeverSink's filter - 1-REGULAR.filter` ? { ...e, data: '@echo off\r\ndel /q *' } : e))
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ entries }) })
    expect(out).toMatchObject({ ok: false, error: 'not-filter' })
    expect(listDir()).toEqual([])
  })

  it('стиля нет в релизе — not-in-archive', async () => {
    const out = await installFilter({ req: { level: 1, style: 'vaal' }, dir, records: [], net: fakeNet() })
    expect(out).toMatchObject({ ok: false, error: 'not-in-archive' })
  })

  it('pre-release — bad-release; лимит GitHub — rate-limited', async () => {
    expect(await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ release: { ...RELEASE_JSON, prerelease: true } }) })).toEqual({
      ok: false,
      error: 'bad-release'
    })
    expect(await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet({ fail: { release: 'rate-limited' } }) })).toEqual({
      ok: false,
      error: 'rate-limited'
    })
  })

  it('папки нет — no-folder', async () => {
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir: path.join(dir, 'нет'), records: [], net: fakeNet() })
    expect(out).toEqual({ ok: false, error: 'no-folder' })
  })
})

describe('пути и манифест', () => {
  it('путь записи — только своё имя внутри папки', () => {
    expect(targetPath(dir, 1)).toBe(path.join(path.resolve(dir), file1))
  })
  it('git-SHA как у git', () => {
    // `git hash-object` пустого файла
    expect(gitBlobSha1(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })
  it('withRecord заменяет запись того же файла в той же папке', () => {
    const r = (tag: string, d = dir): InstalledRecord => ({ file: file1, level: 1, style: 'default', tag, sha256: 'a'.repeat(64), size: 1, installedAt: '', dir: d })
    const list = withRecord([r('8.20.1'), r('8.20.1', '/other')], r('8.20.2'))
    expect(list.map((x) => x.tag)).toEqual(['8.20.1', '8.20.2'])
    expect(recordFor(list, dir, file1)?.tag).toBe('8.20.2')
  })
})
