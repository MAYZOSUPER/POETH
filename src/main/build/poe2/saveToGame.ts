import { promises as fs } from 'fs'
import path from 'path'
import type { Build2Dir, Build2SaveResult } from '@shared/types/build2'

// «Сохранить билд в игру» (S66): файл `.build` в папку игрового планировщика PoE 2 — только main, только по кнопке
// игрока и только после подтверждения с показом пути (решение пользователя 31.10). Без electron — tests/build2/
// saveToGame.test.ts пишет во временную папку.
//
//  - папка: POETH_POE2_BUILD_DIR (подмена для проверок и тестов) или Документы/My Games/Path of Exile 2/BuildPlanner
//    (документы — app.getPath('documents'), с учётом переноса в OneDrive); игра сама следит за ней (GGG, Build Planner);
//  - папки игры «Path of Exile 2» нет — не пишем (игра не запускалась на этом компьютере): создаём только
//    BuildPlanner внутри неё;
//  - первый вызов только отвечает «куда и есть ли уже такой файл»; второй — с confirm и тем же именем файла;
//  - существующий файл без явного «Заменить» не трогаем: новый создаётся флагом `wx` (атомарно «только если нет»),
//    замена — через временный файл и rename; ссылки (symlink) и не-файлы не заменяем;
//  - имя файла — только безопасные символы (buildFileName), путь не выходит из папки.

export const BUILD_DIR_ENV = 'POETH_POE2_BUILD_DIR'
/** имя файла после buildFileName: латиница, цифры, пробел и «._()-» */
const SAFE_NAME = /^[A-Za-z0-9 ._()-]{1,80}\.build$/

/** Папка игрового планировщика. */
export function buildPlannerDir(documents: string, env: Readonly<Record<string, string | undefined>>, gameDirExists: (p: string) => boolean): Build2Dir {
  const override = env[BUILD_DIR_ENV]
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

export interface SaveArgs {
  dir: Build2Dir
  fileName: string
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
  if (!SAFE_NAME.test(a.fileName) || path.basename(a.fileName) !== a.fileName) return { ok: false, error: 'io' }
  if (!dir.game) return { ok: false, error: 'no-game-dir', dir }
  const root = path.resolve(dir.path)
  const target = path.join(root, a.fileName)
  if (path.dirname(target) !== root) return { ok: false, error: 'io' }
  const kind = await kindOf(target)
  if (!a.confirm) return { ok: false, error: 'confirm', dir, fileName: a.fileName, exists: kind !== 'none' }
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
  return { ok: true, path: target, fileName: a.fileName, replaced: kind === 'file' }
}
