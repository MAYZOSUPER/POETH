import { execFile } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterAll, describe, expect, it } from 'vitest'
import { validateRumoursFile } from '@shared/rumours/schema'
import { ROOT, bundledRaw } from './fixtures'

// Генератор tools/rumours/extract.mjs (S65): --check для CI и слияние строк игры с нашей оценкой.
// Сеть в тестах не нужна: --from-game — выгрузка из прошлого запуска.

const TOOL = join(ROOT, 'tools/rumours/extract.mjs')
const GAME = join(ROOT, 'tests/fixtures/rumours/game-mini.json')
const run = promisify(execFile)
const tool = (...args: string[]) => run(process.execPath, [TOOL, ...args], { cwd: ROOT })
const fail = async (...args: string[]): Promise<string> => {
  try {
    await tool(...args)
    return 'ok'
  } catch (e) {
    return String((e as { stderr?: string }).stderr)
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'poeth-rumours-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('extract --check', () => {
  it('встроенный файл проходит строгую проверку', async () => {
    const { stdout } = await tool('--check', '--strict')
    expect(stdout).toContain('ок — слухов 20 (экспедиций 11, уникальных карт 4, боссов 5), патч 0.5.5.5')
  }, 60_000)

  it('награда мимо данных EE2 и лишнее поле — ошибки', async () => {
    const raw = bundledRaw() as { rumours: Record<string, unknown>[] }
    raw.rumours[0].rewards = [{ item: { ns: 'ITEM', ref: 'Made Up Orb', meta: null, name: { en: 'Made Up Orb', ru: null } } }]
    raw.rumours[1].community = 'S+'
    const f = join(tmp, 'bad.json')
    writeFileSync(f, JSON.stringify(raw))
    const err = await fail('--check', '--file', f)
    expect(err).toContain('награды ITEM:Made Up Orb нет в данных EE2')
    expect(err).toContain('лишнее поле almost-paradise.community')
  }, 60_000)

  it('без --strict нет оценки — только предупреждение; со --strict — ошибка', async () => {
    const raw = bundledRaw() as { rumours: Record<string, unknown>[] }
    raw.rumours[0].tier = null
    const f = join(tmp, 'notier.json')
    writeFileSync(f, JSON.stringify(raw))
    const { stdout } = await tool('--check', '--file', f)
    expect(stdout).toContain('предупреждение: all-that-glitters: нет нашего тира')
    expect(await fail('--check', '--strict', '--file', f)).toContain('ошибка: all-that-glitters: нет нашего тира')
  }, 60_000)
})

describe('пересборка из строк игры', () => {
  it('строка поменялась — оценка осталась; новый остров — без оценки; пропавший — ушёл', async () => {
    const out = join(tmp, 'merged.json')
    const { stdout } = await tool('--from-game', GAME, '--out', out, '--today', '2026-12-11')
    expect(stdout).toContain('новые слухи (нужна наша оценка):')
    expect(stdout).toContain('brand-new-isle — Brand new isle... → New Isle')
    expect(stdout).toContain('пропали из игры:')
    expect(stdout).toContain('sulphite — Sulphite!')
    expect(stdout).toContain('fallen-stars.text:')
    expect(stdout).toContain('нет RU-строки — записать с RU-клиента:')

    const v = validateRumoursFile(JSON.parse(readFileSync(out, 'utf8')))
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const file = v.value.file
    expect(file.patch).toBe('0.6.0.1')
    expect(file.updatedAt).toBe('2026-12-11')
    expect(file.rumours.map((r) => r.id)).toEqual(['fallen-stars', 'brand-new-isle'])
    const fs = file.rumours[0]
    expect(fs.text.ru).toBe('Падшие звёзды...')
    expect(fs.tier).toBe(3)
    expect(fs.note?.ru).toBeTruthy()
    expect(file.rumours[1]).toMatchObject({ tier: null, rewards: [], text: { en: 'Brand new isle...', ru: null } })
  }, 60_000)
})
