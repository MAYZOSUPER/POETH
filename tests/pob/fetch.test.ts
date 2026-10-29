import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Подмена electron.net: каждый запрос — сценарий (редиректы, ответ, куски тела), всё синхронно в микрозадачах.
interface Scenario {
  redirects?: string[]
  status?: number
  headers?: Record<string, string>
  chunks?: Array<string | Buffer>
  error?: boolean
  hang?: boolean
}

class FakeRequest extends EventEmitter {
  headers: Record<string, string> = {}
  aborted = false
  followed: string[] = []
  private pending: string | null = null
  constructor(
    public options: Record<string, unknown>,
    private scenario: Scenario
  ) {
    super()
  }
  setHeader(k: string, v: string): void {
    this.headers[k] = v
  }
  abort(): void {
    this.aborted = true
  }
  followRedirect(): void {
    if (this.pending) this.followed.push(this.pending)
    this.pending = null
  }
  end(): void {
    queueMicrotask(() => this.run())
  }
  private run(): void {
    const s = this.scenario
    if (s.hang) return
    if (s.error) {
      this.emit('error', new Error('net::ERR_FAILED'))
      return
    }
    for (const to of s.redirects ?? []) {
      this.pending = to
      this.emit('redirect', 302, 'GET', to, {})
      if (this.aborted || this.pending) return // не пошли за редиректом
    }
    const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> }
    res.statusCode = s.status ?? 200
    res.headers = s.headers ?? { 'content-type': 'text/plain' }
    this.emit('response', res)
    for (const c of s.chunks ?? []) {
      if (this.aborted) return
      res.emit('data', Buffer.isBuffer(c) ? c : Buffer.from(c))
    }
    if (!this.aborted) res.emit('end')
  }
}

const requests: FakeRequest[] = []
let next: Scenario = {}
const anon = { name: 'poeth-anon' }

vi.mock('electron', () => ({
  app: { getVersion: () => '0.2.0' },
  net: {
    request: (options: Record<string, unknown>) => {
      const r = new FakeRequest(options, next)
      requests.push(r)
      return r
    }
  }
}))
vi.mock('../../src/main/net/session', () => ({ getAnonSession: () => anon }))

const { fetchPobCode, isPlainText, pobUserAgent, POB_FETCH_MAX_BYTES, POB_FETCH_TIMEOUT_MS } = await import('../../src/main/pob/fetch')
const { importPob } = await import('../../src/main/pob/import')
const { fixtureCode } = await import('./fixtures')

const RAW = 'https://pobb.in/7wnwKj2Fc1lj/raw'

beforeEach(() => {
  requests.length = 0
  next = {}
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('загрузка сырого кода', () => {
  it('анонимная сессия без cookies, ручные редиректы, честный User-Agent', async () => {
    next = { chunks: ['eNrt', 'abc\n'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: true, code: 'eNrtabc', url: RAW })
    expect(requests).toHaveLength(1)
    const r = requests[0]
    expect(r.options).toMatchObject({ url: RAW, method: 'GET', session: anon, credentials: 'omit', redirect: 'manual', cache: 'no-store' })
    expect(r.options).not.toHaveProperty('useSessionCookies')
    expect(r.headers['User-Agent']).toBe('POETH/0.2.0 (+https://github.com/MAYZOSUPER/POETH)')
    expect(r.headers['Accept']).toBe('text/plain')
    expect(pobUserAgent('1.0.0')).toBe('POETH/1.0.0 (+https://github.com/MAYZOSUPER/POETH)')
  })

  it('не https и хосты не из allowlist — без запроса', async () => {
    for (const u of ['http://pobb.in/x/raw', 'https://evil.example/x', 'https://poe.ninja/poe1/pob/raw/1', 'file:///C:/x'])
      expect(await fetchPobCode(u)).toEqual({ ok: false, error: 'bad-url' })
    expect(requests).toHaveLength(0)
  })

  it('редирект внутри allowlist — идём', async () => {
    next = { redirects: ['https://pobb.in/abc/raw'], chunks: ['eNqcode'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: true, code: 'eNqcode', url: 'https://pobb.in/abc/raw' })
    expect(requests[0].followed).toEqual(['https://pobb.in/abc/raw'])
  })

  it.each([
    ['чужой хост', 'https://evil.example/steal'],
    ['http', 'http://pobb.in/abc/raw'],
    ['приманка', 'https://pobb.in.evil.example/x'],
    ['логин в адресе', 'https://u:p@pobb.in/x']
  ])('редирект наружу (%s) — стоп, запрос обрывается', async (_n, to) => {
    next = { redirects: [to], chunks: ['eNqcode'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'redirect' })
    expect(requests[0].aborted).toBe(true)
    expect(requests[0].followed).toEqual([])
  })

  it('больше трёх редиректов — стоп', async () => {
    next = { redirects: ['https://pobb.in/a/raw', 'https://pobb.in/b/raw', 'https://pobb.in/c/raw', 'https://pobb.in/d/raw'], chunks: ['x'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'redirect' })
    expect(requests[0].followed).toHaveLength(3)
  })

  it.each([
    [404, 'not-found'],
    [410, 'not-found'],
    [403, 'blocked'],
    [401, 'blocked'],
    [429, 'rate-limited'],
    [500, 'http'],
    [204, 'http']
  ])('ответ %i → %s', async (status, error) => {
    next = { status, chunks: ['x'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error, status })
  })

  it('не text/plain — страница вместо кода', async () => {
    next = { headers: { 'content-type': 'text/html; charset=utf-8' }, chunks: ['<html>'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'not-text', status: 200 })
    expect(isPlainText('text/plain; charset=utf-8')).toBe(true)
    expect(isPlainText('Content-type: text/plain')).toBe(true) // так отвечает poedb.tw
    expect(isPlainText(['text/plain'])).toBe(true)
    expect(isPlainText(undefined)).toBe(false)
    expect(isPlainText('application/json')).toBe(false)
    expect(isPlainText('text/plainx')).toBe(false)
  })

  it('больше 1 МБ: по заголовку и по потоку — обрыв', async () => {
    next = { headers: { 'content-type': 'text/plain', 'content-length': String(POB_FETCH_MAX_BYTES + 1) }, chunks: ['x'] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'too-large' })
    expect(requests[0].aborted).toBe(true)
    next = { chunks: [Buffer.alloc(600 * 1024, 0x41), Buffer.alloc(600 * 1024, 0x41), Buffer.alloc(10, 0x41)] }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'too-large' })
    expect(requests[1].aborted).toBe(true)
  })

  it('сетевая ошибка', async () => {
    next = { error: true }
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'network' })
  })

  it('таймаут 10 с — обрыв', async () => {
    vi.useFakeTimers()
    next = { hang: true }
    const p = fetchPobCode(RAW)
    await vi.advanceTimersByTimeAsync(POB_FETCH_TIMEOUT_MS + 1)
    expect(await p).toEqual({ ok: false, error: 'timeout' })
    expect(requests[0].aborted).toBe(true)
  })

  it('один запрос на одно действие: вторая загрузка, пока идёт первая, — busy', async () => {
    vi.useFakeTimers()
    next = { hang: true }
    const first = fetchPobCode(RAW)
    expect(await fetchPobCode(RAW)).toEqual({ ok: false, error: 'busy' })
    expect(requests).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(POB_FETCH_TIMEOUT_MS + 1)
    await first
    next = { chunks: ['eNq'] }
    expect((await fetchPobCode(RAW)).ok).toBe(true)
  })
})

describe('importPob: вставка целиком', () => {
  it('ссылка pobb.in → загрузка → билд', async () => {
    next = { chunks: [fixtureCode('pobbin-death-oath-328')] }
    const r = await importPob('https://pobb.in/7wnwKj2Fc1lj')
    expect(r).toMatchObject({ ok: true, source: { kind: 'link', site: 'pobbin', pageUrl: 'https://pobb.in/7wnwKj2Fc1lj' } })
    expect(requests[0].options.url).toBe(RAW)
  })

  it('код — без сети; планнер, PoE 2 и чужой сайт — без сети', async () => {
    expect((await importPob(fixtureCode('pobbin-crit'))).ok).toBe(true)
    expect(await importPob('https://maxroll.gg/poe/planner/abc')).toEqual({ ok: false, error: 'copy-code', copySite: 'maxroll-planner' })
    expect(await importPob('https://maxroll.gg/poe2/pob/wxyz5678')).toEqual({ ok: false, error: 'poe2' })
    expect(await importPob('https://evil.example/x')).toEqual({ ok: false, error: 'unknown-link', host: 'evil.example' })
    expect(await importPob('')).toEqual({ ok: false, error: 'empty' })
    expect(await importPob(42 as never)).toEqual({ ok: false, error: 'empty' })
    expect(requests).toHaveLength(0)
  })

  it('ошибка загрузки и мусор вместо кода', async () => {
    next = { status: 404 }
    expect(await importPob('https://pastebin.com/dzfTT720')).toEqual({ ok: false, error: 'fetch', fetchError: 'not-found' })
    next = { chunks: ['<html>not a code</html>'] }
    expect(await importPob('https://pastebin.com/dzfTT720')).toEqual({ ok: false, error: 'not-pob' })
  })
})
