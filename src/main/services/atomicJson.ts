import { copyFileSync, fsyncSync, mkdirSync, openSync, closeSync, renameSync, rmSync, writeSync } from 'fs'
import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'

/**
 * Read JSON from `file`, falling back to a `.bak` sidecar if the primary file is
 * missing or corrupt, and finally to `fallback`.
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  for (const candidate of [file, `${file}.bak`]) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      // strip a UTF-8 BOM if an external editor added one
      return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as T
    } catch {
      // try the next candidate
    }
  }
  return fallback
}

/**
 * Временный файл — свой у каждой записи (S29): с общим `<файл>.tmp` две одновременные записи одного файла
 * делили его, и rename второй падал с ENOENT (гонка profiles:create, S32).
 */
function tmpName(file: string): string {
  return `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
}

/** Windows: пока соседняя запись переименовывает или копирует в .bak тот же файл, rename даёт EPERM/EBUSY. */
const RENAME_BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

async function renameRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      if (!RENAME_BUSY.has(code) || attempt >= 10) throw e
      await new Promise((r) => setTimeout(r, 10 + attempt * 10))
    }
  }
}

/**
 * Atomically write JSON: write a temp file, fsync it, back up the previous good
 * file, then rename over the target. Rename is atomic on the same NTFS volume,
 * so a crash mid-write can never leave a half-written file.
 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = tmpName(file)
  const json = JSON.stringify(data, null, 2)

  try {
    const handle = await fs.open(tmp, 'w')
    try {
      await handle.writeFile(json, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }

    // Preserve the previous good copy as a backup (best-effort).
    try {
      await fs.copyFile(file, `${file}.bak`)
    } catch {
      // no existing file yet — nothing to back up
    }

    await renameRetry(tmp, file)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

/**
 * То же синхронно — для `before-quit` (S29): асинхронная запись на выходе не успевала rename, и прогресс
 * оставался во временном файле.
 */
export function writeJsonAtomicSync(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = tmpName(file)
  try {
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, JSON.stringify(data, null, 2), null, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    try {
      copyFileSync(file, `${file}.bak`)
    } catch {
      // нечего сохранять в .bak
    }
    renameSync(tmp, file)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}
