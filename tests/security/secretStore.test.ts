import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// POESESSID прайс-чека PoE 2 (secret.json, safeStorage): «забыть ключ» не оставляет шифротекст в .bak (S29).

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => state.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
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

describe('secretStore: очистка без следов', () => {
  it('после смены ключа и очистки на диске нет ни ключа, ни шифротекста', async () => {
    await store.setSession(A)
    await store.setSession(B) // прежний A уехал в secret.json.bak
    expect(await store.getSession()).toBe(B)
    await store.clearSession()
    const files = await fs.readdir(state.dir)
    expect(files).toEqual(['secret.json'])
    const text = await fs.readFile(path.join(state.dir, 'secret.json'), 'utf8')
    expect(JSON.parse(text)).toEqual({})
    expect(await store.hasSession()).toBe(false)
  })

  it('пустой ключ = очистка, и после перезапуска ключ не восстанавливается из .bak', async () => {
    await store.setSession(A)
    await store.setSession(B)
    await store.setSession('  ')
    vi.resetModules()
    const again = await import('../../src/main/services/secretStore')
    expect(await again.getSession()).toBeNull()
    const all = (await Promise.all((await fs.readdir(state.dir)).map((f) => fs.readFile(path.join(state.dir, f))))).join('')
    expect(all).not.toContain(Buffer.from(`enc:${A}`).toString('base64'))
    expect(all).not.toContain(Buffer.from(`enc:${B}`).toString('base64'))
  })
})
