import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { DataManifest } from '@shared/types'

// Обновление данных без переустановки (S10a) — ядро без electron (tests/updates/dataUpdate.test.ts).
//
// userData/data/<game>/ — «надстройка» над встроенными resources/data/<game>/: протокол
// poeth://data и загрузчики сначала ищут файл здесь. По манифесту собираем новую надстройку
// во временной папке: файл, совпадающий со встроенным, не нужен (берётся из комплекта);
// уже скачанный с тем же sha256 — копируется; остальное — качается и проверяется (размер,
// sha256). Затем атомарная подмена папок: старая → .backup, новая → на её место, бэкап
// удаляется. Любая ошибка до подмены — временная папка удаляется, данные не тронуты;
// сбой самой подмены — бэкап возвращается на место. В надстройку кладётся manifest.json —
// какая версия применена.

export interface ApplyDeps {
  /** userData/data */
  root: string
  /** встроенные данные игры: resources/data/<game> */
  bundledDir: string
  /** скачать файл пакета по относительному пути из манифеста */
  fetchFile: (relPath: string) => Promise<Buffer>
  now?: () => number
  /** для тестов — подменить rename (сбой при подмене папок) */
  rename?: (from: string, to: string) => Promise<void>
}

export type ApplyResult =
  | { status: 'applied'; changed: number; downloaded: number }
  | { status: 'unchanged' }
  | { status: 'failed'; error: string }

export const APPLIED_MANIFEST = 'manifest.json'

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function fileSha(p: string): Promise<string | null> {
  try {
    return sha256(await fs.readFile(p))
  } catch {
    return null
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Какой пакет данных применён (manifest.json в надстройке), null — только встроенные. */
export async function readAppliedManifest(root: string, game: string): Promise<DataManifest | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(root, game, APPLIED_MANIFEST), 'utf8')) as DataManifest
    return raw && typeof raw.version === 'string' && raw.files ? raw : null
  } catch {
    return null
  }
}

/**
 * Уборка после аварии (выключили ПК посреди подмены): если папки игры нет, а бэкап есть —
 * вернуть бэкап; остальные .staging/.backup этой игры — удалить.
 */
export async function recoverDataDir(root: string, game: string): Promise<void> {
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch {
    return
  }
  const target = path.join(root, game)
  const backups = names.filter((n) => n.startsWith(`.backup-${game}-`)).sort()
  if (!(await exists(target)) && backups.length > 0) {
    const last = backups.pop() as string
    await fs.rename(path.join(root, last), target)
  }
  for (const n of [...backups, ...names.filter((x) => x.startsWith(`.staging-${game}-`))]) {
    await fs.rm(path.join(root, n), { recursive: true, force: true })
  }
}

function sameFiles(a: DataManifest['files'], b: DataManifest['files']): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] && b[k].sha256 === a[k].sha256)
}

/** Применить пакет данных атомарно (см. шапку файла). */
export async function applyDataUpdate(manifest: DataManifest, deps: ApplyDeps): Promise<ApplyResult> {
  const { root, bundledDir, fetchFile } = deps
  const rename = deps.rename ?? ((a: string, b: string) => fs.rename(a, b))
  const game = manifest.game
  const target = path.join(root, game)

  await fs.mkdir(root, { recursive: true })
  await recoverDataDir(root, game)

  const applied = await readAppliedManifest(root, game)
  if (applied && applied.version === manifest.version && sameFiles(applied.files, manifest.files)) {
    return { status: 'unchanged' }
  }

  const stamp = String((deps.now ?? Date.now)())
  const staging = path.join(root, `.staging-${game}-${stamp}`)
  const backup = path.join(root, `.backup-${game}-${stamp}`)
  let changed = 0
  let downloaded = 0
  try {
    await fs.mkdir(staging, { recursive: true })
    for (const [rel, f] of Object.entries(manifest.files)) {
      if ((await fileSha(path.join(bundledDir, rel))) === f.sha256) continue // такой же, как в комплекте
      changed++
      const dest = path.join(staging, rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      const current = path.join(target, rel)
      if ((await fileSha(current)) === f.sha256) {
        await fs.copyFile(current, dest)
        continue
      }
      const buf = await fetchFile(rel)
      if (buf.length !== f.size) throw new Error(`size mismatch: ${rel} (${buf.length} ≠ ${f.size})`)
      if (sha256(buf) !== f.sha256) throw new Error(`sha256 mismatch: ${rel}`)
      await fs.writeFile(dest, buf)
      downloaded++
    }
    // ничего не отличается от комплекта и надстройки не было — делать нечего
    if (changed === 0 && !(await exists(target))) {
      await fs.rm(staging, { recursive: true, force: true })
      return { status: 'unchanged' }
    }
    await fs.writeFile(path.join(staging, APPLIED_MANIFEST), JSON.stringify(manifest, null, 2))

    const hadTarget = await exists(target)
    if (hadTarget) await rename(target, backup)
    try {
      await rename(staging, target)
    } catch (e) {
      if (hadTarget) await rename(backup, target) // откат: прежние данные на место
      throw e
    }
    if (hadTarget) await fs.rm(backup, { recursive: true, force: true })
    return { status: 'applied', changed, downloaded }
  } catch (e) {
    await fs.rm(staging, { recursive: true, force: true })
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
}

/** Откат к встроенным данным: удалить надстройку игры целиком. */
export async function resetDataOverride(root: string, game: string): Promise<void> {
  await fs.rm(path.join(root, game), { recursive: true, force: true })
}
