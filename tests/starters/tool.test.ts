import { execFile } from 'child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { promisify } from 'util'
import { afterAll, describe, expect, it } from 'vitest'
import { validateStartersFile } from '@shared/starters/schema'
import { FIX, POB_FIX } from './fixtures'

// Инструмент лида tools/starters/add-starter.mjs (S59): --check (CI) и запись стартера тем же валидатором.
// Сеть в тестах не нужна: --pob-file вместо загрузки по ссылке.

const ROOT = resolve(__dirname, '../..')
const TOOL = join(ROOT, 'tools/starters/add-starter.mjs')
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

describe('add-starter --check', () => {
  it('встроенный список в resources проходит', async () => {
    const { stdout } = await tool('--check')
    expect(stdout).toContain('ок — текущая лига 3.30')
  }, 60_000)

  it('хороший список: ок, все лиги из индекса', async () => {
    const { stdout } = await tool('--check', '--dir', join(FIX, 'good'))
    expect(stdout).toContain('3.30.json: стартеров — 4')
    expect(stdout).toContain('3.29.json: стартеров — 1')
  }, 60_000)

  it('плохая ссылка и лишнее поле — отказ с понятной причиной', async () => {
    const err = await fail('--check', '--dir', join(FIX, 'bad'))
    expect(err).toContain('links.guide: только https')
    expect(err).toContain('неизвестное поле test-hiero-brand.rating')
    expect(err).toContain('не прошёл проверку (2)')
  }, 60_000)

  it('файл не из индекса и пропавший файл лиги — отказ', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'poeth-starters-check-'))
    try {
      cpSync(join(FIX, 'good'), tmp, { recursive: true })
      writeFileSync(join(tmp, '3.28.json'), readFileSync(join(FIX, 'good', '3.29.json'), 'utf8').replace(/3\.29/g, '3.28'))
      rmSync(join(tmp, '3.29.json'))
      const err = await fail('--check', '--dir', tmp)
      expect(err).toContain('3.29.json: нет файла')
      expect(err).toContain('3.28.json: файл не указан в index.json')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60_000)

  it('note только на одном языке — отказ (наш текст — RU и EN)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'poeth-starters-check-'))
    try {
      cpSync(join(FIX, 'good'), tmp, { recursive: true })
      const raw = JSON.parse(readFileSync(join(tmp, '3.30.json'), 'utf8'))
      delete raw.starters[1].note.en
      writeFileSync(join(tmp, '3.30.json'), JSON.stringify(raw))
      expect(await fail('--check', '--dir', tmp)).toContain('нужны обе строки')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('add-starter: запись стартера', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'poeth-starters-add-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))
  const base = [
    'https://pobb.in/FakeStarterNew1',
    '--dir',
    tmp,
    '--pob-file',
    join(POB_FIX, 'pobbin-acts-all-axes.txt'),
    '--author',
    'Test Nick',
    '--lang',
    'en',
    '--budget',
    'low',
    '--difficulty',
    '1',
    '--today',
    '2026-11-12',
    '--league',
    '3.30'
  ]

  it('PoB → запись: класс, навык, версия игры, отпечаток и «ведёт по актам» — из PoB; индекс создан', async () => {
    const { stdout } = await tool(...base, '--newbie', '--pick', '--note-ru', 'Наша строка для теста', '--note-en', 'Our test line', '--video', 'https://youtu.be/FakeNew01', '--checked')
    expect(stdout).toContain('записан champion-boneshatter-of-carnage')
    expect(stdout).toContain('этапов прокачки в PoB: 10')
    expect(stdout).toContain('«Устарел»') // PoB под 3.26
    const raw = JSON.parse(readFileSync(join(tmp, '3.30.json'), 'utf8'))
    const v = validateStartersFile(raw, '3.30')
    expect(v.ok && v.value.failed).toEqual([])
    expect(raw.starters[0]).toMatchObject({
      id: 'champion-boneshatter-of-carnage',
      patch: '3.26',
      class: 'Duelist',
      ascendancy: 'Champion',
      skill: { en: 'Boneshatter of Carnage', gem: 'Metadata/Items/Gems/SkillGemBoneshatterAltY' },
      links: { pob: 'https://pobb.in/FakeStarterNew1', video: 'https://youtu.be/FakeNew01' },
      tags: { budget: 'low', difficulty: 1, newbie: true, leveling: 'acts', modes: [], content: [] },
      pick: true,
      pob: { sha256: '7939c644e9b58fc594a2cd11316a600c3e01b074be6268effd977de5e8e88ec8', checkedAt: '2026-11-12' },
      checked: { league: '3.30', date: '2026-11-12' },
      added: '2026-11-12'
    })
    expect(JSON.parse(readFileSync(join(tmp, 'index.json'), 'utf8'))).toEqual({ schema: 1, current: '3.30', leagues: ['3.30'] })
  }, 60_000)

  it('тот же id второй раз — только с --replace (дата добавления сохраняется)', async () => {
    expect(await fail(...base)).toContain('уже есть')
    await tool(...base, '--replace', '--today', '2026-11-14', '--leveling', 'partial')
    const raw = JSON.parse(readFileSync(join(tmp, '3.30.json'), 'utf8'))
    expect(raw.starters).toHaveLength(1)
    expect(raw.starters[0]).toMatchObject({ added: '2026-11-12', pob: { checkedAt: '2026-11-14' }, tags: { leveling: 'partial' }, checked: null, pick: false })
  }, 60_000)

  it('отказы: не паста PoB, чужой хост, «Рекомендуем» без причины, адрес в строке', async () => {
    const args = base.slice(1)
    expect(await fail('https://maxroll.gg/poe/build-guides/x', ...args, '--id', 'x-one')).toContain('не ссылка на пасту')
    expect(await fail('https://pastebin.com/abcdefgh', ...args, '--id', 'x-two')).toContain('сайты авторов')
    expect(await fail(...base, '--id', 'x-dup')).toContain('уже в списке под id champion-boneshatter-of-carnage')
    expect(await fail('https://pobb.in/FakeStarterX3', ...args, '--id', 'x-three', '--pick')).toContain('pick')
    expect(await fail('https://pobb.in/FakeStarterX4', ...args, '--id', 'x-four', '--note-ru', 'см. https://evil.example', '--note-en', 'x')).toContain('адрес')
    expect(await fail('https://pobb.in/FakeStarterX5', ...args, '--id', 'x-five', '--budget', 'free')).toContain('tags.budget')
  }, 60_000)
})
