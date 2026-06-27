import { promises as fs } from 'fs'
import path from 'path'

/**
 * Read JSON from `file`, falling back to a `.bak` sidecar if the primary file is
 * missing or corrupt, and finally to `fallback`.
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  for (const candidate of [file, `${file}.bak`]) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      return JSON.parse(raw) as T
    } catch {
      // try the next candidate
    }
  }
  return fallback
}

/**
 * Atomically write JSON: write a temp file, fsync it, back up the previous good
 * file, then rename over the target. Rename is atomic on the same NTFS volume,
 * so a crash mid-write can never leave a half-written file.
 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  const json = JSON.stringify(data, null, 2)

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

  await fs.rename(tmp, file)
}
