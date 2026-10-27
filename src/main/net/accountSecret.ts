import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

// Резервная копия вставленного вручную POESESSID (фолбэк входа, S3). Основное место —
// cookie в partition persist:poe-account; копия нужна, чтобы восстановить cookie,
// если хранилище cookies потеряно. Только safeStorage (DPAPI): если шифрование ОС
// недоступно — копию НЕ сохраняем (никакого plaintext). Отдельно от
// services/secretStore.ts (POESESSID прайс-чека PoE2): выход из аккаунта PoE1 не
// трогает настройку PoE2 и наоборот. atomicJson не используем: он оставляет .bak,
// а после выхода на диске не должно остаться даже шифротекста.

interface AccountSecretFile {
  /** base64 шифротекста safeStorage */
  poesessid?: string
}

function secretFile(): string {
  return path.join(app.getPath('userData'), 'account-secret.json')
}

/** Сохранить копию (true — сохранена зашифрованной). */
export async function saveAccountSecret(poesessid: string): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) return false
  const payload: AccountSecretFile = {
    poesessid: safeStorage.encryptString(poesessid).toString('base64')
  }
  const file = secretFile()
  const tmp = `${file}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(payload), 'utf8')
  await fs.rename(tmp, file)
  return true
}

export async function loadAccountSecret(): Promise<string | null> {
  let file: AccountSecretFile
  try {
    file = JSON.parse(await fs.readFile(secretFile(), 'utf8')) as AccountSecretFile
  } catch {
    return null
  }
  if (typeof file.poesessid !== 'string' || !file.poesessid) return null
  try {
    return safeStorage.decryptString(Buffer.from(file.poesessid, 'base64'))
  } catch {
    // ключ DPAPI другой (другой пользователь/ПК) или файл повреждён
    return null
  }
}

export async function clearAccountSecret(): Promise<void> {
  const file = secretFile()
  await Promise.all([file, `${file}.tmp`].map((f) => fs.rm(f, { force: true })))
}
