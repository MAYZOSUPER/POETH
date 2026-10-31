import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { DATA_MANIFEST_URL } from '@shared/links'
import { dataManifestUrl, isSafeDataPath, validateDataManifest } from '@shared/updates'
import { DATA_GAMES, entriesToReplace, manifestName, ownerOf } from '../../tools/data/data-channel.mjs'

// Канал данных по играм (S67): у PoE 1 и PoE 2 свои манифесты в ветке `data`, выпуск одной игры не
// трогает пакет другой; приложение читает манифест запущенной игры.

const ROOT = resolve(__dirname, '../..')

describe('раскладка ветки data по играм (tools/data/data-channel.mjs)', () => {
  it('манифесты: PoE 1 — прежний manifest.json, PoE 2 — manifest-poe2.json', () => {
    expect(manifestName('poe1')).toBe('manifest.json')
    expect(manifestName('poe2')).toBe('manifest-poe2.json')
  })

  it('приложение ищет манифест там же, куда его кладут скрипты', () => {
    for (const g of DATA_GAMES) {
      const url = dataManifestUrl(DATA_MANIFEST_URL, g as 'poe1' | 'poe2')
      expect(url.endsWith(`/data/${manifestName(g)}`), url).toBe(true)
      // файлы пакета — <game>/<путь> относительно манифеста
      expect(new URL(`${g}/en/stats.ndjson`, url).toString()).toBe(`https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/${g}/en/stats.ndjson`)
    }
    expect(dataManifestUrl(DATA_MANIFEST_URL, 'poe1')).toBe(DATA_MANIFEST_URL)
    expect(dataManifestUrl('http://127.0.0.1:5000/data/manifest.json', 'poe2')).toBe('http://127.0.0.1:5000/data/manifest-poe2.json')
  })

  it('чья запись в корне ветки', () => {
    expect(ownerOf('manifest.json')).toBe('poe1')
    expect(ownerOf('poe1')).toBe('poe1')
    expect(ownerOf('manifest-poe2.json')).toBe('poe2')
    expect(ownerOf('poe2')).toBe('poe2')
    for (const e of ['README.md', '.gitattributes', 'manifest-poe3.json', 'poe3', 'src']) expect(ownerOf(e), e).toBeNull()
  })

  it('выпуск PoE 2 заменяет свой пакет и общие файлы, пакет PoE 1 остаётся', () => {
    const root = ['.git', '.gitattributes', 'README.md', 'manifest.json', 'poe1', 'manifest-poe2.json', 'poe2', 'stray.txt']
    expect(entriesToReplace(root, ['poe2']).sort()).toEqual(['.gitattributes', 'README.md', 'manifest-poe2.json', 'poe2', 'stray.txt'])
    // PoE 1 — как до S67, но без чужого пакета
    expect(entriesToReplace(root, ['poe1']).sort()).toEqual(['.gitattributes', 'README.md', 'manifest.json', 'poe1', 'stray.txt'])
    expect(entriesToReplace(root, ['poe1', 'poe2']).sort()).toEqual(root.filter((e) => e !== '.git').sort())
  })
})

describe('пакет данных PoE 2 (publish-data.mjs --game poe2)', () => {
  const out = mkdtempSync(join(tmpdir(), 'poeth-s67-pack-'))
  afterAll(() => rmSync(out, { recursive: true, force: true }))
  execFileSync(process.execPath, [join(ROOT, 'tools/data/publish-data.mjs'), '--game', 'poe2', '--out', out], { stdio: 'ignore' })
  const raw = JSON.parse(readFileSync(join(out, 'manifest-poe2.json'), 'utf8')) as {
    version: string
    files: Record<string, { sha256: string; size: number }>
  }
  const src = join(ROOT, 'resources/data/poe2')

  it('только манифест PoE 2 и папка poe2', () => {
    expect(readdirSync(out).sort()).toEqual(['manifest-poe2.json', 'poe2'])
  })

  it('манифест проходит проверку приложения', () => {
    const v = validateDataManifest(raw, '99.0.0')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.manifest.game).toBe('poe2')
  })

  it('версия по умолчанию — дата данных EE2 (+ дата снимка цен, если он есть)', () => {
    const meta = JSON.parse(readFileSync(join(src, 'data.meta.json'), 'utf8')) as { date: string }
    expect(raw.version.startsWith(meta.date.replace(/-/g, '.'))).toBe(true)
    expect(raw.version).toMatch(/^\d{4}\.\d\d\.\d\d(-p\d{8})?$/)
  })

  it('файлы = resources/data/poe2 (sha256, размер), пути безопасны, скрытых нет', () => {
    const files = Object.entries(raw.files)
    expect(files.length).toBeGreaterThan(10)
    expect(files.length).toBeLessThanOrEqual(500)
    for (const [rel, f] of files) {
      expect(isSafeDataPath(rel), rel).toBe(true)
      const buf = readFileSync(join(src, rel))
      expect(createHash('sha256').update(buf).digest('hex'), rel).toBe(f.sha256)
      expect(readFileSync(join(out, 'poe2', rel)).length, rel).toBe(f.size)
    }
    expect(files.some(([rel]) => rel.split('/').some((s) => s.startsWith('.')))).toBe(false)
    expect(raw.files['en/items.ndjson'] && raw.files['ru/items.ndjson']).toBeTruthy()
  })
})
