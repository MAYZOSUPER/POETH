import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { defaultSettings } from '@shared/settings'

// Первый запуск компаньона (S32): React StrictMode дважды зовёт init() стора приложения. Оба вызова видят
// пустой список профилей — раньше каждый создавал свой «Персонаж 1» (и падала гонка записи profiles.json).
// Стор renderer работает с настоящим profileStore main на временной папке userData; overlayApi — тонкая прослойка.

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir, getVersion: () => '0.0.0-test' } }))

type ProfileStore = typeof import('../../src/main/services/profileStore')
// Стор renderer опирается на DOM-типы и Window.overlayApi, которых нет в tsconfig.test.json, — поэтому импорт
// по вычисляемому пути и только нужная тесту часть типа.
interface AppStore {
  useAppStore: {
    getState(): { init(): Promise<void>; activeProfileId: string | null; profiles: { id: string }[] }
  }
}
const APP_STORE = '../../src/renderer/src/store/useAppStore'

let root = ''

async function boot(opts: { failFirstCreate?: boolean } = {}): Promise<{
  profiles: ProfileStore
  app: AppStore
  active: string[]
  creates: { count: number }
}> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-firstrun-'))
  state.dir = path.join(root, 'userData')
  vi.resetModules()
  const profiles = await import('../../src/main/services/profileStore')
  const active: string[] = []
  const creates = { count: 0 }
  const off = (): (() => void) => () => undefined
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 1))
  // как IPC: каждый ответ приходит не сразу
  const ipc =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R> | R) =>
    async (...a: A): Promise<R> => {
      await tick()
      const r = await fn(...a)
      await tick()
      return r
    }
  const overlayApi = {
    dataset: { get: ipc(() => ({ acts: [], areas: {} })) },
    settings: { get: ipc(() => defaultSettings()) },
    profiles: {
      list: ipc(() => profiles.listProfiles()),
      create: ipc((name: string, cls?: string) => {
        creates.count++
        if (opts.failFirstCreate && creates.count === 1) throw new Error('нет диска')
        return profiles.createProfile(name, cls)
      }),
      setActive: ipc((id: string) => {
        active.push(id)
      })
    },
    progress: { get: ipc((id: string) => profiles.getProgress(id)) },
    tailer: { status: ipc(() => ({ running: false, logPath: null, found: false })) },
    onActiveProfileChanged: off,
    onHotkey: off,
    onTailerStatus: off,
    onZoneChange: off,
    onLevelChange: off,
    onBossDefeat: off,
    onPriceResult: off
  }
  ;(globalThis as { window?: unknown }).window = { overlayApi }
  const app = (await import(/* @vite-ignore */ APP_STORE)) as AppStore
  return { profiles, app, active, creates }
}

afterEach(async () => {
  delete (globalThis as { window?: unknown }).window
  if (root) await fs.rm(root, { recursive: true, force: true })
  root = ''
})

describe('первый запуск: init() дважды подряд', () => {
  it('создаётся ровно один профиль, оба вызова делают активным его', async () => {
    const { profiles, app, active, creates } = await boot()
    const { init } = app.useAppStore.getState()
    await Promise.all([init(), init()])

    const list = await profiles.listProfiles()
    expect(list).toHaveLength(1)
    expect(creates.count).toBe(1)
    expect(app.useAppStore.getState().activeProfileId).toBe(list[0].id)
    expect(app.useAppStore.getState().profiles.map((p) => p.id)).toEqual([list[0].id])
    expect(new Set(active)).toEqual(new Set([list[0].id]))
  })

  it('профиль уже есть — init() ничего не создаёт', async () => {
    const { profiles, app, creates } = await boot()
    const mine = await profiles.createProfile('Мой')
    const { init } = app.useAppStore.getState()
    await Promise.all([init(), init()])
    expect(creates.count).toBe(0)
    expect((await profiles.listProfiles()).map((p) => p.id)).toEqual([mine.id])
    expect(app.useAppStore.getState().activeProfileId).toBe(mine.id)
  })

  it('создание не удалось — следующий init() пробует снова', async () => {
    const { profiles, app, creates } = await boot({ failFirstCreate: true })
    const { init } = app.useAppStore.getState()
    await expect(init()).rejects.toThrow('нет диска')
    await init()
    expect(creates.count).toBe(2)
    expect(await profiles.listProfiles()).toHaveLength(1)
  })
})
