import { clipboard, Notification } from 'electron'
import { GAMES, liveUrl, siteUrl, type GameId, type SiteHost } from '@shared/games'
import { isAllowedExternalUrl } from '@shared/links'
import type {
  AuthStatus,
  LiveAddResult,
  LiveHit,
  LiveHitEvent,
  LiveOptions,
  LiveSearchView,
  LiveSnapshot,
  LiveWhisperResult,
  UiLang
} from '@shared/types'
import { getSettings } from '../../services/settingsStore'
import { getAuthStatus, onAuthStatus } from '../../net/account'
import { tradeRequest } from '../../net/gateway'
import { getEffectiveLeague } from '../../net/leagues'
import { netLog } from '../../net/http'
import { openTradeWindow } from '../../ipc/fav'
import { getGameFocus, isFocusTracking } from '../../focus/gameFocus'
import { typeInChat } from '../../input/gameInput'
import {
  CONNECT_SPACING_MS,
  RATE_LIMIT_MIN_MS,
  isActive,
  reduce,
  wakeAt,
  wantsConnect,
  type ConnEvent,
  type ConnState
} from './live/machine'
import { HitBatcher, ToastThrottle } from './live/batch'
import { toLiveHit } from './live/hits'
import { parseLiveInput } from './live/tradeUrl'
import { cleanTitle, DEFAULT_OPTIONS, loadLiveFile, newSearchId, saveLiveFile, type StoredSearch } from './live/store'
import { favLiveState, type FavLiveStateS6 } from './live/favState'
import { createWindowTransport, createWsTransport, preferredTransport, type LiveConnection, type LiveTransport } from './wsTransport'

// Менеджер live search PoE1 (S6). Только main: соединения, cookies, fetch.
//  - подключения разных поисков не чаще раза в 2.5 с (общая очередь); после 429 на рукопожатии
//    очередь держится до конца паузы — сайт ограничивает подключения, а не поиск;
//  - {"new":[ids]} → батч 300 мс + дедуп → fetch через шлюз S3 (live-fetch, background, резерв 25 %);
//  - тост в оверлее (антиспам: 6 в минуту на поиск), звук, уведомление Windows, если игра не в фокусе;
//  - «Написать» и хоткей whisperLastHit вставляют whisper в чат и НЕ отправляют (Enter жмёт игрок).
//    Direct whisper через API сайта не используем (риск для аккаунта).

const RECENT_MAX = 50
const FETCH_MAX_WAIT_MS = 60_000
const FETCH_RETRY_MAX_MS = 120_000
const STATE_EMIT_DELAY_MS = 120

export interface LiveEmitter {
  state(s: LiveSnapshot): void
  hit(e: LiveHitEvent): void
}

/**
 * Поиск избранного трейд-окна для live — по контракту FavLiveTarget S5 (src/main/ipc/fav.ts).
 * Поисками избранного управляет только молния в трейд-окне: во вкладке Live их нельзя
 * выключить или убрать (иначе «намерение» в избранном и список live разъедутся).
 */
export interface FavoriteLiveTarget {
  favId: string
  title: string
  type: 'search' | 'exchange'
  slug: string
  league: string
  game: GameId
  notify: boolean
}

export type FavoriteLiveResult = { ok: true } | { ok: false; reason: 'limit' | 'auth' | 'unsupported' | 'error' }

export interface FavoriteLiveSnapshot {
  states: Record<string, FavLiveStateS6>
  used: number
  max: number
}

const SLUG = /^[A-Za-z0-9_-]{3,512}$/

export type LiveToggleResult = 'ok' | 'limit' | 'not-found'

interface Entry {
  def: StoredSearch
  conn: ConnState
  socket: LiveConnection | null
  /** номер соединения: события старого соединения игнорируются */
  token: number
  hits: number
  lastHitAt?: number
}

const NOTIFY_TEXT: Record<UiLang, { title: string; merchant: string }> = {
  ru: { title: 'POETH — новая находка', merchant: 'лот торговца' },
  en: { title: 'POETH — new listing', merchant: 'merchant listing' }
}

export class LiveManager {
  private options: LiveOptions = { ...DEFAULT_OPTIONS }
  private entries = new Map<string, Entry>()
  private recent: LiveHit[] = []
  private lastWhisper: LiveHit | null = null
  private running = false
  private loaded: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null
  private lastConnectAt = 0
  private holdUntil = 0
  private loggedIn = false
  private host: SiteHost = 'www.pathofexile.com'
  private max = 10
  private lang: UiLang = 'ru'
  private soundOn = true
  private volume = 0.6
  private transport: LiveTransport
  private offAuth: (() => void) | null = null
  private readonly batcher = new HitBatcher({ onFlush: (sid, ids) => void this.fetchHits(sid, ids) })
  private readonly throttle = new ToastThrottle()
  private readonly changeListeners = new Set<() => void>()

  constructor(private readonly emit: LiveEmitter) {
    this.transport = this.makeTransport(preferredTransport())
  }

  private makeTransport(kind: 'ws' | 'window'): LiveTransport {
    return kind === 'window' ? createWindowTransport(() => this.host) : createWsTransport()
  }

  // ---------------------------------------------------------------- жизненный цикл

  private load(): Promise<void> {
    this.loaded ??= loadLiveFile().then((f) => {
      this.options = f.options
      for (const def of f.searches) {
        this.entries.set(def.id, { def, conn: { kind: 'idle' }, socket: null, token: 0, hits: 0 })
      }
    })
    return this.loaded
  }

  private async refreshSettings(): Promise<void> {
    const s = await getSettings()
    this.host = s.siteHost
    this.max = s.live.maxSearches
    this.lang = s.uiLang
    this.soundOn = s.sound.enabled
    this.volume = s.sound.volume
  }

  /** Режим PoE1: поднять включённые поиски. */
  async start(): Promise<void> {
    await this.load()
    await this.refreshSettings()
    if (this.running) return
    this.running = true
    this.loggedIn = getAuthStatus().loggedIn
    this.offAuth = onAuthStatus((s) => this.onAuth(s))
    if (this.options.enabled) for (const e of this.entries.values()) if (e.def.enabled) this.apply(e, { type: 'enable', loggedIn: this.loggedIn })
    this.pump()
    this.scheduleEmit()
  }

  /** Режим PoE2 или выход: закрыть все соединения (флаги поисков сохраняются). */
  stop(): void {
    if (!this.running) return
    this.running = false
    this.offAuth?.()
    this.offAuth = null
    for (const e of this.entries.values()) this.apply(e, { type: 'disable' })
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.transport.dispose()
    this.scheduleEmit()
  }

  private onAuth(s: AuthStatus): void {
    if (s.checking && !s.loggedIn) return
    if (s.loggedIn === this.loggedIn) return
    this.loggedIn = s.loggedIn
    for (const e of this.entries.values()) this.apply(e, { type: s.loggedIn ? 'login' : 'logout' })
    this.pump()
    this.scheduleEmit()
  }

  // ---------------------------------------------------------------- состояние

  /** Применить событие к поиску; закрыть соединение, если редьюсер велел. */
  private apply(e: Entry, ev: ConnEvent): void {
    const t = reduce(e.conn, ev)
    if (t.disconnect && e.socket) {
      e.token++
      e.socket.close()
      e.socket = null
    }
    if (t.state !== e.conn) {
      e.conn = t.state
      this.scheduleEmit()
    }
  }

  private dispatch(id: string, token: number, ev: ConnEvent): void {
    const e = this.entries.get(id)
    if (!e || e.token !== token) return
    this.apply(e, ev)
    if (e.conn.kind !== 'open' && e.conn.kind !== 'connecting' && e.socket) {
      e.token++
      e.socket.close()
      e.socket = null
    }
    this.pump()
  }

  /** Разбудить поиски из пауз и открыть следующее соединение из очереди. */
  private pump(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.running) return
    const now = Date.now()
    for (const e of this.entries.values()) {
      const at = wakeAt(e.conn)
      if (at !== null && at <= now) this.apply(e, { type: 'tick', now })
    }
    const slot = Math.max(this.lastConnectAt + CONNECT_SPACING_MS, this.holdUntil)
    const queued = [...this.entries.values()].filter((e) => wantsConnect(e.conn))
    if (queued.length && now >= slot) {
      this.connect(queued[0])
      queued.shift()
    }
    let next = Infinity
    for (const e of this.entries.values()) {
      const at = wakeAt(e.conn)
      if (at !== null) next = Math.min(next, at)
    }
    if (queued.length) next = Math.min(next, Math.max(this.lastConnectAt + CONNECT_SPACING_MS, this.holdUntil))
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.pump(), Math.max(50, next - Date.now()))
  }

  private connect(e: Entry): void {
    this.lastConnectAt = Date.now()
    this.apply(e, { type: 'start' })
    const token = ++e.token
    const id = e.def.id
    const url = liveUrl(GAMES.poe1, this.host, e.def.league, e.def.slug)
    netLog('debug', 'live: connect', e.def.league, e.def.slug, `(${this.transport.name})`)
    e.socket = this.transport.connect(url, {
      onOpen: () => this.dispatch(id, token, { type: 'open', now: Date.now() }),
      onMessage: (msg) => this.onMessage(id, token, msg),
      onReject: (status, info) => {
        const now = Date.now()
        if (status === 429) this.holdUntil = Math.max(this.holdUntil, now + Math.max(RATE_LIMIT_MIN_MS, info.retryAfterMs ?? 0))
        if (info.blocked && this.transport.name === 'ws') {
          // Cloudflare не пустил Node TLS — дальше через окно сайта (браузерный TLS)
          netLog('warn', 'live: websocket blocked by Cloudflare — switching to the site window transport')
          this.transport = this.makeTransport('window')
        }
        this.dispatch(id, token, { type: 'rejected', status, retryAfterMs: info.retryAfterMs, blocked: info.blocked, now })
      },
      onClose: () => {
        // в транспорте B отказ без кода: не вошли — значит, «нужен вход»
        const e2 = this.entries.get(id)
        if (this.transport.name === 'window' && !this.loggedIn && e2?.conn.kind === 'connecting') {
          this.dispatch(id, token, { type: 'rejected', status: 401, now: Date.now() })
        } else this.dispatch(id, token, { type: 'closed', now: Date.now() })
      }
    })
  }

  private onMessage(id: string, token: number, msg: unknown): void {
    const e = this.entries.get(id)
    if (!e || e.token !== token || !msg || typeof msg !== 'object') return
    const m = msg as { auth?: unknown; new?: unknown }
    if (m.auth === false) {
      this.dispatch(id, token, { type: 'rejected', status: 401, now: Date.now() })
      return
    }
    if (m.new !== undefined) this.batcher.push(id, m.new)
  }

  // ---------------------------------------------------------------- находки

  private async fetchHits(searchId: string, ids: string[], retried = false): Promise<void> {
    const e = this.entries.get(searchId)
    if (!e || !this.running) return
    const res = await tradeRequest<{ result?: unknown[] }>({
      kind: 'live-fetch',
      priority: 'background',
      maxWaitMs: FETCH_MAX_WAIT_MS,
      cache: false,
      req: {
        method: 'GET',
        endpoint: 'fetch',
        rest: `${ids.join(',')}?query=${encodeURIComponent(e.def.slug)}`,
        game: 'poe1',
        host: this.host
      }
    })
    if (!res.ok) {
      netLog('warn', 'live: fetch failed —', res.error.code)
      if (res.error.code === 'rate-limited' && !retried) {
        const wait = Math.min(FETCH_RETRY_MAX_MS, res.error.retryAfterMs ?? RATE_LIMIT_MIN_MS)
        setTimeout(() => void this.fetchHits(searchId, ids, true), wait)
      }
      return
    }
    const now = Date.now()
    const url = siteUrl(GAMES.poe1, this.host, e.def.league, e.def.slug)
    for (const raw of res.data.result ?? []) {
      const hit = toLiveHit(raw, { searchId, searchTitle: e.def.title, league: e.def.league, siteUrl: url, now })
      if (hit) this.onHit(e, hit)
    }
  }

  private onHit(e: Entry, hit: LiveHit): void {
    e.hits++
    e.lastHitAt = hit.at
    this.recent = [hit, ...this.recent.filter((h) => h.key !== hit.key)].slice(0, RECENT_MAX)
    if (hit.whisper) this.lastWhisper = hit
    const toast = e.def.notify && this.throttle.allow(e.def.id, hit.at)
    const sound = toast && this.options.sound && e.def.sound && this.soundOn
    this.emit.hit({ hit, toast, sound, volume: this.volume })
    if (toast && this.options.notifyWindows) this.notifyWindows(hit)
    this.scheduleEmit()
  }

  private notifyWindows(hit: LiveHit): void {
    // игра в фокусе — хватит тоста в оверлее
    if (!isFocusTracking() || getGameFocus().game || getGameFocus().overlay) return
    if (!Notification.isSupported()) return
    const tx = NOTIFY_TEXT[this.lang]
    const name = [hit.name, hit.typeLine].filter(Boolean).join(' ')
    const price = hit.price ? `${hit.price.amount} ${hit.price.currency}` : ''
    const body = [name, price, hit.merchant ? tx.merchant : ''].filter(Boolean).join(' · ')
    new Notification({ title: `${tx.title}: ${hit.searchTitle}`, body, silent: true }).show()
  }

  // ---------------------------------------------------------------- команды UI

  async snapshot(): Promise<LiveSnapshot> {
    await this.load()
    const searches: LiveSearchView[] = [...this.entries.values()].map((e) => this.view(e))
    return {
      options: { ...this.options },
      searches,
      active: this.activeCount(),
      max: this.max,
      loggedIn: this.loggedIn,
      recent: this.recent
    }
  }

  private view(e: Entry): LiveSearchView {
    const c = e.conn
    const v: LiveSearchView = {
      id: e.def.id,
      title: e.def.title,
      league: e.def.league,
      slug: e.def.slug,
      enabled: e.def.enabled,
      sound: e.def.sound,
      notify: e.def.notify,
      state: c.kind,
      hits: e.hits,
      siteUrl: siteUrl(GAMES.poe1, this.host, e.def.league, e.def.slug),
      source: e.def.source
    }
    if (c.kind === 'backoff') {
      v.reason = c.reason
      v.retryAt = c.until
    }
    if (c.kind === 'ratelimited') v.retryAt = c.until
    if (e.lastHitAt) v.lastHitAt = e.lastHitAt
    return v
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      void this.snapshot().then((s) => this.emit.state(s))
      for (const cb of [...this.changeListeners]) cb()
    }, STATE_EMIT_DELAY_MS)
  }

  private save(): void {
    void saveLiveFile({ options: this.options, searches: [...this.entries.values()].map((e) => e.def) })
  }

  /** Сколько поисков занимают место в лимите: включённые и не «битые» (404). */
  private activeCount(): number {
    return [...this.entries.values()].filter((e) => e.def.enabled && (e.conn.kind === 'idle' || isActive(e.conn))).length
  }

  /** Добавить поиск по ссылке/коду. Включается, если есть место в лимите. */
  async add(input: unknown, title?: unknown): Promise<LiveAddResult> {
    await this.load()
    await this.refreshSettings()
    const parsed = parseLiveInput(typeof input === 'string' ? input : '')
    if (!parsed.ok) return parsed
    const league = parsed.league ?? (await getEffectiveLeague())
    if ([...this.entries.values()].some((e) => e.def.slug === parsed.slug && e.def.league === league)) {
      return { ok: false, error: 'duplicate' }
    }
    const def: StoredSearch = {
      id: newSearchId(),
      title: cleanTitle(title, parsed.slug),
      league,
      slug: parsed.slug,
      enabled: this.activeCount() < this.max,
      sound: true,
      notify: true,
      source: 'manual',
      createdAt: Date.now()
    }
    const entry: Entry = { def, conn: { kind: 'idle' }, socket: null, token: 0, hits: 0 }
    this.entries.set(def.id, entry)
    this.save()
    if (def.enabled && this.options.enabled && this.running) this.apply(entry, { type: 'enable', loggedIn: this.loggedIn })
    this.pump()
    this.scheduleEmit()
    return { ok: true, search: this.view(entry) }
  }

  /** Убрать поиск из вкладки Live (поиски избранного убирает только трейд-окно). */
  async remove(id: unknown): Promise<void> {
    await this.load()
    const e = typeof id === 'string' ? this.entries.get(id) : undefined
    if (!e || e.def.source === 'favorite') return
    this.drop(e)
  }

  private drop(e: Entry): void {
    this.apply(e, { type: 'disable' })
    this.batcher.drop(e.def.id)
    this.throttle.drop(e.def.id)
    this.entries.delete(e.def.id)
    this.save()
    this.scheduleEmit()
  }

  async setEnabled(id: unknown, on: unknown): Promise<LiveToggleResult> {
    await this.load()
    await this.refreshSettings()
    const e = typeof id === 'string' ? this.entries.get(id) : undefined
    if (!e || e.def.source === 'favorite') return 'not-found'
    const want = on === true
    if (want && !e.def.enabled && this.activeCount() >= this.max) return 'limit'
    e.def.enabled = want
    this.save()
    if (want && this.options.enabled && this.running) this.apply(e, { type: 'enable', loggedIn: this.loggedIn })
    if (!want) this.apply(e, { type: 'disable' })
    this.pump()
    this.scheduleEmit()
    return 'ok'
  }

  async update(id: unknown, patch: { title?: unknown; sound?: unknown }): Promise<void> {
    await this.load()
    const e = typeof id === 'string' ? this.entries.get(id) : undefined
    if (!e) return
    if (patch.title !== undefined) e.def.title = cleanTitle(patch.title, e.def.title)
    if (typeof patch.sound === 'boolean') e.def.sound = patch.sound
    this.save()
    this.scheduleEmit()
  }

  async setOptions(patch: unknown): Promise<LiveSnapshot> {
    await this.load()
    const p = (patch ?? {}) as Partial<LiveOptions>
    const wasEnabled = this.options.enabled
    for (const k of ['enabled', 'sound', 'notifyWindows'] as const) if (typeof p[k] === 'boolean') this.options[k] = p[k]
    this.save()
    if (this.running && wasEnabled !== this.options.enabled) {
      for (const e of this.entries.values()) {
        if (this.options.enabled && e.def.enabled) this.apply(e, { type: 'enable', loggedIn: this.loggedIn })
        if (!this.options.enabled) this.apply(e, { type: 'disable' })
      }
      this.pump()
    }
    this.scheduleEmit()
    return this.snapshot()
  }

  private findHit(key: unknown): LiveHit | undefined {
    return typeof key === 'string' ? this.recent.find((h) => h.key === key) : undefined
  }

  /** «Написать»: вставить whisper в чат игры. Enter жмёт игрок — сами не отправляем. */
  whisper(key: unknown): LiveWhisperResult {
    const hit = this.findHit(key)
    if (!hit?.whisper) return 'no-whisper'
    return typeInChat(hit.whisper, { send: false })
  }

  /** Хоткей whisperLastHit — последней in-person находке. */
  whisperLast(): LiveWhisperResult {
    if (!this.lastWhisper?.whisper) return 'no-whisper'
    return typeInChat(this.lastWhisper.whisper, { send: false })
  }

  copyWhisper(key: unknown): boolean {
    const hit = this.findHit(key)
    if (!hit?.whisper) return false
    clipboard.writeText(hit.whisper)
    return true
  }

  /**
   * «Открыть лот» в трейд-окне S5: сайт сам покажет этот лот продавца (запрос ?q= по аккаунту,
   * имени, базе и ilvl). Без базы предмета — страница поиска в том же трейд-окне.
   */
  openHit(key: unknown): boolean {
    const hit = this.findHit(key)
    if (!hit) return false
    // разметка сайта вида <<set:MS>> в имени и базе запросу сайта не нужна
    const plain = (s: string | undefined): string => (s ?? '').replace(/<<[^>]*>>/g, '').trim()
    const typeLine = plain(hit.baseType) || plain(hit.typeLine)
    if (!typeLine && !(hit.siteUrl && isAllowedExternalUrl(hit.siteUrl))) return false
    const lot = { account: hit.account, name: plain(hit.name) || undefined, typeLine, ilvl: hit.ilvl }
    const target = typeLine ? { lot, league: hit.league, game: 'poe1' as const } : { url: hit.siteUrl }
    void openTradeWindow(target).catch((err) => netLog('warn', 'live: openHit', err))
    return true
  }

  // ---------------------------------------------------------------- адаптер избранного (S5)

  private favEntry(favId: string): Entry | undefined {
    return [...this.entries.values()].find((e) => e.def.source === 'favorite' && e.def.favId === favId)
  }

  /**
   * Молния у поиска избранного. Включение без входа — ок: поиск ждёт входа (состояние 'auth')
   * и подключится сам. Выключение убирает поиск из live (нет в states = 'off').
   */
  async setFavoriteLive(t: FavoriteLiveTarget, enabled: boolean): Promise<FavoriteLiveResult> {
    await this.load()
    await this.refreshSettings()
    const existing = this.favEntry(t.favId)
    if (!enabled) {
      if (existing) this.drop(existing)
      return { ok: true }
    }
    if (t.type !== 'search' || t.game !== 'poe1' || !this.running) return { ok: false, reason: 'unsupported' }
    if (!SLUG.test(t.slug) || !t.league || t.league.includes('/')) return { ok: false, reason: 'error' }
    if (existing) {
      const moved = existing.def.slug !== t.slug || existing.def.league !== t.league
      existing.def.title = cleanTitle(t.title, existing.def.title)
      existing.def.slug = t.slug
      existing.def.league = t.league
      existing.def.notify = t.notify
      if (moved) {
        // другой поиск — переподключиться
        this.apply(existing, { type: 'disable' })
        if (this.options.enabled) this.apply(existing, { type: 'enable', loggedIn: this.loggedIn })
      }
      this.save()
      this.pump()
      this.scheduleEmit()
      return { ok: true }
    }
    if (this.activeCount() >= this.max) return { ok: false, reason: 'limit' }
    const def: StoredSearch = {
      id: newSearchId(),
      title: cleanTitle(t.title, t.slug),
      league: t.league,
      slug: t.slug,
      enabled: true,
      sound: true,
      notify: t.notify,
      source: 'favorite',
      favId: t.favId,
      createdAt: Date.now()
    }
    const entry: Entry = { def, conn: { kind: 'idle' }, socket: null, token: 0, hits: 0 }
    this.entries.set(def.id, entry)
    if (this.options.enabled) this.apply(entry, { type: 'enable', loggedIn: this.loggedIn })
    this.save()
    this.pump()
    this.scheduleEmit()
    return { ok: true }
  }

  /** «Уведомлять» у поиска избранного — без переподключения. */
  setFavoriteNotify(favId: string, notify: boolean): void {
    const e = this.favEntry(favId)
    if (!e || e.def.notify === notify) return
    e.def.notify = notify
    this.save()
    this.scheduleEmit()
  }

  /** Состояния молний по favId (нет записи = 'off'), занято и лимит — для сайдбара трейд-окна. */
  favoriteSnapshot(): FavoriteLiveSnapshot {
    const states: Record<string, FavLiveStateS6> = {}
    for (const e of this.entries.values()) {
      if (e.def.source !== 'favorite' || !e.def.favId) continue
      states[e.def.favId] = this.running ? favLiveState(e.conn.kind, this.options.enabled) : 'off'
    }
    return { states, used: this.activeCount(), max: this.max }
  }

  /** Подписка на любые изменения (состояния, поиски, опции). */
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }
}
