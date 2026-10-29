import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// profileStore (main) на временной папке userData: одновременные вызовы на чистом профиле (S32).
// Раньше две записи profiles.json делили один profiles.json.tmp: вторая rename падала с ENOENT,
// а прочитавшая пустой список запись затирала первую.

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir, getVersion: () => '0.0.0-test' } }))

type Store = typeof import('../../src/main/services/profileStore')

let root = ''

async function freshStore(): Promise<Store> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-profiles-'))
  // POETH_USER_DATA_DIR может указывать на ещё не созданную папку
  state.dir = path.join(root, 'нет-ещё', 'userData')
  vi.resetModules()
  return import('../../src/main/services/profileStore')
}

async function filesIn(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort()
  } catch {
    return []
  }
}

beforeEach(() => {
  state.dir = ''
})

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
  root = ''
})

describe('profileStore: одновременные вызовы на чистом профиле', () => {
  it('пять одновременных createProfile — без ENOENT, все пять в profiles.json, у каждого прогресс', async () => {
    const store = await freshStore()
    const made = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => store.createProfile(n)))

    const list = await store.listProfiles()
    expect(list.map((p) => p.name).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(new Set(list.map((p) => p.id)).size).toBe(5)
    expect(list.map((p) => p.id).sort()).toEqual(made.map((p) => p.id).sort())

    const onDisk = JSON.parse(await fs.readFile(path.join(state.dir, 'profiles.json'), 'utf8')) as { id: string }[]
    expect(onDisk).toHaveLength(5)
    for (const p of made) expect((await store.getProgress(p.id)).profileId).toBe(p.id)
    expect(await filesIn(path.join(state.dir, 'progress'))).toEqual(made.map((p) => `${p.id}.json`).sort())
    // временные файлы не остаются
    expect((await filesIn(state.dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('create, rename, setClass и delete вперемешку не теряют друг друга', async () => {
    const store = await freshStore()
    const [a, b] = await Promise.all([store.createProfile('A'), store.createProfile('B')])
    await Promise.all([
      store.renameProfile(a.id, 'A2'),
      store.setProfileClass(b.id, 'Witch'),
      store.createProfile('C'),
      store.deleteProfile(a.id),
      store.createProfile('D')
    ])
    const list = await store.listProfiles()
    expect(list.map((p) => p.name).sort()).toEqual(['B', 'C', 'D'])
    expect(list.find((p) => p.id === b.id)?.className).toBe('Witch')
    expect(await filesIn(path.join(state.dir, 'progress'))).not.toContain(`${a.id}.json`)
  })

  it('список, запрошенный во время создания, ждёт его и видит новый профиль', async () => {
    const store = await freshStore()
    const creating = store.createProfile('Персонаж 1')
    const listed = store.listProfiles()
    const [made, list] = await Promise.all([creating, listed])
    expect(list.map((p) => p.id)).toEqual([made.id])
  })

  it('одновременные правки прогресса одного профиля не теряют друг друга', async () => {
    const store = await freshStore()
    const p = await store.createProfile('A')
    await Promise.all([
      store.setQuestDone(p.id, 'q1', true),
      store.setQuestsDone(p.id, ['q2', 'q3']),
      store.setLevel(p.id, 12),
      store.setAct(p.id, 2),
      store.setTrialDone(p.id, 't1', true),
      store.setRewardChoice(p.id, 'q1', 1)
    ])
    const prog = await store.getProgress(p.id)
    expect(Object.keys(prog.completedQuestIds).sort()).toEqual(['q1', 'q2', 'q3'])
    expect(Object.keys(prog.autoCompletedQuestIds).sort()).toEqual(['q2', 'q3'])
    expect(prog).toMatchObject({ level: 12, currentAct: 2, completedTrialIds: { t1: true }, rewardChoices: { q1: 1 } })
  })

  it('импорт во время создания — оба профиля на месте, у импортированного свой прогресс', async () => {
    const store = await freshStore()
    const bundle = {
      format: 'act-compass-profile',
      formatVersion: 3,
      profile: { name: 'Импорт' },
      progress: { currentAct: 3, level: 30, completedQuestIds: { q9: true } }
    }
    const [made, imported] = await Promise.all([store.createProfile('A'), store.importProfileBundle(bundle)])
    expect(imported).not.toBeNull()
    expect((await store.listProfiles()).map((p) => p.id).sort()).toEqual([made.id, imported!.id].sort())
    expect(await store.getProgress(imported!.id)).toMatchObject({ currentAct: 3, level: 30, completedQuestIds: { q9: true } })
    expect((await store.getProfileBundle(imported!.id))?.progress.level).toBe(30)
  })

  it('ошибка одной записи не ломает очередь: следующие вызовы проходят', async () => {
    const store = await freshStore()
    await fs.mkdir(state.dir, { recursive: true })
    // каталог на месте файла профилей — запись упадёт
    await fs.mkdir(path.join(state.dir, 'profiles.json'))
    await expect(store.createProfile('A')).rejects.toThrow()
    await fs.rm(path.join(state.dir, 'profiles.json'), { recursive: true })
    const b = await store.createProfile('B')
    expect((await store.listProfiles()).map((p) => p.id)).toEqual([b.id])
  })
})
