import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

// Старое хранилище POESESSID прайс-чека PoE2 из компаса (`secret.json`, шифротекст safeStorage/DPAPI).
// S47: у PoE2 своего ключа больше нет — вход общий, через официальную страницу (partition persist:poe-account).
// Файл здесь только читается один раз для переноса (services/poe2SessionMigration.ts) и удаляется.

interface SecretFile {
  /** base64 шифротекста safeStorage или сам ключ, если `encrypted` false (старый фолбэк без шифрования ОС) */
  poesessid?: string
  encrypted?: boolean
}

function secretFile(): string {
  return path.join(app.getPath('userData'), 'secret.json')
}

/** Есть ли файл старого ключа (даже пустой или битый — его тоже надо убрать). */
export async function hasLegacyPoe2SessionFile(): Promise<boolean> {
  const files = [secretFile(), `${secretFile()}.bak`, `${secretFile()}.tmp`]
  const found = await Promise.all(files.map((f) => fs.stat(f).then(() => true, () => false)))
  return found.some(Boolean)
}

/** Старый POESESSID PoE2 (расшифрованный) или null: нет файла, пусто, ключ DPAPI другой, файл повреждён. */
export async function readLegacyPoe2Session(): Promise<string | null> {
  let file: SecretFile
  try {
    file = JSON.parse(await fs.readFile(secretFile(), 'utf8')) as SecretFile
  } catch {
    return null
  }
  if (typeof file?.poesessid !== 'string' || !file.poesessid) return null
  if (!file.encrypted) return file.poesessid
  try {
    return safeStorage.decryptString(Buffer.from(file.poesessid, 'base64'))
  } catch {
    return null
  }
}

/** Удалить файл старого ключа вместе с копиями atomicJson (.bak/.tmp): на диске не остаётся даже шифротекста. */
export async function removeLegacyPoe2Session(): Promise<void> {
  const file = secretFile()
  await Promise.all([file, `${file}.bak`, `${file}.tmp`].map((f) => fs.rm(f, { force: true })))
}
