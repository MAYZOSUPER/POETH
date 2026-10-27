import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// settingsStore (main) с подменённым electron: гонка первого чтения (находка S9) и
// потерянные обновления при одновременных патчах.

const state = vi.hoisted(() => ({
  dir: '',
  /** сценарий S9: задержки чтения (по порядку вызовов) и записи, мс; null — настоящий диск */
  slow: null as null | { reads: number[]; writeMs: number; file: Record<string, unknown>; writes: unknown[] }
}))
vi.mock('electron', () => ({ app: { getPath: () => state.dir } }))
vi.mock('../../src/main/services/atomicJson', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/main/services/atomicJson')>()
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  return {
    ...real,
    readJson: async <T,>(file: string, fallback: T): Promise<T> => {
      const s = state.slow
      if (!s) return real.readJson(file, fallback)
      await wait(s.reads.shift() ?? 0)
      return JSON.parse(JSON.stringify(s.file)) as T
    },
    writeJsonAtomic: async (file: string, data: unknown): Promise<void> => {
      const s = state.slow
      if (!s) return real.writeJsonAtomic(file, data)
      await wait(s.writeMs)
      s.writes.push(JSON.parse(JSON.stringify(data)))
    }
  }
})

type Store = typeof import('../../src/main/services/settingsStore')

async function freshStore(initial?: Record<string, unknown>): Promise<Store> {
  state.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-settings-'))
  if (initial) await fs.writeFile(path.join(state.dir, 'settings.json'), JSON.stringify(initial))
  vi.resetModules()
  return import('../../src/main/services/settingsStore')
}

async function onDisk(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(state.dir, 'settings.json'), 'utf8'))
}

beforeEach(() => {
  state.dir = ''
  state.slow = null
})
afterEach(async () => {
  if (state.dir) await fs.rm(state.dir, { recursive: true, force: true })
})

describe('settingsStore', () => {
  it('гонка S9: позднее первое чтение не затирает «свёрнутый» запуск', async () => {
    const store = await freshStore()
    // проверка входа читает настройки первой и медленно; bootstrap — быстро, патчит, пишет долго
    state.slow = { reads: [60, 0], writeMs: 120, file: { schemaVersion: 2, overlayVisible: true }, writes: [] }
    const auth = store.getSettings()
    const boot = store.updateSettings({ overlayVisible: false })
    const [, booted] = await Promise.all([auth, boot])
    expect(booted.overlayVisible).toBe(false)
    expect((await store.getSettings()).overlayVisible).toBe(false)
    expect(state.slow.writes).toHaveLength(1)
    expect((state.slow.writes[0] as { overlayVisible: boolean }).overlayVisible).toBe(false)
  })

  it('первые параллельные чтения не затирают патч, применённый между ними', async () => {
    const store = await freshStore({ schemaVersion: 2, overlayVisible: true })
    const first = store.getSettings()
    const patched = store.updateSettings({ overlayVisible: false })
    const second = store.getSettings()
    const [a, u, b] = await Promise.all([first, patched, second])
    expect(u.overlayVisible).toBe(false)
    expect(a.overlayVisible === true || a.overlayVisible === false).toBe(true)
    expect(b.overlayVisible === true || b.overlayVisible === false).toBe(true)
    expect((await store.getSettings()).overlayVisible).toBe(false)
    expect((await onDisk()).overlayVisible).toBe(false)
  })

  it('одновременные патчи не теряются и пишутся по очереди', async () => {
    const store = await freshStore({ schemaVersion: 2 })
    const results = await Promise.all([
      store.updateSettings({ locked: true }),
      store.updateSettings({ opacity: 0.5 }),
      store.updateSettings({ startup: { withWindows: true } })
    ])
    expect(results[2]).toMatchObject({ locked: true, opacity: 0.5 })
    expect(results[2].startup.withWindows).toBe(true)
    const disk = await onDisk()
    expect(disk).toMatchObject({ locked: true, opacity: 0.5 })
    expect((disk.startup as { withWindows: boolean }).withWindows).toBe(true)
  })

  it('подписчик получает новые настройки и сам патч; ошибка записи не ломает очередь', async () => {
    const store = await freshStore()
    const seen: unknown[] = []
    store.onSettingsChange((next, patch) => seen.push([next.uiLang, patch]))
    await store.updateSettings({ uiLang: 'en' })
    expect(seen).toEqual([['en', { uiLang: 'en' }]])
    // запись падает (папки нет) — следующий патч всё равно выполняется
    const dir = state.dir
    state.dir = path.join(dir, 'missing', '\0bad')
    await expect(store.updateSettings({ locked: true })).rejects.toBeTruthy()
    state.dir = dir
    expect((await store.updateSettings({ opacity: 0.4 })).opacity).toBe(0.4)
  })
})
