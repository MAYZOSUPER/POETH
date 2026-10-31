import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { WebSocket, WebSocketServer } from 'ws'
import type { LiveHitEvent, LiveSnapshot } from '@shared/types'
import type { LiveTransport } from '../../src/main/games/poe1/wsTransport'

// Live search PoE 2 на ws-заглушке (S63): настоящий WebSocket-сервер на 127.0.0.1 отвечает на путь
// live-поиска, как сайт ({"auth":true}, {"new":[id]}); менеджер live (main) — с подменёнными сетью, входом,
// настройками и вводом в игру. Транспорт — `ws` к заглушке вместо wss://www.pathofexile.com (адрес, который
// строит менеджер, проверяем отдельно). Те же проверки для PoE 1 — что он не изменился.

const h = vi.hoisted(() => ({
  dir: '',
  port: 0,
  connects: [] as string[],
  tradeRequest: vi.fn(),
  typeInChat: vi.fn(() => 'ok'),
  openTradeWindow: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.dir },
  clipboard: { writeText: vi.fn() },
  Notification: class {
    show(): void {}
  }
}))
vi.mock('../../src/main/services/settingsStore', () => ({
  getSettings: async () => ({
    siteHost: 'ru.pathofexile.com',
    live: { maxSearches: 10 },
    uiLang: 'ru',
    sound: { enabled: true, volume: 0.5 }
  })
}))
vi.mock('../../src/main/net/account', () => ({
  getAuthStatus: () => ({ loggedIn: true, checking: false }),
  onAuthStatus: () => () => undefined
}))
vi.mock('../../src/main/net/gateway', () => ({ tradeRequest: h.tradeRequest }))
vi.mock('../../src/main/net/leagues', () => ({ getEffectiveLeague: async () => 'Standard' }))
vi.mock('../../src/main/net/http', () => ({ netLog: () => undefined }))
vi.mock('../../src/main/ipc/fav', () => ({ openTradeWindow: h.openTradeWindow }))
vi.mock('../../src/main/focus/gameFocus', () => ({
  getGameFocus: () => ({ game: true, overlay: false }),
  isFocusTracking: () => true
}))
vi.mock('../../src/main/input/gameInput', () => ({ typeInChat: h.typeInChat }))
vi.mock('../../src/main/appIcon', () => ({ notificationIcon: () => undefined }))
vi.mock('../../src/main/services/notify', () => ({ windowsToastsAllowed: () => false }))

/** Транспорт к заглушке: путь — из адреса менеджера (wss://<хост>/api/…), хост — 127.0.0.1. */
function stubTransport(): LiveTransport {
  return {
    name: 'ws',
    connect(url, handlers) {
      h.connects.push(url)
      const u = new URL(url)
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}${u.pathname}`)
      let done = false
      const finish = (fn: () => void): void => {
        if (done) return
        done = true
        fn()
      }
      ws.on('unexpected-response', (_req, res) => {
        finish(() => handlers.onReject(res.statusCode ?? 0, { blocked: false }))
        ws.terminate()
      })
      ws.on('open', () => handlers.onOpen())
      ws.on('message', (d) => handlers.onMessage(JSON.parse(String(d))))
      ws.on('close', () => finish(() => handlers.onClose()))
      ws.on('error', () => undefined)
      return { close: () => ws.close() }
    },
    dispose() {}
  }
}

vi.mock('../../src/main/games/poe1/wsTransport', () => ({
  createWsTransport: () => stubTransport(),
  createWindowTransport: () => stubTransport(),
  preferredTransport: () => 'ws'
}))

import { LiveManager } from '../../src/main/games/poe1/liveSearch'

const SLUG = 'H4sIAAAAAAAAA3WNsQ7CMAxEfwXd3IERdUdiAwF7ZYVALdIkSh1E'
const ITEM_BUYOUT = 'b'.repeat(64)
const ITEM_WHISPER = 'a'.repeat(64)

// ответ /api/trade2/fetch (структура — живой ответ 31.10.2026; ники заменены)
const FETCH_POE2 = {
  result: [
    {
      id: ITEM_BUYOUT,
      listing: { method: 'psapi', fee: 1357, price: { type: '~b/o', amount: 1, currency: 'exalted' }, account: { name: 'Merchant#0001', online: null } },
      item: { rarity: 'Magic', frameType: 1, name: '', typeLine: 'Vaporous Iron Ring of the Newt', baseType: 'Iron Ring', ilvl: 40 }
    },
    {
      id: ITEM_WHISPER,
      listing: {
        method: 'psapi',
        whisper:
          '@Seller_Char Hi, I would like to buy your Gold Ring listed for 1 exalted in Standard (stash tab "Trading"; position: left 3, top 2)',
        price: { type: '~price', amount: 1, currency: 'exalted' },
        account: { name: 'Seller#1234', online: { league: 'Standard' }, lastCharacterName: 'Seller_Char', language: 'en_US' }
      },
      item: { rarity: 'Normal', frameType: 0, name: '', typeLine: 'Gold Ring', baseType: 'Gold Ring', ilvl: 12 }
    }
  ]
}

let wss: WebSocketServer
/** что сервер ответит на рукопожатие по пути (по умолчанию — пустит) */
let reject: number | null = null
const sockets: WebSocket[] = []
const paths: string[] = []

beforeAll(async () => {
  wss = new WebSocketServer({
    port: 0,
    host: '127.0.0.1',
    verifyClient: (_info, cb) => (reject ? cb(false, reject) : cb(true))
  })
  await new Promise<void>((r) => wss.once('listening', () => r()))
  h.port = (wss.address() as { port: number }).port
  wss.on('connection', (ws, req) => {
    paths.push(req.url ?? '')
    sockets.push(ws)
    ws.send(JSON.stringify({ auth: true }))
  })
})
afterAll(async () => {
  await new Promise<void>((r) => wss.close(() => r()))
})

let managers: LiveManager[] = []
beforeEach(async () => {
  h.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-live2-'))
  h.connects.length = 0
  paths.length = 0
  sockets.length = 0
  reject = null
  h.tradeRequest.mockReset()
  h.typeInChat.mockClear()
  h.openTradeWindow.mockClear()
})
afterEach(async () => {
  for (const m of managers) m.stop()
  managers = []
  await new Promise((r) => setTimeout(r, 50))
  await fs.rm(h.dir, { recursive: true, force: true })
})

async function until<T>(fn: () => T | undefined | null | false | Promise<T | undefined | null | false>, ms = 4000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

function manager(): { m: LiveManager; hits: LiveHitEvent[]; states: LiveSnapshot[] } {
  const hits: LiveHitEvent[] = []
  const states: LiveSnapshot[] = []
  const m = new LiveManager({ state: (s) => states.push(s), hit: (e) => hits.push(e) })
  managers.push(m)
  return { m, hits, states }
}

describe('live PoE 2 на ws-заглушке', () => {
  it('ловит лот: адрес trade2, fetch через шлюз, находка выкупа и личного обмена', async () => {
    h.tradeRequest.mockResolvedValue({ ok: true, data: FETCH_POE2 })
    const { m, hits } = manager()
    await m.start('poe2')
    const r = await m.add(`https://www.pathofexile.com/trade2/search/poe2/Standard/${SLUG}`, 'Кольца')
    expect(r.ok).toBe(true)

    // менеджер строит адрес live trade2 (с realm poe2) и идёт на www, даже если в настройках ru
    await until(() => sockets.length > 0)
    expect(h.connects).toEqual([`wss://www.pathofexile.com/api/trade2/live/poe2/Standard/${SLUG}`])
    expect(paths).toEqual([`/api/trade2/live/poe2/Standard/${SLUG}`])
    await until(async () => (await m.snapshot()).searches[0]?.state === 'open')

    sockets[0].send(JSON.stringify({ new: [ITEM_BUYOUT, ITEM_WHISPER] }))
    await until(() => hits.length >= 2)

    expect(h.tradeRequest).toHaveBeenCalledTimes(1)
    expect(h.tradeRequest.mock.calls[0][0]).toMatchObject({
      kind: 'live-fetch',
      priority: 'background',
      req: { method: 'GET', endpoint: 'fetch', game: 'poe2', host: 'www.pathofexile.com', rest: `${ITEM_BUYOUT},${ITEM_WHISPER}?query=${SLUG}` }
    })
    const [buy, inPerson] = hits
    expect(buy).toMatchObject({ toast: true, sound: true, hit: { game: 'poe2', merchant: true, fee: 1357, searchTitle: 'Кольца', league: 'Standard' } })
    expect(buy.hit.siteUrl).toBe(`https://www.pathofexile.com/trade2/search/poe2/Standard/${SLUG}`)
    expect(inPerson.hit).toMatchObject({ game: 'poe2', merchant: false, seller: 'online' })

    const snap = await m.snapshot()
    expect(snap).toMatchObject({ game: 'poe2', max: 5, active: 1 })
    expect(snap.recent.map((x) => x.itemId)).toEqual([ITEM_WHISPER, ITEM_BUYOUT])
  })

  it('«Whisper последней» вставляет в чат без отправки; выкуп открывается запросом лота в трейд-окне', async () => {
    h.tradeRequest.mockResolvedValue({ ok: true, data: FETCH_POE2 })
    const { m, hits } = manager()
    await m.start('poe2')
    await m.add(`Standard/${SLUG}`)
    await until(() => sockets.length > 0)
    await until(async () => (await m.snapshot()).searches[0]?.state === 'open')
    sockets[0].send(JSON.stringify({ new: [ITEM_BUYOUT, ITEM_WHISPER] }))
    await until(() => hits.length >= 2)

    expect(m.whisperLast()).toBe('ok')
    expect(h.typeInChat).toHaveBeenCalledWith(FETCH_POE2.result[1].listing.whisper, { send: false })
    expect(m.whisper(hits[0].hit.key)).toBe('no-whisper')

    expect(m.openHit(hits[0].hit.key)).toBe(true)
    expect(h.openTradeWindow).toHaveBeenCalledWith({
      query: {
        status: { option: 'any' },
        type: 'Iron Ring',
        filters: {
          trade_filters: { filters: { account: { input: 'Merchant#0001' } } },
          type_filters: { filters: { rarity: { option: 'magic' }, ilvl: { min: 40, max: 40 } } }
        }
      },
      league: 'Standard',
      game: 'poe2'
    })
  })

  it('без входа сайт отвечает 401 — поиск ждёт входа (как у PoE 1)', async () => {
    reject = 401
    const { m } = manager()
    await m.start('poe2')
    await m.add(`Standard/${SLUG}`)
    await until(async () => (await m.snapshot()).searches[0]?.state === 'auth')
    expect(h.tradeRequest).not.toHaveBeenCalled()
  })

  it('предел поисков PoE 2 — из опций live (по умолчанию 5), лишний добавляется выключенным', async () => {
    reject = 401
    const { m } = manager()
    await m.start('poe2')
    await m.setOptions({ poe2Max: 2 })
    expect((await m.snapshot()).max).toBe(2)
    expect((await m.add('Standard/aaaaaaaa')).ok).toBe(true)
    expect((await m.add('Standard/bbbbbbbb')).ok).toBe(true)
    const third = await m.add('Standard/cccccccc')
    expect(third.ok && third.search.enabled).toBe(false)
    await m.setOptions({ poe2Max: 999 })
    expect((await m.snapshot()).max).toBe(5)
  })

  it('поиски у каждой игры свои; ссылка другой игры — ошибка', async () => {
    reject = 401
    const a = manager()
    await a.m.start('poe1')
    expect(await a.m.add(`https://www.pathofexile.com/trade2/search/poe2/Standard/${SLUG}`)).toEqual({ ok: false, error: 'poe2' })
    expect((await a.m.add('https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw')).ok).toBe(true)
    await a.m.start('poe2')
    expect(await a.m.add('https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw')).toEqual({ ok: false, error: 'bad-url' })
    expect((await a.m.snapshot()).searches).toEqual([])
    expect((await a.m.add('Standard/kE6YLz5Tw')).ok).toBe(true)
    // тот же код в другой игре — не повтор; в файле у поиска есть игра
    await until(async () => {
      const f = JSON.parse(await fs.readFile(path.join(h.dir, 'live.json'), 'utf8').catch(() => '{}'))
      return f.searches?.length === 2
    })
    const file = JSON.parse(await fs.readFile(path.join(h.dir, 'live.json'), 'utf8'))
    expect(file.searches.map((s: { game: string }) => s.game).sort()).toEqual(['poe1', 'poe2'])
    expect(file.options.poe2Max).toBe(5)
  })
})

describe('live PoE 1 на той же заглушке не изменился', () => {
  it('адрес /api/trade/live, хост из настроек, fetch game poe1, находка без game', async () => {
    h.tradeRequest.mockResolvedValue({
      ok: true,
      data: {
        result: [
          {
            id: ITEM_WHISPER,
            listing: {
              whisper: '@Seller Hi, I would like to buy your Leather Belt listed for 5 chaos in Standard (stash tab "1"; position: left 1, top 1)',
              price: { amount: 5, currency: 'chaos' },
              account: { name: 'Seller#1', online: { league: 'Standard' } }
            },
            item: { typeLine: 'Leather Belt', frameType: 0, explicitMods: ['+30 to Strength'] }
          }
        ]
      }
    })
    const { m, hits } = manager()
    await m.start('poe1')
    expect((await m.add('https://ru.pathofexile.com/trade/search/Standard/kE6YLz5Tw')).ok).toBe(true)
    await until(() => sockets.length > 0)
    expect(h.connects).toEqual(['wss://ru.pathofexile.com/api/trade/live/Standard/kE6YLz5Tw'])
    await until(async () => (await m.snapshot()).searches[0]?.state === 'open')
    sockets[0].send(JSON.stringify({ new: [ITEM_WHISPER] }))
    await until(() => hits.length >= 1)
    expect(h.tradeRequest.mock.calls[0][0].req).toMatchObject({ game: 'poe1', host: 'ru.pathofexile.com' })
    expect(hits[0].hit.game).toBeUndefined()
    expect(hits[0].hit.mods).toEqual(['+30 to Strength'])
    const snap = await m.snapshot()
    expect(snap).toMatchObject({ game: 'poe1', max: 10 })
  })
})
