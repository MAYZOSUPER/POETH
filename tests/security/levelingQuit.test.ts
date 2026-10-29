import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LevelingStore } from '../../src/main/services/levelingStore'

// Прогресс гида прокачки на выходе (S29, по находке S32): before-quit пишет leveling.json синхронно —
// раньше асинхронная запись не успевала rename и прогресс оставался в leveling.json.tmp.

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-leveling-quit-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const tmpLeft = async (): Promise<string[]> => (await fs.readdir(dir)).filter((f) => f.includes('.tmp'))

describe('LevelingStore.flushSync — на выходе', () => {
  const DATA = path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json')

  it('изменение, ещё ждущее отложенной записи, сразу оказывается в leveling.json', async () => {
    const file = path.join(dir, 'leveling.json')
    const s = new LevelingStore(file, DATA, () => 1000)
    await s.load()
    await s.flush()
    const before = readFileSync(file, 'utf8')
    await s.createProfile('Выход')
    // отложенная запись (600 мс) ещё не прошла — как при закрытии приложения сразу после шага
    expect(readFileSync(file, 'utf8')).toBe(before)
    s.flushSync()
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { profiles: { name: string }[] }
    expect(saved.profiles.map((p) => p.name)).toContain('Выход')
    expect(await tmpLeft()).toEqual([])
  })
})

describe('смена игры — штатный выход', () => {
  it('relaunch + app.quit (before-quit сохраняет гид и фарм), нигде нет app.exit', () => {
    const src = readFileSync(path.join(__dirname, '../../src/main/ipc/app.ts'), 'utf8')
    const fn = src.slice(src.indexOf('async function switchGame'))
    const body = fn.slice(0, fn.indexOf('\n}')).replace(/\/\/.*$/gm, '')
    expect(body.indexOf('app.relaunch()')).toBeGreaterThan(0)
    expect(body.indexOf('app.quit()')).toBeGreaterThan(body.indexOf('app.relaunch()'))
    expect(body).not.toMatch(/app\.exit\(/)
  })
})

describe('ipc/leveling: before-quit — синхронная запись', () => {
  it('обработчик зовёт flushSync, а не асинхронный flush', () => {
    const src = readFileSync(path.join(__dirname, '../../src/main/ipc/leveling.ts'), 'utf8')
    expect(src).toContain("app.on('before-quit', () => store?.flushSync())")
    expect(src).not.toContain('void store?.flush()')
  })
})
