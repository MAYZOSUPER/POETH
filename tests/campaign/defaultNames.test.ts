import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { characterName, importedName, newCharacterName } from '@shared/defaultNames'
import { LevelingStore, normalizeLevelingFile } from '../../src/main/services/levelingStore'

// Имена новых персонажей (S42): на языке интерфейса — «Character 1» в EN, «Персонаж 1» в RU.
// Уже сохранённые имена не переименовываются.

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir, getVersion: () => '0.0.0-test' } }))

const DATA = path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json')

let root = ''
async function tmp(): Promise<string> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-names-'))
  return root
}
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
  root = ''
})

describe('defaultNames', () => {
  it('RU и EN; без языка — как раньше, по-русски', () => {
    expect(characterName('en', 1)).toBe('Character 1')
    expect(characterName('ru', 3)).toBe('Персонаж 3')
    expect(characterName(undefined, 1)).toBe('Персонаж 1')
    expect(newCharacterName('en')).toBe('New character')
    expect(newCharacterName('ru')).toBe('Новый персонаж')
    expect(importedName('en')).toBe('Imported')
    expect(importedName('ru')).toBe('Импортированный')
  })
})

describe('кампания PoE 2: profileStore', () => {
  async function store() {
    state.dir = path.join(await tmp(), 'userData')
    vi.resetModules()
    return import('../../src/main/services/profileStore')
  }

  it('пустое имя — на языке интерфейса; без языка — по-русски', async () => {
    const s = await store()
    expect((await s.createProfile('  ', undefined, 'en')).name).toBe('New character')
    expect((await s.createProfile('', undefined, 'ru')).name).toBe('Новый персонаж')
    expect((await s.createProfile('')).name).toBe('Новый персонаж')
    expect((await s.createProfile('Hero', undefined, 'en')).name).toBe('Hero')
  })

  it('импорт без имени — «Imported» в EN', async () => {
    const s = await store()
    const meta = await s.importProfileBundle({ format: 'act-compass-profile', profile: { name: '' }, progress: {} }, 'en')
    expect(meta?.name).toBe('Imported')
  })
})

describe('прокачка PoE 1: levelingStore', () => {
  it('первый персонаж нового файла — на языке интерфейса', () => {
    expect(normalizeLevelingFile(null, 0, 'en').profiles.map((p) => p.name)).toEqual(['Character 1'])
    expect(normalizeLevelingFile(null, 0, 'ru').profiles.map((p) => p.name)).toEqual(['Персонаж 1'])
    expect(normalizeLevelingFile(null, 0).profiles.map((p) => p.name)).toEqual(['Персонаж 1'])
  })

  it('сохранённые имена не переименовываются', () => {
    const raw = { profiles: [{ id: 'a', name: 'Персонаж 1', createdAt: 1, updatedAt: 1 }], activeId: 'a' }
    expect(normalizeLevelingFile(raw, 0, 'en').profiles.map((p) => p.name)).toEqual(['Персонаж 1'])
  })

  it('новый персонаж без имени — «Character N» в EN', async () => {
    const dir = await tmp()
    const s = new LevelingStore(path.join(dir, 'leveling.json'), DATA, () => 1000, () => 'en')
    const st = await s.createProfile('')
    expect(st.profiles.map((p) => p.name)).toEqual(['Character 1', 'Character 2'])
    const ru = new LevelingStore(path.join(dir, 'other.json'), DATA, () => 1000, async () => 'ru' as const)
    expect((await ru.createProfile('  ')).profiles.map((p) => p.name)).toEqual(['Персонаж 1', 'Персонаж 2'])
  })
})
