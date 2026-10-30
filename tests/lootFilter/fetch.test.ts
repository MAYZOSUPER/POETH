import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// S53: сеть фильтра лута — только GitHub, анонимная сессия без cookies, без редиректов, потолок размера.
// Подмена electron.net: каждый запрос — сценарий (редирект, ответ, куски тела).

interface Scenario {
  redirect?: string
  status?: number
  headers?: Record<string, string>
  chunks?: Array<string | Buffer>
  error?: boolean
}

class FakeRequest extends EventEmitter {
  headers: Record<string, string> = {}
  aborted = false
  followed = false
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
    this.followed = true
  }
  end(): void {
    queueMicrotask(() => this.run())
  }
  private run(): void {
    const s = this.scenario
    if (s.error) {
      this.emit('error', new Error('net::ERR_FAILED'))
      return
    }
    if (s.redirect) {
      this.emit('redirect', 302, 'GET', s.redirect, {})
      if (this.aborted || !this.followed) return
    }
    const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> }
    res.statusCode = s.status ?? 200
    res.headers = s.headers ?? { 'content-type': 'application/json; charset=utf-8' }
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
  app: { getVersion: () => '0.1.0' },
  net: {
    request: (options: Record<string, unknown>) => {
      const r = new FakeRequest(options, next)
      requests.push(r)
      return r
    }
  }
}))
vi.mock('../../src/main/net/session', () => ({ getAnonSession: () => anon }))

const { lootFilterGet, getJson, typeMatches, lootFilterUserAgent } = await import('../../src/main/lootFilter/fetch')
const { LATEST_RELEASE_URL, zipUrl } = await import('@shared/lootFilter/source')

const ZIP = zipUrl('8.20.2')
const zipOpts = { kind: 'zip' as const, maxBytes: 1000, timeoutMs: 5000 }

beforeEach(() => {
  requests.length = 0
  next = {}
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('lootFilterGet', () => {
  it('анонимная сессия без cookies, без кэша и referrer, честный UA без данных игрока', async () => {
    next = { chunks: ['{"tag_name":"8.20.2"}'] }
    expect(await getJson(LATEST_RELEASE_URL)).toEqual({ ok: true, json: { tag_name: '8.20.2' } })
    const r = requests[0]
    expect(r.options).toMatchObject({
      url: LATEST_RELEASE_URL,
      method: 'GET',
      session: anon,
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    })
    expect(r.options).not.toHaveProperty('useSessionCookies')
    expect(r.headers['User-Agent']).toBe('POETH/0.1.0 (+https://github.com/MAYZOSUPER/POETH)')
    expect(Object.keys(r.headers).map((k) => k.toLowerCase())).not.toContain('cookie')
    expect(Object.keys(r.headers).map((k) => k.toLowerCase())).not.toContain('authorization')
    expect(lootFilterUserAgent('2.0.0')).toBe('POETH/2.0.0 (+https://github.com/MAYZOSUPER/POETH)')
  })

  it('чужие хосты — без запроса', async () => {
    for (const u of [
      'https://github.com/NeverSinkDev/NeverSink-Filter/archive/refs/tags/8.20.2.zip',
      'https://raw.githubusercontent.com/NeverSinkDev/NeverSink-Filter/8.20.2/x.filter',
      'https://evil.example/x.zip',
      'http://codeload.github.com/NeverSinkDev/NeverSink-Filter/zip/refs/tags/8.20.2'
    ]) {
      expect(await lootFilterGet(u, zipOpts)).toEqual({ ok: false, error: 'refused' })
    }
    expect(requests).toHaveLength(0)
  })

  it('редирект — никуда не идём', async () => {
    next = { redirect: 'https://objects.githubusercontent.com/x.zip', headers: { 'content-type': 'application/zip' }, chunks: ['PK'] }
    expect(await lootFilterGet(ZIP, zipOpts)).toEqual({ ok: false, error: 'refused', status: undefined })
    expect(requests[0].followed).toBe(false)
    expect(requests[0].aborted).toBe(true)
  })

  it('архив: Content-Length больше потолка — отказ сразу', async () => {
    next = { headers: { 'content-type': 'application/zip', 'content-length': '5000' }, chunks: ['PK'] }
    expect(await lootFilterGet(ZIP, zipOpts)).toMatchObject({ ok: false, error: 'too-large' })
  })

  it('архив: поток больше потолка — обрыв', async () => {
    next = { headers: { 'content-type': 'application/zip' }, chunks: [Buffer.alloc(600), Buffer.alloc(600)] }
    expect(await lootFilterGet(ZIP, zipOpts)).toMatchObject({ ok: false, error: 'too-large' })
    expect(requests[0].aborted).toBe(true)
  })

  it('архив в пределах потолка — байты целиком', async () => {
    next = { headers: { 'content-type': 'application/zip' }, chunks: [Buffer.from('PK'), Buffer.from([3, 4])] }
    const r = await lootFilterGet(ZIP, zipOpts)
    expect(r.ok && [...r.body]).toEqual([0x50, 0x4b, 3, 4])
  })

  it('не тот тип ответа — отказ (HTML вместо ZIP)', async () => {
    next = { headers: { 'content-type': 'text/html' }, chunks: ['<html>'] }
    expect(await lootFilterGet(ZIP, zipOpts)).toMatchObject({ ok: false, error: 'http' })
  })

  it('лимит GitHub: 403 с x-ratelimit-remaining 0 и 429 — rate-limited', async () => {
    next = { status: 403, headers: { 'x-ratelimit-remaining': '0' } }
    expect(await getJson(LATEST_RELEASE_URL)).toMatchObject({ ok: false, error: 'rate-limited' })
    next = { status: 429, headers: {} }
    expect(await getJson(LATEST_RELEASE_URL)).toMatchObject({ ok: false, error: 'rate-limited' })
    next = { status: 404, headers: {} }
    expect(await getJson(LATEST_RELEASE_URL)).toMatchObject({ ok: false, error: 'http' })
  })

  it('сетевая ошибка и битый JSON', async () => {
    next = { error: true }
    expect(await getJson(LATEST_RELEASE_URL)).toMatchObject({ ok: false, error: 'network' })
    next = { chunks: ['{not json'] }
    expect(await getJson(LATEST_RELEASE_URL)).toEqual({ ok: false, error: 'bad-release' })
  })

  it('typeMatches', () => {
    expect(typeMatches('json', 'application/json; charset=utf-8')).toBe(true)
    expect(typeMatches('json', 'text/html')).toBe(false)
    expect(typeMatches('zip', 'application/zip')).toBe(true)
    expect(typeMatches('zip', 'application/json')).toBe(false)
  })
})
