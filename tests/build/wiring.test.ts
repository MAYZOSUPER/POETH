import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { COMPANION_CHANNELS, ipcAllowed } from '../../src/main/security/policy'
import { sectionsFor } from '../../src/renderer/src/tabs'

// Подключение вкладки «Билд» (S39): канал вставки — только компаньон, данные S36 через poeth://data/poe1/build/…,
// пункт рельса в «Прокачке» — только с флагом.

const state = { dir: '' }
vi.mock('electron', () => ({ app: { getPath: () => state.dir, getAppPath: () => state.dir, isPackaged: false }, protocol: {} }))
vi.mock('../../src/main/services/questDataset', () => ({ resourcesDir: () => join(state.dir, 'res') }))
vi.mock('../../src/main/services/layoutResolver', () => ({ resolveLayoutFile: vi.fn(), resolveBrandFile: vi.fn(), contentTypeFor: vi.fn() }))
vi.mock('../../src/main/services/iconCache', () => ({ iconResponse: vi.fn() }))

describe('вставка кода PoB — только компаньон (политика S29)', () => {
  it('importPob и reload: компаньон да, оверлей и сайдбар нет', () => {
    // S53: в наборе ещё каналы фильтра лута (tests/lootFilter/store.test.ts) — здесь проверяем только свои
    expect([...COMPANION_CHANNELS].filter((c) => c.startsWith('build:'))).toEqual([IPC.build.importPob, IPC.build.reload])
    for (const ch of COMPANION_CHANNELS) {
      expect(ipcAllowed('index', ch)).toBe(true)
      expect(ipcAllowed('overlay', ch)).toBe(false)
      expect(ipcAllowed('trade-sidebar', ch)).toBe(false)
      expect(ipcAllowed(null, ch)).toBe(false)
    }
  })

  it('чтение билда гиду поверх игры можно', () => {
    expect(ipcAllowed('overlay', IPC.build.state)).toBe(true)
  })
})

describe('poeth://data/poe1/build/<файл>', () => {
  beforeEach(() => {
    state.dir = mkdtempSync(join(tmpdir(), 'poeth-build-'))
    mkdirSync(join(state.dir, 'res', 'data', 'poe1', 'build'), { recursive: true })
    writeFileSync(join(state.dir, 'res', 'data', 'poe1', 'build', 'tree.json'), '{}')
  })
  afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

  it('build — разрешённая подпапка; языки как были; прочие подпапки и обход — нет', async () => {
    const { resolveDataFile } = await import('../../src/main/protocol')
    expect(await resolveDataFile('poe1', 'build', 'tree.json')).toBe(join(state.dir, 'res', 'data', 'poe1', 'build', 'tree.json'))
    expect(await resolveDataFile('poe1', 'build', '../tree.json')).toBeNull()
    expect(await resolveDataFile('poe1', 'builds', 'tree.json')).toBeNull()
    expect(await resolveDataFile('poe1', 'advisor', 'strategies.json')).toBeNull()
    expect(await resolveDataFile('poe1', 'ru', 'missing.ndjson')).toBeNull()
  })
})

describe('пункт рельса «Билд»', () => {
  afterEach(() => {
    delete (globalThis as { overlayApi?: unknown }).overlayApi
  })

  it('раскрыт (GameFeatures.build): в «Прокачке» после «Кампании», только PoE 1', () => {
    const level = (game: 'poe1' | 'poe2') => sectionsFor(game, false).find((s) => s.id === 'level')?.tabs.map((t) => t.id)
    expect(level('poe1')).toEqual(['campaign', 'build'])
    ;(globalThis as { overlayApi?: unknown }).overlayApi = { build: { devFlag: true } }
    expect(level('poe1')).toEqual(['campaign', 'build'])
    expect(level('poe2')).toEqual(['campaign'])
    expect(sectionsFor('poe1', false).find((s) => s.id === 'level')?.tabs[1].icon).toBe('passive')
  })
})
