import { app, BrowserWindow } from 'electron'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { cookieHeaderFor } from '../../net/session'
import { hardenSiteContents, siteWebPreferences } from '../../net/siteContents'
import { isCloudflareChallenge, isPoeHost } from '../../net/guards'
import { netLog } from '../../net/http'
import { parseRetryAfterMs } from '../../net/rateLimit'

// Транспорт live search PoE1 за интерфейсом (S6).
//  A (основной) — `ws` в main: Cookie — все cookies хоста из partition аккаунта (POESESSID,
//    cf_clearance), Origin сайта, UA = app.userAgentFallback (тот же, что у окна и API).
//    Проверено 28.10.2026: Cloudflare пускает рукопожатие из Node TLS, без входа — 401.
//  B (запасной) — скрытое окно сайта трейда на той же сессии; WebSocket открывается в странице
//    через executeJavaScript, события приходят через console-message с меткой. Браузерный
//    WebSocket не показывает HTTP-код отказа (401/404/429 → просто закрытие), поэтому в B
//    «нужен вход» выводится из статуса входа, а не из ответа. Включается сам, если Cloudflare
//    не пустил A, или переменной POETH_LIVE_TRANSPORT=window.
// Cookie никуда не логируются и в renderer не уходят.

export interface LiveHandlers {
  onOpen(): void
  /** разобранное JSON-сообщение сервера ({"auth":true}, {"new":[…]}) */
  onMessage(msg: unknown): void
  /** рукопожатие отклонено HTTP-ответом */
  onReject(status: number, info: { retryAfterMs?: number; blocked: boolean }): void
  /** соединение закрылось или не установилось (без HTTP-кода) */
  onClose(): void
}

export interface LiveConnection {
  close(): void
}

export interface LiveTransport {
  readonly name: 'ws' | 'window'
  connect(url: string, h: LiveHandlers): LiveConnection
  dispose(): void
}

const HANDSHAKE_TIMEOUT_MS = 15_000
const MAX_PAYLOAD = 1024 * 1024
/** пинг раз в минуту; нет ответа 30 с — соединение мёртвое */
const PING_EVERY_MS = 60_000
const PONG_WAIT_MS = 30_000

function parseJson(data: unknown): unknown {
  try {
    return JSON.parse(String(data))
  } catch {
    return undefined
  }
}

/** Транспорт A: `ws` в main процессе. */
export function createWsTransport(): LiveTransport {
  const open = new Set<WebSocket>()
  return {
    name: 'ws',
    connect(url, h) {
      let closed = false
      let done = false
      let ws: WebSocket | null = null
      let ping: ReturnType<typeof setInterval> | null = null
      let pongTimer: ReturnType<typeof setTimeout> | null = null

      const stopTimers = (): void => {
        if (ping) clearInterval(ping)
        if (pongTimer) clearTimeout(pongTimer)
        ping = pongTimer = null
      }
      // одно «конечное» событие на соединение: отказ ИЛИ закрытие
      const finish = (fn: () => void): void => {
        stopTimers()
        if (ws) open.delete(ws)
        if (done || closed) return
        done = true
        fn()
      }

      void (async () => {
        const u = new URL(url)
        if (u.protocol !== 'wss:' || !isPoeHost(u.hostname)) {
          finish(() => h.onReject(400, { blocked: false }))
          return
        }
        let cookie = ''
        try {
          cookie = await cookieHeaderFor(url)
        } catch {
          cookie = ''
        }
        if (closed) return
        const headers: Record<string, string> = {
          Origin: `https://${u.host}`,
          'User-Agent': app.userAgentFallback
        }
        if (cookie) headers.Cookie = cookie
        ws = new WebSocket(url, { headers, handshakeTimeout: HANDSHAKE_TIMEOUT_MS, maxPayload: MAX_PAYLOAD })
        open.add(ws)
        const sock = ws

        sock.on('unexpected-response', (_req, res) => {
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (c: Buffer) => {
            size += c.length
            if (size < 64 * 1024) chunks.push(Buffer.from(c))
          })
          const report = (): void => {
            const status = res.statusCode ?? 0
            const hdrs: Record<string, string | undefined> = {}
            for (const [k, v] of Object.entries(res.headers)) hdrs[k] = Array.isArray(v) ? v.join(', ') : v
            const blocked = isCloudflareChallenge({ status, headers: hdrs, body: Buffer.concat(chunks).toString('utf8') })
            const retryAfterMs = parseRetryAfterMs(hdrs['retry-after']) || undefined
            netLog('debug', 'live ws: handshake', status, blocked ? '(cloudflare)' : '')
            finish(() => h.onReject(status, { retryAfterMs, blocked }))
            sock.terminate()
          }
          res.on('end', report)
          res.on('error', report)
        })
        sock.on('open', () => {
          if (closed) return
          h.onOpen()
          ping = setInterval(() => {
            if (sock.readyState !== WebSocket.OPEN) return
            sock.ping()
            pongTimer ??= setTimeout(() => sock.terminate(), PONG_WAIT_MS)
          }, PING_EVERY_MS)
        })
        sock.on('pong', () => {
          if (pongTimer) clearTimeout(pongTimer)
          pongTimer = null
        })
        sock.on('message', (data) => {
          if (closed || done) return
          const msg = parseJson(data)
          if (msg !== undefined) h.onMessage(msg)
        })
        sock.on('close', () => finish(() => h.onClose()))
        sock.on('error', (e) => {
          netLog('debug', 'live ws: error', e.message)
          finish(() => h.onClose())
        })
      })()

      return {
        close() {
          if (closed) return
          closed = true
          stopTimers()
          if (ws) {
            open.delete(ws)
            if (ws.readyState === WebSocket.CONNECTING) ws.terminate()
            else ws.close(1000)
          }
        }
      }
    },
    dispose() {
      for (const ws of open) ws.terminate()
      open.clear()
    }
  }
}

// ---------------------------------------------------------------------------
// Транспорт B: скрытое окно сайта
// ---------------------------------------------------------------------------

const MARK = '__poeth_live__'

/** Скрипт в странице сайта: WebSocket, события — в консоль с меткой (данные — только id предметов). */
function pageScript(id: string, url: string): string {
  return `(() => {
  const id = ${JSON.stringify(id)}, M = ${JSON.stringify(MARK)};
  const send = (o) => console.info(M + JSON.stringify(Object.assign({ id }, o)));
  const box = (window.__poethLive = window.__poethLive || {});
  try { box[id] && box[id].close(); } catch (e) {}
  const ws = new WebSocket(${JSON.stringify(url)});
  box[id] = ws;
  ws.onopen = () => send({ t: 'open' });
  ws.onmessage = (e) => send({ t: 'msg', d: String(e.data).slice(0, 200000) });
  ws.onclose = (e) => { delete box[id]; send({ t: 'close', code: e.code }); };
  return true;
})()`
}

/** Транспорт B: WebSocket внутри скрытого окна сайта трейда (сессия аккаунта, браузерный TLS). */
export function createWindowTransport(host: () => string): LiveTransport {
  let win: BrowserWindow | null = null
  let ready: Promise<void> | null = null
  const handlers = new Map<string, LiveHandlers>()

  const onConsole = (details: { message: string }): void => {
    const m = details.message
    if (!m.startsWith(MARK)) return
    const ev = parseJson(m.slice(MARK.length)) as { id?: string; t?: string; d?: string } | undefined
    const h = ev?.id ? handlers.get(ev.id) : undefined
    if (!h || !ev) return
    if (ev.t === 'open') h.onOpen()
    else if (ev.t === 'msg') {
      const msg = parseJson(ev.d)
      if (msg !== undefined) h.onMessage(msg)
    } else if (ev.t === 'close') {
      handlers.delete(ev.id as string)
      h.onClose()
    }
  }

  const ensure = (): Promise<void> => {
    if (win && !win.isDestroyed() && ready) return ready
    win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: siteWebPreferences() })
    hardenSiteContents(win.webContents)
    win.webContents.on('console-message', onConsole)
    win.on('closed', () => {
      win = null
      ready = null
      for (const [id, h] of handlers) {
        handlers.delete(id)
        h.onClose()
      }
    })
    ready = win.loadURL(`https://${host()}/trade`).then(
      () => undefined,
      (e: unknown) => {
        netLog('warn', 'live window: load failed', e instanceof Error ? e.message : String(e))
      }
    )
    return ready
  }

  return {
    name: 'window',
    connect(url, h) {
      const id = randomUUID()
      handlers.set(id, h)
      void ensure().then(async () => {
        if (!handlers.has(id) || !win || win.isDestroyed()) return
        try {
          await win.webContents.executeJavaScript(pageScript(id, url))
        } catch {
          if (handlers.delete(id)) h.onClose()
        }
      })
      return {
        close() {
          handlers.delete(id)
          if (win && !win.isDestroyed()) {
            void win.webContents
              .executeJavaScript(`(() => { const b = window.__poethLive || {}; try { b[${JSON.stringify(id)}].close() } catch (e) {} })()`)
              .catch(() => undefined)
          }
        }
      }
    },
    dispose() {
      handlers.clear()
      if (win && !win.isDestroyed()) win.destroy()
      win = null
      ready = null
    }
  }
}

/** Какой транспорт выбран переменной окружения (по умолчанию — ws). */
export function preferredTransport(): 'ws' | 'window' {
  return process.env.POETH_LIVE_TRANSPORT === 'window' ? 'window' : 'ws'
}
