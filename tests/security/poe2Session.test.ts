import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PoE2-прайс-чек (компас) ставит POESESSID заголовком Cookie руками (S29): на редиректе запрос обрывается,
// ключ не уходит на новый адрес; в main сохраняется только POESESSID правильного формата.

const SESSID = '0123456789abcdef0123456789abcdef'

interface Script {
  (req: FakeReq): void
}

class FakeReq extends EventEmitter {
  headers: Record<string, string> = {}
  aborted = false
  followed = false
  constructor(
    public opts: Record<string, unknown>,
    private script: Script
  ) {
    super()
  }
  setHeader(k: string, v: string): void {
    this.headers[k] = v
  }
  write(): void {}
  end(): void {
    queueMicrotask(() => this.script(this))
  }
  abort(): void {
    this.aborted = true
  }
  followRedirect(): void {
    this.followed = true
  }
}

function respond(req: FakeReq, status: number, body: string): void {
  const res = Object.assign(new EventEmitter(), { statusCode: status, headers: { 'content-type': 'application/json' } })
  req.emit('response', res)
  res.emit('data', Buffer.from(body))
  res.emit('end')
}

const made: FakeReq[] = []
let script: Script = () => undefined

vi.mock('electron', () => ({
  app: { userAgentFallback: 'UA POETH/test', getPath: () => '.' },
  net: { request: (opts: Record<string, unknown>) => (made.push(new FakeReq(opts, (r) => script(r))), made.at(-1)) }
}))
vi.mock('../../src/main/services/secretStore', () => ({ getSession: async () => SESSID }))

const { getLeagues } = await import('../../src/main/services/tradeClient')

beforeEach(() => {
  made.length = 0
})

describe('tradeClient PoE2: редиректы', () => {
  it('запрос — с redirect: manual и ключом только в своём заголовке', async () => {
    script = (r) => respond(r, 200, JSON.stringify({ result: [{ id: 'Dawn of the Hunt' }, { id: 'Standard' }] }))
    const leagues = await getLeagues()
    expect(leagues).toContain('Standard')
    expect(made[0].opts).toMatchObject({ redirect: 'manual' })
    expect(String(made[0].opts.url)).toMatch(/^https:\/\/www\.pathofexile\.com\/api\/trade2\//)
    expect(made[0].headers.Cookie).toBe(`POESESSID=${SESSID}`)
  })

  it('редирект (хоть на чужой хост) — обрыв, без followRedirect; прайс-чек уходит в запасной список', async () => {
    script = (r) => {
      r.emit('redirect', 302, 'GET', 'https://evil.example/steal')
      // если бы запрос не оборвали, ответ пришёл бы уже с чужого хоста
      if (!r.aborted) respond(r, 200, JSON.stringify({ result: [{ id: 'Evil League' }] }))
    }
    const leagues = await getLeagues()
    expect(made[0].aborted).toBe(true)
    expect(made[0].followed).toBe(false)
    expect(leagues).not.toContain('Evil League')
  })
})

describe('ipc trade.setSession: только формат POESESSID', () => {
  const src = readFileSync(resolve(__dirname, '../../src/main/ipc/trade.ts'), 'utf8')
  const handler = src.slice(src.indexOf('IPC.trade.setSession'), src.indexOf('IPC.trade.hasSession'))

  it('проверка формата — до сохранения', () => {
    expect(handler).toMatch(/isValidPoesessid\(value\)/)
    expect(handler.indexOf('isValidPoesessid(value)')).toBeLessThan(handler.indexOf('secret.setSession(value)'))
    expect(handler).not.toMatch(/secret\.setSession\(poesessid\)/)
  })
})
