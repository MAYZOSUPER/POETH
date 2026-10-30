import { createHash, randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type {
  LootFilterConfirmReason,
  LootFilterError,
  LootFilterInstallRequest,
  LootFilterRelease
} from '@shared/types/lootFilter'
import { findTreeBlob, parseRelease, treeUrl, zipUrl, LATEST_RELEASE_URL } from '@shared/lootFilter/source'
import { pickFilterEntry } from '@shared/lootFilter/archive'
import { MAX_FILTER_BYTES, decideWrite, installedFileName, isOurFileName, looksLikeNeverSinkFilter } from '@shared/lootFilter/rules'
import { listZipEntries, readZipEntry } from './zip'
import type { InstalledRecord } from './store'

// Установка фильтра NeverSink в папку игры (S53) — без electron: сеть передаётся снаружи (fetch.ts), чтобы
// тесты гоняли весь путь на подменённом архиве и временной папке (tests/lootFilter/install.test.ts).
// Порядок: решить про запись ДО загрузки (чужое/изменённое — сразу вопрос игроку) → релиз → дерево тега →
// архив → ровно один .filter → сверка с деревом (git-SHA и размер) → «это фильтр NeverSink» → ещё раз решить
// про запись (файл могли поменять за время загрузки) → временный файл рядом → rename поверх своего файла.

export type Net = {
  json(url: string): Promise<{ ok: true; json: unknown } | { ok: false; error: LootFilterError }>
  zip(url: string): Promise<{ ok: true; body: Buffer } | { ok: false; error: LootFilterError }>
}

export type InstallOutcome =
  | { ok: true; release: LootFilterRelease; record: InstalledRecord }
  | { ok: false; error: LootFilterError; confirm?: LootFilterConfirmReason; release?: LootFilterRelease }

/** git-SHA-1 файла, как в git/trees: sha1("blob <размер>\0" + байты). */
export function gitBlobSha1(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Путь своего файла уровня в папке; имя — только installedFileName, и путь не выходит из папки. */
export function targetPath(dir: string, level: LootFilterInstallRequest['level']): string {
  const name = installedFileName(level)
  const root = path.resolve(dir)
  const full = path.resolve(root, name)
  const rel = path.relative(root, full)
  if (!isOurFileName(name) || rel !== name || path.isAbsolute(rel)) throw new Error('lootFilter: bad target')
  return full
}

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b)

/** Запись манифеста для этого файла в этой папке. */
export function recordFor(records: readonly InstalledRecord[], dir: string, file: string): InstalledRecord | null {
  return records.find((r) => r.file.toLowerCase() === file.toLowerCase() && samePath(r.dir, dir)) ?? null
}

export interface FileFacts {
  exists: boolean
  regularFile: boolean
  sha: string | null
  size: number
}

/** Что сейчас лежит по пути: lstat (ссылку не разыменовываем), SHA-256 — если файл не больше двух потолков. */
export async function fileFacts(file: string): Promise<FileFacts> {
  let st
  try {
    st = await fs.lstat(file)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, regularFile: false, sha: null, size: 0 }
    return { exists: true, regularFile: false, sha: null, size: 0 }
  }
  if (!st.isFile()) return { exists: true, regularFile: false, sha: null, size: st.size }
  if (st.size > MAX_FILTER_BYTES * 2) return { exists: true, regularFile: true, sha: null, size: st.size }
  try {
    return { exists: true, regularFile: true, sha: sha256(await fs.readFile(file)), size: st.size }
  } catch {
    return { exists: true, regularFile: true, sha: null, size: st.size }
  }
}

type Decision = { ok: true } | { ok: false; error: LootFilterError; confirm?: LootFilterConfirmReason }

async function decide(file: string, record: InstalledRecord | null, confirmed: boolean): Promise<Decision> {
  const f = await fileFacts(file)
  const d = decideWrite({ exists: f.exists, regularFile: f.regularFile, recordedSha: record?.sha256 ?? null, currentSha: f.sha, confirmed })
  if (d === 'create' || d === 'replace') return { ok: true }
  if (d === 'refuse') return { ok: false, error: 'refused' }
  return { ok: false, error: 'refused', confirm: d.confirm }
}

const RENAME_BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

/** Временный файл рядом (не .filter — игра его не покажет), fsync, rename поверх. Временный файл не остаётся. */
async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.poeth-tmp-${randomBytes(4).toString('hex')}`)
  try {
    const h = await fs.open(tmp, 'wx')
    try {
      await h.writeFile(bytes)
      await h.sync()
    } finally {
      await h.close()
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, file)
        return
      } catch (e) {
        if (!RENAME_BUSY.has((e as NodeJS.ErrnoException).code ?? '') || attempt >= 8) throw e
        await new Promise((r) => setTimeout(r, 25 + attempt * 25))
      }
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}

export interface InstallInput {
  req: LootFilterInstallRequest
  /** папка фильтров игры (существует) */
  dir: string
  records: readonly InstalledRecord[]
  net: Net
  now?: () => Date
}

export async function installFilter(input: InstallInput): Promise<InstallOutcome> {
  const { req, dir, net } = input
  let st
  try {
    st = await fs.stat(dir)
  } catch {
    st = null
  }
  if (!st?.isDirectory()) return { ok: false, error: 'no-folder' }

  const file = targetPath(dir, req.level)
  const name = path.basename(file)
  const record = recordFor(input.records, dir, name)
  const confirmed = req.confirm === true

  const before = await decide(file, record, confirmed)
  if (!before.ok) return before

  const rel = await net.json(LATEST_RELEASE_URL)
  if (!rel.ok) return rel
  const release = parseRelease(rel.json)
  if (!release) return { ok: false, error: 'bad-release' }

  const tree = await net.json(treeUrl(release.tag))
  if (!tree.ok) return { ok: false, error: tree.error, release }

  const zip = await net.zip(zipUrl(release.tag))
  if (!zip.ok) return { ok: false, error: zip.error, release }
  const buf = zip.body
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, error: 'bad-archive', release }

  let bytes: Buffer
  let repoPath: string
  try {
    const entries = listZipEntries(buf)
    const pick = pickFilterEntry(
      entries.map((e) => e.name),
      req.level,
      req.style
    )
    if (!pick.ok) return { ok: false, error: pick.error, release }
    const entry = entries.find((e) => e.name === pick.entry)
    if (!entry) return { ok: false, error: 'bad-archive', release }
    if (entry.size > MAX_FILTER_BYTES) return { ok: false, error: 'too-large', release }
    bytes = readZipEntry(buf, entry, MAX_FILTER_BYTES)
    repoPath = pick.repoPath
  } catch {
    return { ok: false, error: 'bad-archive', release }
  }

  const blob = findTreeBlob(tree.json, repoPath)
  if (!blob || blob.size !== bytes.length || blob.sha !== gitBlobSha1(bytes)) return { ok: false, error: 'verify-failed', release }
  if (!looksLikeNeverSinkFilter(bytes)) return { ok: false, error: 'not-filter', release }

  const after = await decide(file, record, confirmed)
  if (!after.ok) return { ...after, release }

  try {
    await writeAtomic(file, bytes)
  } catch {
    return { ok: false, error: 'write-failed', release }
  }

  return {
    ok: true,
    release,
    record: {
      file: name,
      level: req.level,
      style: req.style,
      tag: release.tag,
      sha256: sha256(bytes),
      size: bytes.length,
      installedAt: (input.now?.() ?? new Date()).toISOString(),
      dir: path.resolve(dir)
    }
  }
}

/** Манифест после установки: запись этого файла в этой папке заменена новой. */
export function withRecord(records: readonly InstalledRecord[], rec: InstalledRecord): InstalledRecord[] {
  return [...records.filter((r) => !(r.file.toLowerCase() === rec.file.toLowerCase() && samePath(r.dir, rec.dir))), rec]
}
