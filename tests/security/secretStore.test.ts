import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Старый POESESSID прайс-чека PoE 2 (secret.json, safeStorage): S47 только читает его для переноса во вход
// аккаунта и удаляет вместе с .bak/.tmp — на диске не остаётся ни ключа, ни шифротекста (S29).

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => state.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const s = b.toString()
      if (!s.startsWith('enc:')) throw new Error('bad ciphertext')
      return s.slice(4)
    }
  }
}))

type Store = typeof import('../../src/main/services/secretStore')
let store: Store

beforeEach(async () => {
  state.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-secret-'))
  vi.resetModules()
  store = await import('../../src/main/services/secretStore')
})

afterEach(async () => {
  await fs.rm(state.dir, { recursive: true, force: true })
})

const A = '0123456789abcdef0123456789abcdef'
const B = 'fedcba9876543210fedcba9876543210'
const enc = (v: string) => Buffer.from(`enc:${v}`).toString('base64')
const write = (name: string, data: unknown) => fs.writeFile(path.join(state.dir, name), JSON.stringify(data))

describe('secretStore: старый ключ PoE 2 — прочитать и удалить без следов', () => {
  it('нет файла — null, удалять нечего', async () => {
    expect(await store.hasLegacyPoe2SessionFile()).toBe(false)
    expect(await store.readLegacyPoe2Session()).toBeNull()
  })

  it('шифротекст DPAPI расшифровывается; после удаления нет ни файла, ни .bak/.tmp', async () => {
    await write('secret.json', { poesessid: enc(B), encrypted: true })
    await write('secret.json.bak', { poesessid: enc(A), encrypted: true })
    await write('secret.json.tmp', {})
    expect(await store.hasLegacyPoe2SessionFile()).toBe(true)
    expect(await store.readLegacyPoe2Session()).toBe(B)
    await store.removeLegacyPoe2Session()
    expect(await fs.readdir(state.dir)).toEqual([])
    expect(await store.hasLegacyPoe2SessionFile()).toBe(false)
  })

  it('пустой, битый или чужой (DPAPI другого пользователя) файл — null', async () => {
    await write('secret.json', {})
    expect(await store.readLegacyPoe2Session()).toBeNull()
    await fs.writeFile(path.join(state.dir, 'secret.json'), '{oops')
    expect(await store.readLegacyPoe2Session()).toBeNull()
    await write('secret.json', { poesessid: Buffer.from('junk').toString('base64'), encrypted: true })
    expect(await store.readLegacyPoe2Session()).toBeNull()
  })

  it('старый фолбэк без шифрования ОС читается как есть', async () => {
    await write('secret.json', { poesessid: A, encrypted: false })
    expect(await store.readLegacyPoe2Session()).toBe(A)
  })

  it('в модуле больше нет записи ключа', () => {
    expect(Object.keys(store).sort()).toEqual(['hasLegacyPoe2SessionFile', 'readLegacyPoe2Session', 'removeLegacyPoe2Session'])
  })
})
