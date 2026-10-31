import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILD_DIR_ENV, buildPlannerDir, freeFileName, saveBuildFile } from '../../src/main/build/poe2/saveToGame'
import { FILE_NAME_MAX, buildFileName, copyBuildName, isReservedName, nextFreeName } from '@shared/poe2/build/fileName'
import { serializeGameBuild, toGameBuild, defaultBuildName } from '@shared/poe2/build/gameBuild'
import { resolveStages2 } from '@shared/poe2/build/stages'
import type { Build2Dir } from '@shared/types/build2'
import { gems, pob2, tree } from './helpers'

// «Сохранить билд в игру» (S66): запись `.build` во временную папку — только после подтверждения с показом пути,
// существующий файл без «Заменить» не трогаем, имя файла — безопасное. Настоящую папку игры тест не трогает.

let root: string
let dir: Build2Dir

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'poeth-s66-'))
  dir = { path: join(root, 'My Games', 'Path of Exile 2', 'BuildPlanner'), game: true }
  mkdirSync(join(root, 'My Games', 'Path of Exile 2'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const text = (): string => {
  const b = pob2('leveling-amazon')
  return serializeGameBuild(toGameBuild(b, resolveStages2(b, tree), tree, gems, { name: defaultBuildName(b, tree, gems, 'ru'), lang: 'ru' }).file)
}

describe('запись .build с подтверждением', () => {
  it('без подтверждения — только «куда»; с подтверждением — файл в папке BuildPlanner', async () => {
    const fileName = buildFileName('Амазонка — Внезапный удар')
    expect(fileName).toBe('Amazonka - Vnezapnyy udar.build')
    const ask = await saveBuildFile({ name: 'N', dir, fileName, text: text() })
    expect(ask).toEqual({ ok: false, error: 'confirm', dir, fileName, name: 'N', exists: false })
    // папку ещё не создали и ничего не записали
    expect(readdirSync(join(root, 'My Games', 'Path of Exile 2'))).toEqual([])
    const done = await saveBuildFile({ name: 'N', dir, fileName, text: text(), confirm: true, confirmedName: fileName })
    expect(done).toEqual({ ok: true, path: join(dir.path, fileName), fileName, name: 'N', replaced: false })
    const saved = JSON.parse(readFileSync(join(dir.path, fileName), 'utf8'))
    expect(saved.name).toBe('Амазонка — Внезапный удар')
    expect(saved.ascendancy).toBe('Huntress1')
    expect(readdirSync(dir.path)).toEqual([fileName])
  })

  it('файл уже есть: без «Заменить» не трогаем; с заменой — атомарно, без временных файлов', async () => {
    const fileName = 'Build.build'
    mkdirSync(dir.path, { recursive: true })
    writeFileSync(join(dir.path, fileName), 'old')
    expect(await saveBuildFile({ name: 'N', dir, fileName, text: 'new' })).toMatchObject({ error: 'confirm', exists: true })
    expect(await saveBuildFile({ name: 'N', dir, fileName, text: 'new', confirm: true, confirmedName: fileName })).toMatchObject({ ok: false, error: 'exists' })
    expect(readFileSync(join(dir.path, fileName), 'utf8')).toBe('old')
    const r = await saveBuildFile({ name: 'N', dir, fileName, text: 'new', confirm: true, confirmedName: fileName, overwrite: true })
    expect(r).toMatchObject({ ok: true, replaced: true })
    expect(readFileSync(join(dir.path, fileName), 'utf8')).toBe('new')
    expect(readdirSync(dir.path)).toEqual([fileName])
  })

  it('имя изменилось после подтверждения — спросить снова; плохое имя и выход из папки — отказ', async () => {
    expect(await saveBuildFile({ name: 'N', dir, fileName: 'A.build', text: 'x', confirm: true, confirmedName: 'B.build' })).toMatchObject({ error: 'changed' })
    expect(await saveBuildFile({ name: 'N', dir, fileName: 'A.build', text: 'x', confirm: true })).toMatchObject({ error: 'changed' })
    // и имена устройств Windows — с расширением тоже (CON.build, nul.x.build, COM1 .build)
    for (const bad of ['../x.build', 'a/b.build', 'C:\\x.build', 'x.txt', 'пример.build', '.build', 'CON.build', 'nul.x.build', 'COM1 .build', 'lpt0.build']) {
      expect(await saveBuildFile({ name: 'N', dir, fileName: bad, text: 'x', confirm: true, confirmedName: bad }), bad).toEqual({ ok: false, error: 'io' })
    }
    expect(readdirSync(join(root, 'My Games', 'Path of Exile 2'))).toEqual([])
  })

  it('папки игры нет — не пишем', async () => {
    const none: Build2Dir = { path: join(root, 'nope', 'BuildPlanner'), game: false }
    expect(await saveBuildFile({ name: 'N', dir: none, fileName: 'A.build', text: 'x', confirm: true, confirmedName: 'A.build' })).toEqual({ ok: false, error: 'no-game-dir', dir: none })
  })

  it('на месте файла — папка или ссылка: не заменяем', async () => {
    mkdirSync(join(dir.path, 'A.build'), { recursive: true })
    expect(await saveBuildFile({ name: 'N', dir, fileName: 'A.build', text: 'x', confirm: true, confirmedName: 'A.build', overwrite: true })).toMatchObject({ error: 'io' })
    try {
      writeFileSync(join(root, 'target.txt'), 'keep')
      symlinkSync(join(root, 'target.txt'), join(dir.path, 'L.build'))
    } catch {
      return // нет прав на symlink в Windows без режима разработчика — проверка папки выше достаточна
    }
    expect(await saveBuildFile({ name: 'N', dir, fileName: 'L.build', text: 'x', confirm: true, confirmedName: 'L.build', overwrite: true })).toMatchObject({ error: 'io' })
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('keep')
  })
})

describe('папка игрового планировщика', () => {
  it('Документы/My Games/Path of Exile 2/BuildPlanner; подмена для проверок — POETH_POE2_BUILD_DIR, только не в сборке', () => {
    const docs = join(root, 'Docs')
    const planner = join(docs, 'My Games', 'Path of Exile 2', 'BuildPlanner')
    expect(buildPlannerDir(docs, {}, () => false)).toEqual({ path: planner, game: false })
    expect(buildPlannerDir(docs, {}, (p) => p === join(docs, 'My Games', 'Path of Exile 2'))).toMatchObject({ game: true })
    // собранное приложение (app.isPackaged): переменная окружения папку не меняет
    expect(buildPlannerDir(docs, { [BUILD_DIR_ENV]: join(root, 'tmp') }, () => false)).toEqual({ path: planner, game: false })
    expect(buildPlannerDir(docs, { [BUILD_DIR_ENV]: join(root, 'tmp') }, () => false, false).path).toBe(planner)
    // разработка и тесты
    expect(buildPlannerDir(docs, { [BUILD_DIR_ENV]: join(root, 'tmp') }, () => false, true)).toEqual({ path: join(root, 'tmp'), game: true })
    // относительный путь в переменной не принимаем
    expect(buildPlannerDir(docs, { [BUILD_DIR_ENV]: 'rel/dir' }, () => false, true).path).toBe(planner)
  })
})

describe('имя файла', () => {
  it.each([
    ['Amazon — Flicker Strike', 'Amazon - Flicker Strike.build'],
    ['Ткач бурь — Комета', 'Tkach bur - Kometa.build'],
    ['Щит/меч: «лучший»?', 'Shchit mech luchshiy.build'],
    ['   ', 'PoE2 build.build'],
    ['CON', 'PoE2 CON.build'],
    ['con.x', 'PoE2 con.x.build'],
    ['NUL .txt', 'PoE2 NUL .txt.build'],
    ['com1', 'PoE2 com1.build'],
    ['Console', 'Console.build'],
    ['..\\..\\evil', 'evil.build'],
    ['a'.repeat(100), `${'a'.repeat(60)}.build`]
  ])('%s', (name, file) => {
    expect(buildFileName(name)).toBe(file)
  })

  it('имена устройств Windows — и с расширением', () => {
    for (const n of ['CON', 'con.build', 'Nul.x.build', 'COM1 .build', 'lpt9', 'aux.']) expect(isReservedName(n), n).toBe(true)
    for (const n of ['Console.build', 'connect', 'com10.build', 'PoE2 CON.build']) expect(isReservedName(n), n).toBe(false)
  })

  it('«копией»: следующее свободное имя; суффикс помещается и у длинного кириллического названия', () => {
    const taken = new Set(['A.build', 'A (2).build'])
    expect(nextFreeName('A.build', (n) => taken.has(n))).toEqual({ fileName: 'A (3).build', n: 3 })
    expect(nextFreeName('B.build', (n) => taken.has(n))).toEqual({ fileName: 'B.build', n: 1 })
    // транслит удлиняет: «щ» → «shch»; имя упирается в предел FILE_NAME_MAX
    const long = buildFileName('Щедрый щитоносец — '.repeat(5))
    expect(long.length - '.build'.length).toBe(FILE_NAME_MAX)
    const copy = nextFreeName(long, (n) => n === long)
    expect(copy?.n).toBe(2)
    expect(copy?.fileName).toMatch(/ \(2\)\.build$/)
    expect(copy!.fileName.length - '.build'.length).toBeLessThanOrEqual(FILE_NAME_MAX)
    // все 99 заняты — свободного нет
    expect(nextFreeName('A.build', () => true)).toBeNull()
  })

  it('название копии в игре — с «(N)», не длиннее 80', () => {
    expect(copyBuildName('Амазонка', 1)).toBe('Амазонка')
    expect(copyBuildName('Амазонка', 2)).toBe('Амазонка (2)')
    const c = copyBuildName('я'.repeat(80), 12)
    expect(c).toHaveLength(80)
    expect(c.endsWith(' (12)')).toBe(true)
  })

  it('свободное имя по папке: регистр не важен (Windows), папки нет — имя свободно', async () => {
    mkdirSync(dir.path, { recursive: true })
    writeFileSync(join(dir.path, 'A.build'), 'x')
    writeFileSync(join(dir.path, 'a (2).BUILD'), 'x')
    expect(await freeFileName(dir, 'A.build')).toEqual({ fileName: 'A (3).build', n: 3 })
    expect(await freeFileName({ path: join(root, 'none'), game: true }, 'A.build')).toEqual({ fileName: 'A.build', n: 1 })
  })
})
