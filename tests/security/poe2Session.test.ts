import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
import type { AuthStatus, PasteSessionResult, Poe2SessionNotice } from '@shared/types'
import { migratePoe2Session, settledAuthStatus, type Poe2MigrationDeps } from '../../src/main/services/poe2SessionMigration'

// S47: у прайс-чека PoE 2 больше нет своего POESESSID. Вход — общий (официальная страница, partition
// persist:poe-account), старый ключ из secret.json один раз переносится во вход и удаляется.

const KEY = '0123456789abcdef0123456789abcdef'
const out: AuthStatus = { loggedIn: false, checking: false, problem: null }
const inside: AuthStatus = { loggedIn: true, checking: false, problem: null, source: 'window' }

function deps(over: Partial<Poe2MigrationDeps> & { status?: AuthStatus; paste?: PasteSessionResult } = {}) {
  const calls = { removed: 0, pasted: [] as string[], notices: [] as Poe2SessionNotice[] }
  const d: Poe2MigrationDeps = {
    hasLegacyFile: async () => true,
    readLegacy: async () => KEY,
    removeLegacy: async () => void calls.removed++,
    authStatus: async () => over.status ?? out,
    pasteSession: async (v) => {
      calls.pasted.push(v)
      return over.paste ?? { ok: true, status: inside }
    },
    saveNotice: async (n) => void calls.notices.push(n),
    ...over
  }
  return { d, calls }
}

describe('перенос старого ключа PoE 2 во вход аккаунта', () => {
  it('нет файла — ничего не делаем и ничего не показываем', async () => {
    const { d, calls } = deps({ hasLegacyFile: async () => false })
    expect(await migratePoe2Session(d)).toBeNull()
    expect(calls).toEqual({ removed: 0, pasted: [], notices: [] })
  })

  it('не вошли: ключ уходит во вход (как «вставить POESESSID»), файл удаляется', async () => {
    const { d, calls } = deps()
    expect(await migratePoe2Session(d)).toBe('moved')
    expect(calls.pasted).toEqual([KEY])
    expect(calls.removed).toBe(1)
    expect(calls.notices).toEqual(['moved'])
  })

  it('сайт ключ не узнал — «устарел», файл всё равно удалён', async () => {
    const { d, calls } = deps({ paste: { ok: false, error: 'not-logged-in', status: out } })
    expect(await migratePoe2Session(d)).toBe('expired')
    expect(calls.removed).toBe(1)
    const bad = deps({ paste: { ok: false, error: 'invalid-format', status: out } })
    expect(await migratePoe2Session(bad.d)).toBe('expired')
  })

  it('уже вошли через окно сайта — рабочий вход не перебиваем, старый ключ просто удаляем', async () => {
    const { d, calls } = deps({ status: inside })
    expect(await migratePoe2Session(d)).toBe('already')
    expect(calls.pasted).toEqual([])
    expect(calls.removed).toBe(1)
  })

  it('вход сейчас не проверить (нет сети, Cloudflare) — ничего не трогаем до следующего запуска', async () => {
    const { d, calls } = deps({ status: { loggedIn: false, checking: false, problem: 'network' } })
    expect(await migratePoe2Session(d)).toBeNull()
    expect(calls).toEqual({ removed: 0, pasted: [], notices: [] })
  })

  it('пустой или нерасшифровываемый файл — удаляем без уведомления', async () => {
    const { d, calls } = deps({ readLegacy: async () => null })
    expect(await migratePoe2Session(d)).toBeNull()
    expect(calls.removed).toBe(1)
    expect(calls.notices).toEqual([])
  })

  it('ошибка переноса не оставляет файл на диске', async () => {
    const { d, calls } = deps({
      pasteSession: async () => {
        throw new Error('boom')
      }
    })
    await expect(migratePoe2Session(d)).rejects.toThrow('boom')
    expect(calls.removed).toBe(1)
  })

  it('статус входа ждём до конца первой проверки', async () => {
    vi.useFakeTimers()
    let cb: ((s: AuthStatus) => void) | null = null
    const p = settledAuthStatus(
      () => ({ loggedIn: false, checking: true, problem: null }),
      (f) => ((cb = f), () => (cb = null))
    )
    cb!({ loggedIn: false, checking: true, problem: null })
    cb!(inside)
    expect(await p).toEqual(inside)
    expect(cb).toBeNull()
    vi.useRealTimers()
  })
})

describe('каналы: своего POESESSID у PoE 2 нет', () => {
  it('trade.setSession / hasSession / priceCheck убраны', () => {
    const trade = IPC.trade as Record<string, string>
    for (const k of ['setSession', 'hasSession', 'priceCheck', 'getLeagues']) expect(trade[k], k).toBeUndefined()
    expect(Object.values(IPC.trade)).not.toContain('trade:setSession')
  })

  it('main не ставит POESESSID заголовком руками и не держит старый клиент trade2', () => {
    const src = readFileSync(resolve(__dirname, '../../src/main/ipc/trade.ts'), 'utf8')
    expect(src).not.toMatch(/POESESSID=/)
    expect(src).not.toMatch(/tradeClient|secretStore/)
    expect(() => readFileSync(resolve(__dirname, '../../src/main/services/tradeClient.ts'))).toThrow()
  })

  it('PoE2 ищет через общий шлюз с лимитами (game: poe2)', () => {
    const src = readFileSync(resolve(__dirname, '../../src/main/ipc/trade.ts'), 'utf8')
    expect(src).toMatch(/IPC\.trade\.poe2Search, \(_e, args: unknown\) => tradeSearch\('poe2', args\)/)
    expect(src).toMatch(/tradeRequest</)
  })
})
