import { readFileSync } from 'fs'
import { join } from 'path'
import { deflateSync } from 'zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { decodePobCode } from '@shared/pob/decode'
import { IPC } from '@shared/ipc'
import { COMPANION_CHANNELS, ipcAllowed } from '../../src/main/security/policy'
import { FIX, POB_FIX } from './fixtures'

// main «Стартеров» (S59): ссылку открывает только main по id записи из проверенного списка — окно адрес не передаёт;
// «Играть» качает PoB записи одним запросом и сверяет отпечаток. electron, сеть и библиотека — подмены.

const h = vi.hoisted(() => ({
  dir: 'good',
  opened: [] as string[],
  fetched: [] as string[],
  reply: null as null | { ok: true; code: string; url: string } | { ok: false; error: string },
  saved: [] as Array<{ source: unknown; opts: unknown }>
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async (url: string) => {
      h.opened.push(url)
    })
  }
}))
vi.mock('../../src/main/protocol', () => ({
  resolveDataFile: vi.fn(async (game: string, sub: string, file: string) => (game === 'poe1' && sub === 'starters' ? join(FIX, h.dir, file) : null))
}))
vi.mock('../../src/main/pob/fetch', () => ({
  fetchPobCode: vi.fn(async (url: string) => {
    h.fetched.push(url)
    return h.reply
  })
}))
vi.mock('../../src/main/build/buildLibrary', () => ({
  saveImported: vi.fn(async (_build: unknown, source: unknown, opts: unknown) => {
    h.saved.push({ source, opts })
    return { active: null, recent: [] }
  })
}))

const code = (name: string): string => readFileSync(join(POB_FIX, `${name}.txt`), 'utf8').trim()

beforeEach(() => {
  h.dir = 'good'
  h.opened = []
  h.fetched = []
  h.saved = []
  h.reply = null
})

describe('ссылки автора — только по id записи', () => {
  it('id + вид ссылки → адрес из списка в системный браузер', async () => {
    const { openStarterLink } = await import('../../src/main/build/starters')
    expect(await openStarterLink('test-champion-boneshatter', 'video')).toBe(true)
    expect(await openStarterLink('test-hiero-brand', 'guide')).toBe(true)
    expect(await openStarterLink('test-champion-boneshatter', 'pob')).toBe(true)
    expect(h.opened).toEqual(['https://youtu.be/FakeVideo01', 'https://maxroll.gg/poe/build-guides/fake-test-guide', 'https://pobb.in/FakeStarterA1'])
  })

  it('адрес вместо id, чужой id, неизвестный вид, нет такой ссылки — ничего не открывается', async () => {
    const { openStarterLink } = await import('../../src/main/build/starters')
    expect(await openStarterLink('https://evil.example.com/', 'guide')).toBe(false)
    expect(await openStarterLink('https://youtu.be/FakeVideo01', 'video')).toBe(false)
    expect(await openStarterLink('no-such-starter', 'video')).toBe(false)
    expect(await openStarterLink('test-champion-boneshatter', 'https://evil.example.com/')).toBe(false)
    expect(await openStarterLink('test-champion-boneshatter', 'guide')).toBe(false) // у записи нет гайда
    expect(await openStarterLink({ id: 'test-champion-boneshatter' }, 'video')).toBe(false)
    expect(h.opened).toEqual([])
  })

  it('открыть ссылку и играть — только компаньон; список могут читать все наши страницы', () => {
    for (const ch of [IPC.build.playStarter, IPC.build.openStarterLink]) {
      expect(COMPANION_CHANNELS.has(ch)).toBe(true)
      expect(ipcAllowed('index', ch)).toBe(true)
      expect(ipcAllowed('overlay', ch)).toBe(false)
      expect(ipcAllowed('trade-sidebar', ch)).toBe(false)
    }
    expect(ipcAllowed('index', IPC.build.starters)).toBe(true)
  })
})

describe('«Играть по этому гайду»', () => {
  it('PoB качается по адресу записи (сырой код с хоста S35), совпал — changed: false, билд открыт', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    h.reply = { ok: true, code: code('pobbin-acts-all-axes'), url: 'https://pobb.in/FakeStarterA1/raw' }
    const r = await playStarter('test-champion-boneshatter', 'replace')
    expect(r).toMatchObject({ ok: true, changed: false, leveling: 'acts' })
    expect(h.fetched).toEqual(['https://pobb.in/FakeStarterA1/raw'])
    expect(h.saved).toEqual([
      {
        source: { kind: 'link', site: 'pobbin', pageUrl: 'https://pobb.in/FakeStarterA1' },
        opts: { activate: true, starter: { id: 'test-champion-boneshatter', league: '3.30', changed: false } }
      }
    ])
  })

  it('автор перезаписал пасту — changed: true; «Добавить в библиотеку» не открывает', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    const d = decodePobCode(code('pobbin-acts-all-axes'), inflateNode)
    if (!d.ok) throw new Error(d.error)
    const xml = d.xml.replace(/(<Build [^>]*\blevel=")(\d+)"/, (_m, a: string, n: string) => `${a}${Number(n) + 1}"`)
    const edited = deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    h.reply = { ok: true, code: edited, url: 'https://pobb.in/FakeStarterA1/raw' }
    const r = await playStarter('test-champion-boneshatter', 'add')
    expect(r).toMatchObject({ ok: true, changed: true })
    expect(h.saved[0].opts).toEqual({ activate: false, starter: { id: 'test-champion-boneshatter', league: '3.30', changed: true } })
  })

  it('pob.codes — сырой код с api.pob.codes', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    h.reply = { ok: true, code: code('pobcodes-nightblade'), url: 'https://api.pob.codes/FakeStarterC3/raw' }
    const r = await playStarter('test-assassin-flurry', 'replace')
    expect(r).toMatchObject({ ok: true, changed: false })
    expect(h.fetched).toEqual(['https://api.pob.codes/FakeStarterC3/raw'])
  })

  it('паста удалена (404) — removed; прочие ошибки сети — fetch с причиной', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    h.reply = { ok: false, error: 'not-found' }
    expect(await playStarter('test-champion-boneshatter', 'replace')).toEqual({ ok: false, error: 'removed' })
    h.reply = { ok: false, error: 'timeout' }
    expect(await playStarter('test-champion-boneshatter', 'replace')).toEqual({ ok: false, error: 'fetch', fetchError: 'timeout' })
    expect(h.saved).toEqual([])
  })

  it('не код PoB — ошибка разбора, в библиотеку ничего', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    h.reply = { ok: true, code: '<html>blocked</html>', url: 'https://pobb.in/FakeStarterA1/raw' }
    expect(await playStarter('test-champion-boneshatter', 'replace')).toMatchObject({ ok: false, error: 'not-pob' })
    expect(h.saved).toEqual([])
  })

  it('адрес вместо id, чужой id, неверный режим — без сети', async () => {
    const { playStarter } = await import('../../src/main/build/starters')
    expect(await playStarter('https://pobb.in/FakeStarterA1', 'replace')).toEqual({ ok: false, error: 'unknown' })
    expect(await playStarter('no-such-starter', 'replace')).toEqual({ ok: false, error: 'unknown' })
    expect(await playStarter('test-champion-boneshatter', 'open')).toEqual({ ok: false, error: 'unknown' })
    expect(h.fetched).toEqual([])
  })

  it('до анонса — стартер прошлой лиги, метка с её лигой', async () => {
    const { playStarter, getStartersState } = await import('../../src/main/build/starters')
    h.dir = 'empty'
    expect((await getStartersState()).status).toBe('empty')
    h.reply = { ok: true, code: code('pobbin-acts-all-axes'), url: 'https://pobb.in/FakeStarterOld1/raw' }
    const r = await playStarter('test-old-champion', 'replace')
    expect(r).toMatchObject({ ok: true, changed: false })
    expect(h.saved[0].opts).toMatchObject({ starter: { id: 'test-old-champion', league: '3.29' } })
  })
})
