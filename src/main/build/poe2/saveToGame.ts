import { promises as fs } from 'fs'
import path from 'path'
import { isReservedName, nextFreeName } from '@shared/poe2/build/fileName'
import type { Build2Dir, Build2SaveResult } from '@shared/types/build2'

// «Сохранить билд в игру» (S66): файл `.build` в папку игрового планировщика PoE 2 — только main, только по кнопке
// игрока и только после подтверждения с показом пути (решение пользователя 31.10). Без electron — tests/build2/
// saveToGame.test.ts пишет во временную папку.
//
//  - папка: Документы/My Games/Path of Exile 2/BuildPlanner (документы — app.getPath('documents'), с учётом переноса
//    в OneDrive); игра сама следит за ней (GGG, Build Planner). Подмена POETH_POE2_BUILD_DIR — только для проверок и
//    тестов, в собранном приложении (app.isPackaged) не действует;
//  - папки игры «Path of Exile 2» нет — не пишем (игра не запускалась на этом компьютере): создаём только
//    BuildPlanner внутри неё;
//  - первый вызов только отвечает «куда и есть ли уже такой файл»; второй — с confirm и тем же именем файла;
//  - существующий файл без явного «Заменить» не трогаем: новый создаётся флагом `wx` (атомарно «только если нет»),
//    замена — через временный файл и rename; ссылки (symlink) и не-файлы не заменяем;
//  - имя файла — только безопасные символы (buildFileName), не имя устройства Windows (CON, NUL.x…), путь не выходит
//    из папки; «Сохранить копией» — первое свободное «Имя (N).build» по содержимому папки (freeFileName).

export const BUILD_DIR_ENV = 'POETH_POE2_BUILD_DIR'
/** имя файла после buildFileName: латиница, цифры, пробел и «._()-» */
const SAFE_NAME = /^[A-Za-z0-9 ._()-]{1,80}\.build$/

/**
 * Папка игрового планировщика. `allowOverride` — разрешить подмену POETH_POE2_BUILD_DIR (только не собранное
 * приложение: `!app.isPackaged`), иначе переменная окружения не может увести запись в чужую папку.
 */
export function buildPlannerDir(
  documents: string,
  env: Readonly<Record<string, string | undefined>>,
  gameDirExists: (p: string) => boolean,
  allowOverride = false
): Build2Dir {
  const override = allowOverride ? env[BUILD_DIR_ENV] : undefined
  if (override && path.isAbsolute(override)) return { path: path.resolve(override), game: true }
  const game = path.join(documents, 'My Games', 'Path of Exile 2')
  return { path: path.join(game, 'BuildPlanner'), game: gameDirExists(game) }
}

type Kind = 'none' | 'file' | 'other'

async function kindOf(p: string): Promise<Kind> {
  try {
    const st = await fs.lstat(p)
    return st.isFile() ? 'file' : 'other'
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'none'
    return 'other'
  }
}

/**
 * «Сохранить копией»: первое свободное имя в папке (само имя или «Имя (N).build»; на Windows регистр не важен).
 * Папки ещё нет — имя свободно. null — свободного нет (99 копий).
 */
export async function freeFileName(dir: Build2Dir, fileName: string): Promise<{ fileName: string; n: number } | null> {
  let names: string[] = []
  try {
    names = await fs.readdir(path.resolve(dir.path))
  } catch {
    // папки нет — всё свободно
  }
  const taken = new Set(names.map((n) => n.toLowerCase()))
  return nextFreeName(fileName, (n) => taken.has(n.toLowerCase()))
}

export interface SaveArgs {
  dir: Build2Dir
  fileName: string
  /** название билда в игре (поле `name` в файле) — для ответа окну */
  name: string
  /** текст файла (serializeGameBuild) */
  text: string
  confirm?: boolean
  /** имя файла, которое видел игрок при подтверждении */
  confirmedName?: string
  overwrite?: boolean
}

/** Записать файл `.build` (или ответить, куда запишем, — без confirm). */
export async function saveBuildFile(a: SaveArgs): Promise<Build2SaveResult> {
  const dir = a.dir
  if (!SAFE_NAME.test(a.fileName) || isReservedName(a.fileName) || path.basename(a.fileName) !== a.fileName) return { ok: false, error: 'io' }
  if (!dir.game) return { ok: false, error: 'no-game-dir', dir }
  const root = path.resolve(dir.path)
  const target = path.join(root, a.fileName)
  if (path.dirname(target) !== root) return { ok: false, error: 'io' }
  const kind = await kindOf(target)
  if (!a.confirm) return { ok: false, error: 'confirm', dir, fileName: a.fileName, name: a.name, exists: kind !== 'none' }
  if (a.confirmedName !== a.fileName) return { ok: false, error: 'changed', dir, fileName: a.fileName }
  if (kind !== 'none' && !a.overwrite) return { ok: false, error: 'exists', dir, fileName: a.fileName }
  if (kind === 'other') return { ok: false, error: 'io', dir, fileName: a.fileName }
  try {
    await fs.mkdir(root, { recursive: true })
    if (kind === 'none') {
      await fs.writeFile(target, a.text, { encoding: 'utf8', flag: 'wx' })
    } else {
      const tmp = path.join(root, `.${a.fileName}.poeth-tmp`)
      await fs.writeFile(tmp, a.text, { encoding: 'utf8', flag: 'w' })
      await fs.rename(tmp, target)
    }
  } catch (e) {
    // файл появился между вопросом и записью — тоже «уже есть», ничего не тронули
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return { ok: false, error: 'exists', dir, fileName: a.fileName }
    console.warn('[build2] cannot write .build:', (e as NodeJS.ErrnoException).code ?? 'error')
    return { ok: false, error: 'io', dir, fileName: a.fileName }
  }
  return { ok: true, path: target, fileName: a.fileName, name: a.name, replaced: kind === 'file' }
}
