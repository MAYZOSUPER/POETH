import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// id профиля кампании приходит из renderer и становится именем файла progress/<id>.json (S29):
// «..\\settings» или «../../x» не должны удалить или записать файл вне папки progress.

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir, getVersion: () => '0.0.0-test' } }))

type Store = typeof import('../../src/main/services/profileStore')

let root = ''
let store: Store

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-profile-id-'))
  state.dir = path.join(root, 'userData')
  await fs.mkdir(state.dir, { recursive: true })
  await fs.writeFile(path.join(state.dir, 'settings.json'), '{"keep":true}')
  vi.resetModules()
  store = await import('../../src/main/services/profileStore')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const BAD = ['..\\settings', '../settings', '..', '../../outside', 'C:\\Windows\\x', 'a/b', '', 'x'.repeat(65), 'имя']

describe('profileStore: id профиля без путей', () => {
  it.each(BAD)('deleteProfile(%j) — отказ, settings.json цел', async (id) => {
    await expect(store.deleteProfile(id)).rejects.toThrow(/bad id/)
    expect(await fs.readFile(path.join(state.dir, 'settings.json'), 'utf8')).toBe('{"keep":true}')
  })

  it.each(BAD)('setQuestDone/getProgress(%j) — отказ, вне progress ничего не появляется', async (id) => {
    await expect(store.setQuestDone(id, 'q1', true)).rejects.toThrow(/bad id/)
    await expect(store.getProgress(id)).rejects.toThrow(/bad id/)
    expect((await fs.readdir(root)).sort()).toEqual(['userData'])
    expect((await fs.readdir(state.dir)).sort()).toEqual(['settings.json'])
  })

  it('обычный профиль (randomUUID) работает как раньше', async () => {
    const meta = await store.createProfile('Тест')
    const p = await store.setQuestDone(meta.id, 'q1', true)
    expect(p.completedQuestIds.q1).toBe(true)
    expect(await store.deleteProfile(meta.id)).toEqual([])
  })
})
