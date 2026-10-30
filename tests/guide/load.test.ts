import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadGuide, type GuideRead } from '@shared/guide/library'

// «Справочник» (S55): статьи отдаёт протокол poeth://data/<игра>/guide/<файл> — сначала обновлённые каналом данных
// (userData/data/poe1/guide), затем встроенные (resources/data/poe1/guide). Здесь — та же цепочка без electron:
// resolveDataFile протокола + чтение файла, как fileResponse.

const state = { dir: '' }
vi.mock('electron', () => ({ app: { getPath: () => join(state.dir, 'user'), getAppPath: () => state.dir, isPackaged: false }, protocol: {} }))
vi.mock('../../src/main/services/questDataset', () => ({ resourcesDir: () => join(state.dir, 'res') }))
vi.mock('../../src/main/services/layoutResolver', () => ({ resolveLayoutFile: vi.fn(), resolveBrandFile: vi.fn(), contentTypeFor: vi.fn() }))
vi.mock('../../src/main/services/iconCache', () => ({ iconResponse: vi.fn() }))

const BUNDLED = join(__dirname, '../../resources/data/poe1/guide')
const bundledDir = (): string => join(state.dir, 'res', 'data', 'poe1', 'guide')
const userDir = (): string => join(state.dir, 'user', 'data', 'poe1', 'guide')

/** Как renderer: fetch poeth://data/poe1/guide/<файл> → протокол → файл. */
async function protocolRead(): Promise<GuideRead> {
  const { resolveDataFile } = await import('../../src/main/protocol')
  return async (file) => {
    const abs = await resolveDataFile('poe1', 'guide', file)
    return abs ? readFileSync(abs, 'utf8') : null
  }
}

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'poeth-guide-'))
  mkdirSync(bundledDir(), { recursive: true })
  cpSync(BUNDLED, bundledDir(), { recursive: true })
})
afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

describe('poeth://data/poe1/guide/<файл>', () => {
  it('guide — разрешённая подпапка; обход пути и чужие подпапки — нет', async () => {
    const { resolveDataFile } = await import('../../src/main/protocol')
    expect(await resolveDataFile('poe1', 'guide', 'index.json')).toBe(join(bundledDir(), 'index.json'))
    expect(await resolveDataFile('poe1', 'guide', '../build/tree.json')).toBeNull()
    expect(await resolveDataFile('poe1', 'guide', '..')).toBeNull()
    expect(await resolveDataFile('poe1', 'guides', 'index.json')).toBeNull()
    expect(await resolveDataFile('poe1', 'guide', 'missing.json')).toBeNull()
  })
})

describe('загрузка статей', () => {
  it('только встроенные данные', async () => {
    const res = await loadGuide(await protocolRead())
    expect(res.failed).toEqual([])
    expect(res.articles.map((a) => [a.id, a.rev])).toEqual([
      ['league-start', 1],
      ['glossary-basics', 1]
    ])
  })

  it('обновлённые в userData/data главнее встроенных: новая ревизия статьи и новая статья в списке', async () => {
    mkdirSync(userDir(), { recursive: true })
    const start = JSON.parse(readFileSync(join(BUNDLED, 'league-start.json'), 'utf8')) as Record<string, unknown> & {
      sections: { id: string; rev?: number; blocks: unknown[] }[]
    }
    start.rev = 2
    const s330 = start.sections.find((s) => s.id === 'new-330')!
    s330.rev = 2
    s330.blocks = [{ kind: 'text', text: { ru: 'Новая механика лиги — тестовый текст.', en: 'The new league mechanic — test text.' } }]
    writeFileSync(join(userDir(), 'league-start.json'), JSON.stringify(start))
    const extra = JSON.parse(readFileSync(join(BUNDLED, 'glossary-basics.json'), 'utf8')) as Record<string, unknown>
    writeFileSync(join(userDir(), 'endgame.json'), JSON.stringify({ ...extra, id: 'endgame' }))
    writeFileSync(join(userDir(), 'index.json'), JSON.stringify({ schema: 1, articles: ['league-start', 'endgame', 'glossary-basics'] }))

    const res = await loadGuide(await protocolRead())
    expect(res.failed).toEqual([])
    expect(res.articles.map((a) => [a.id, a.rev])).toEqual([
      ['league-start', 2],
      ['endgame', 1],
      ['glossary-basics', 1]
    ])
    const updated = res.articles[0].sections.find((s) => s.id === 'new-330')
    expect(updated?.blocks[0].kind).toBe('text')
  })

  it('надстройка с одним файлом: остальное — встроенное', async () => {
    mkdirSync(userDir(), { recursive: true })
    const g = JSON.parse(readFileSync(join(BUNDLED, 'glossary-basics.json'), 'utf8')) as Record<string, unknown>
    writeFileSync(join(userDir(), 'glossary-basics.json'), JSON.stringify({ ...g, rev: 5 }))
    const res = await loadGuide(await protocolRead())
    expect(res.articles.map((a) => [a.id, a.rev])).toEqual([
      ['league-start', 1],
      ['glossary-basics', 5]
    ])
  })

  it('битая статья из надстройки — только она не показывается', async () => {
    mkdirSync(userDir(), { recursive: true })
    writeFileSync(join(userDir(), 'glossary-basics.json'), '{"schema":1,"id":"glossary-basics","title":"<script>"}')
    const res = await loadGuide(await protocolRead())
    expect(res.articles.map((a) => a.id)).toEqual(['league-start'])
    expect(res.failed.map((f) => f.id)).toEqual(['glossary-basics'])
  })
})
