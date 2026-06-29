import { app, safeStorage } from 'electron'
import path from 'path'
import { readJson, writeJsonAtomic } from './atomicJson'

// POESESSID is a session cookie that authorises trade API requests. It is a
// credential, so it is never stored in plaintext: we encrypt it with Electron's
// safeStorage (DPAPI on Windows) and keep only the base64 ciphertext on disk.
//
// If OS-level encryption is unavailable (rare; misconfigured Linux keyring),
// we fall back to storing the raw value but flag it so we never pretend it was
// encrypted. On Windows safeStorage is always available.

interface SecretFile {
  /** base64 of the safeStorage ciphertext, or the raw value when `encrypted` is false */
  poesessid?: string
  /** whether `poesessid` is safeStorage ciphertext (true) or plaintext fallback (false) */
  encrypted?: boolean
}

let cache: string | null | undefined // undefined = not loaded yet, null = no session

function secretFile(): string {
  return path.join(app.getPath('userData'), 'secret.json')
}

/** Returns the stored POESESSID (decrypting if needed), or null when unset. */
export async function getSession(): Promise<string | null> {
  if (cache !== undefined) return cache
  const file = await readJson<SecretFile>(secretFile(), {})
  if (!file.poesessid) {
    cache = null
    return cache
  }
  if (file.encrypted) {
    try {
      cache = safeStorage.decryptString(Buffer.from(file.poesessid, 'base64'))
    } catch {
      // corrupt ciphertext or DPAPI key changed (different user/machine)
      cache = null
    }
  } else {
    cache = file.poesessid
  }
  return cache
}

export async function hasSession(): Promise<boolean> {
  return (await getSession()) !== null
}

/** Store (or clear, when empty) the POESESSID, encrypted at rest. */
export async function setSession(poesessid: string): Promise<void> {
  const trimmed = poesessid.trim()
  if (!trimmed) {
    await clearSession()
    return
  }
  let payload: SecretFile
  if (safeStorage.isEncryptionAvailable()) {
    payload = {
      poesessid: safeStorage.encryptString(trimmed).toString('base64'),
      encrypted: true
    }
  } else {
    console.warn(
      '[secretStore] OS encryption unavailable — POESESSID will be stored in plaintext on disk'
    )
    payload = { poesessid: trimmed, encrypted: false }
  }
  await writeJsonAtomic(secretFile(), payload)
  cache = trimmed
}

export async function clearSession(): Promise<void> {
  await writeJsonAtomic(secretFile(), {})
  cache = null
}
