import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type {
  LevelingAction,
  LevelingConfig,
  LevelingCursor,
  LevelingData,
  LevelingFinished,
  LevelingProfile,
  LevelingProgress,
  LevelingSession,
  LevelingShow,
  LevelingState,
  LevelingVariant
} from '@shared/types/leveling'
import type { UiLang } from '@shared/types'
import { characterName } from '@shared/defaultNames'
import {
  DEFAULT_VARIANT,
  emptyProgress,
  flattenRoute,
  jumpTo,
  next,
  prev,
  returnIndex,
  toggle,
  type FlatStep
} from '@shared/leveling/route'
import { isAfter, parseLevelingLog } from '@shared/leveling/log'
import { applyLevel, applyLogin, applyZone, emptySession, guideState, zoneKind, type SyncEnv } from '@shared/leveling/sync'
import { readJson, writeJsonAtomic, writeJsonAtomicSync } from './atomicJson'

// Прокачка PoE1 в main (S14, S22): персонажи и прогресс по маршруту — userData/leveling.json (свой файл: профили
// компаса PoE2 в profiles.json не трогаем; модель та же — список персонажей + прогресс активного), строки
// Client.txt (общий тейлер gameLog подписывает домен ipc/leveling.ts) → вход в игру, зона и уровень
// (shared/leveling/sync.ts). При запуске — хвост лога после последней учтённой строки (курсор в файле):
// персонажи, где каждый и пройдена ли кампания. Только чтение лога, в игру ничего не отправляется.

const FILE_VERSION = 2
const SAVE_DELAY_MS = 600
/** Строки конца хвоста, которые могли прийти и в очередь тейлера, пока читали хвост. */
const PRIME_OVERLAP = 500
const MAX_SESSION_ZONES = 100
const SHOW_MODES: readonly LevelingShow[] = ['auto', 'always', 'never']
const FINISH_REASONS: readonly LevelingFinished['reason'][] = ['map', 'epilogue', 'endgame', 'level']

interface LevelingFile {
  version: number
  profiles: LevelingProfile[]
  activeId: string
  progress: Record<string, LevelingProgress>
  config: LevelingConfig
  /** текущий вход в игру по журналу */
  session: LevelingSession
  /** последняя учтённая строка журнала; null — ещё не читали */
  cursor: LevelingCursor | null
}

const DEFAULT_CONFIG: LevelingConfig = { show: 'auto', collapsed: false, pos: null }

function newProfile(name: string, now: number): LevelingProfile {
  return { id: randomUUID(), name, className: null, character: null, createdAt: now, updatedAt: now }
}

const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function normVariant(v: unknown): LevelingVariant {
  const x = (v ?? {}) as Partial<LevelingVariant>
  const bandit = ['kill', 'alira', 'kraityn', 'oak'].includes(x.bandit as string) ? (x.bandit as LevelingVariant['bandit']) : DEFAULT_VARIANT.bandit
  return { leagueStart: typeof x.leagueStart === 'boolean' ? x.leagueStart : DEFAULT_VARIANT.leagueStart, bandit }
}

function normFinished(v: unknown): LevelingFinished | null {
  const x = (v ?? null) as Partial<LevelingFinished> | null
  if (!x || !FINISH_REASONS.includes(x.reason as LevelingFinished['reason']) || !num(x.at)) return null
  const out: LevelingFinished = { reason: x.reason as LevelingFinished['reason'], at: x.at }
  if (typeof x.areaId === 'string') out.areaId = x.areaId
  if (num(x.level)) out.level = x.level
  return out
}

function normProgress(v: unknown, now: number): LevelingProgress {
  const x = (v ?? {}) as Partial<LevelingProgress>
  const done: Record<string, number> = {}
  if (x.done && typeof x.done === 'object') for (const [k, t] of Object.entries(x.done)) if (typeof t === 'number') done[k] = t
  return {
    done,
    current: typeof x.current === 'string' ? x.current : null,
    level: Number.isFinite(x.level) ? Math.max(1, Math.min(100, x.level as number)) : 1,
    areaId: typeof x.areaId === 'string' ? x.areaId : null,
    variant: normVariant(x.variant),
    finished: normFinished(x.finished),
    showAnyway: x.showAnyway === true,
    updatedAt: Number.isFinite(x.updatedAt) ? (x.updatedAt as number) : now
  }
}

function normSession(v: unknown, profileIds: Set<string>, now: number): LevelingSession {
  const x = (v ?? {}) as Partial<LevelingSession>
  const snap = x.snapshot
  return {
    ...emptySession(),
    character: typeof x.character === 'string' ? x.character : null,
    fresh: x.fresh === true,
    endgame: normFinished(x.endgame),
    finale: x.finale === true,
    areaId: typeof x.areaId === 'string' ? x.areaId : null,
    areaLevel: num(x.areaLevel) ? x.areaLevel : null,
    snapshot:
      snap && typeof snap.profileId === 'string' && profileIds.has(snap.profileId)
        ? { profileId: snap.profileId, progress: normProgress(snap.progress, now) }
        : null,
    zones: (Array.isArray(x.zones) ? x.zones : [])
      .filter((z): z is { areaId: string; level: number } => !!z && typeof z.areaId === 'string' && num(z.level))
      .slice(-MAX_SESSION_ZONES)
      .map((z) => ({ areaId: z.areaId, level: z.level }))
  }
}

function normShow(c: Partial<LevelingConfig> & { overlay?: unknown }): LevelingShow {
  if (SHOW_MODES.includes(c.show as LevelingShow)) return c.show as LevelingShow
  // файл S14: «гид поверх игры» вкл/выкл → авто / никогда
  return c.overlay === false ? 'never' : DEFAULT_CONFIG.show
}

/** lang — язык интерфейса: на нём имя первого персонажа, если файла ещё нет (уже сохранённые не трогаем). */
export function normalizeLevelingFile(raw: unknown, now: number, lang: UiLang = 'ru'): LevelingFile {
  const x = (raw ?? {}) as Partial<LevelingFile>
  const profiles = (Array.isArray(x.profiles) ? x.profiles : [])
    .filter((p): p is LevelingProfile => !!p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({
      id: p.id,
      name: p.name,
      className: typeof p.className === 'string' ? p.className : null,
      character: typeof p.character === 'string' ? p.character : null,
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : now,
      updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : now
    }))
  if (profiles.length === 0) profiles.push(newProfile(characterName(lang, 1), now))
  const activeId = profiles.some((p) => p.id === x.activeId) ? (x.activeId as string) : profiles[0].id
  const progress: Record<string, LevelingProgress> = {}
  for (const p of profiles) progress[p.id] = normProgress(x.progress?.[p.id], now)
  const c = (x.config ?? {}) as Partial<LevelingConfig>
  const px = unit(c.pos?.x)
  const py = unit(c.pos?.y)
  const cur = (x.cursor ?? null) as Partial<LevelingCursor> | null
  return {
    version: FILE_VERSION,
    profiles,
    activeId,
    progress,
    config: {
      show: normShow(c),
      collapsed: c.collapsed === true,
      pos: px !== null && py !== null ? { x: px, y: py } : null
    },
    session: normSession(x.session, new Set(profiles.map((p) => p.id)), now),
    cursor: cur && num(cur.ts) && num(cur.up) ? { ts: cur.ts, up: cur.up } : null
  }
}

export class LevelingStore extends EventEmitter {
  private f: LevelingFile | null = null
  private loading: Promise<void> | null = null
  private data: LevelingData | null = null
  private flatCache = new Map<string, FlatStep[]>()
  /** гид показан хоткеем — до входа в другую зону */
  private forced = false
  /** строки тейлера, пришедшие, пока читаем хвост лога (prime) */
  private queue: string[] | null = null
  private log = { connected: false, logPath: null as string | null }
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly file: string,
    private readonly dataFile: string,
    private readonly now: () => number = () => Date.now(),
    /** язык интерфейса — для имён новых персонажей по умолчанию */
    private readonly uiLang: () => Promise<UiLang> | UiLang = () => 'ru'
  ) {
    super()
  }

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        const raw = await readJson<unknown>(this.file, null)
        this.f = normalizeLevelingFile(raw, this.now(), await this.uiLang())
      })()
    }
    return this.loading
  }

  /** Данные маршрута (resources/data/poe1/leveling/leveling.json) — один раз на процесс. */
  getData(): LevelingData {
    if (!this.data) this.data = JSON.parse(readFileSync(this.dataFile, 'utf8')) as LevelingData
    return this.data
  }

  private get file_(): LevelingFile {
    if (!this.f) throw new Error('levelingStore: load() не вызван')
    return this.f
  }

  private get progress(): LevelingProgress {
    const f = this.file_
    return f.progress[f.activeId]
  }

  private set progress(p: LevelingProgress) {
    const f = this.file_
    f.progress[f.activeId] = p
  }

  /** Плоский маршрут варианта (у каждого персонажа свой вариант). */
  flatFor(v: LevelingVariant): FlatStep[] {
    const key = `${v.leagueStart}|${v.bandit}`
    let flat = this.flatCache.get(key)
    if (!flat) {
      flat = flattenRoute(this.getData(), v)
      this.flatCache.set(key, flat)
    }
    return flat
  }

  flat(): FlatStep[] {
    return this.flatFor(this.progress.variant)
  }

  /** Окружение синхронизации; время события — из строки лога (при запуске хвост идёт за миллисекунды). */
  private env(at?: number): SyncEnv {
    return { data: this.getData(), flat: (v) => this.flatFor(v), now: at ?? this.now(), newId: () => randomUUID() }
  }

  private guide(): Omit<LevelingState['guide'], 'forced'> {
    const f = this.file_
    return guideState(f.config.show, this.progress, f.session, this.forced, this.flat())
  }

  state(): LevelingState {
    const f = this.file_
    const p = this.progress
    const s = f.session
    return {
      profiles: f.profiles.map((x) => ({ ...x })),
      activeId: f.activeId,
      progress: { ...p, done: { ...p.done }, variant: { ...p.variant }, finished: p.finished ? { ...p.finished } : null },
      config: { ...f.config, pos: f.config.pos ? { ...f.config.pos } : null },
      log: { ...this.log },
      offRoute: returnIndex(this.flat(), p),
      zone: s.areaId ? { areaId: s.areaId, level: s.areaLevel ?? 0, kind: zoneKind(s.areaId, s.areaLevel ?? 0) } : null,
      character: s.character,
      guide: { ...this.guide(), forced: this.forced }
    }
  }

  /** Что журнал знает сейчас (проверки и тесты): вход в игру и последняя учтённая строка. */
  logState(): { session: LevelingSession; cursor: LevelingCursor | null } {
    const f = this.file_
    return { session: { ...f.session, zones: [...f.session.zones] }, cursor: f.cursor ? { ...f.cursor } : null }
  }

  setLog(connected: boolean, logPath: string | null): void {
    if (this.log.connected === connected && this.log.logPath === logPath) return
    this.log = { connected, logPath }
    if (this.f) this.emit('changed', this.state())
  }

  // ---------------------------------------------------------------------------
  // Строки лога
  // ---------------------------------------------------------------------------

  /**
   * Новые строки Client.txt: вход в игру, зона (шаг маршрута, «кампания пройдена»), повышение уровня
   * (персонаж, уровень, класс). Пока читаем хвост лога при запуске — копятся в очереди.
   */
  ingestLines(lines: string[]): void {
    if (this.queue) {
      this.queue.push(...lines)
      return
    }
    if (!this.f) return
    if (this.ingest(lines)) this.changed()
  }

  private ingest(lines: string[]): boolean {
    let changed = false
    for (const line of lines) {
      const r = parseLevelingLog(line)
      if (!r) continue
      const f = this.file_
      if (r.at) f.cursor = r.at
      const e = r.event
      if (e.type === 'login') {
        applyLogin(f)
        this.forced = false
      } else if (e.type === 'zone') {
        applyZone(f, e.areaId, e.level, this.env(r.at?.ts))
        this.forced = false
      } else {
        applyLevel(f, e, this.env(r.at?.ts))
      }
      changed = true
    }
    return changed
  }

  /** Копить новые строки до prime(): тейлер может прислать их раньше, чем прочитан хвост. */
  hold(): void {
    this.queue = this.queue ?? []
  }

  /**
   * Запуск: догнать хвост лога — строки после последней учтённой (при первом запуске — весь хвост): кто
   * играет, где он и пройдена ли кампания. Строки тейлера, пришедшие тем временем, ждут в очереди.
   */
  async prime(readTail: () => Promise<string[]>): Promise<void> {
    this.queue = this.queue ?? []
    let overlap = new Set<string>()
    try {
      await this.load()
      const lines = await readTail().catch(() => [] as string[])
      const c = this.file_.cursor
      this.ingest(c ? lines.filter((l) => isAfter(l, c)) : lines)
      overlap = new Set(lines.slice(-PRIME_OVERLAP))
    } finally {
      const queued = this.queue ?? []
      this.queue = null
      if (this.f) {
        this.ingest(queued.filter((l) => !overlap.has(l)))
        this.changed()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Кнопки
  // ---------------------------------------------------------------------------

  async act(a: LevelingAction): Promise<LevelingState> {
    await this.load()
    const flat = this.flat()
    const now = this.now()
    const p = this.progress
    switch (a.type) {
      case 'next':
        this.progress = next(flat, p, now)
        break
      case 'prev':
        this.progress = prev(flat, p, now)
        break
      case 'toggle':
        this.progress = toggle(flat, p, a.stepId, now)
        break
      case 'jump':
        this.progress = jumpTo(flat, p, a.index, now)
        break
      case 'reset':
        this.progress = { ...emptyProgress(p.variant, now), level: p.level, areaId: p.areaId }
        break
      case 'showAnyway':
        this.progress = { ...p, showAnyway: a.on, updatedAt: now }
        break
    }
    this.changed()
    return this.state()
  }

  async setVariant(v: Partial<LevelingVariant>): Promise<LevelingState> {
    await this.load()
    const variant = normVariant({ ...this.progress.variant, ...v })
    this.progress = { ...this.progress, variant, updatedAt: this.now() }
    this.changed()
    return this.state()
  }

  async setConfig(patch: Partial<LevelingConfig>): Promise<LevelingState> {
    await this.load()
    const c = this.file_.config
    if (SHOW_MODES.includes(patch.show as LevelingShow) && patch.show !== c.show) {
      c.show = patch.show as LevelingShow
      this.forced = false
    }
    if (typeof patch.collapsed === 'boolean') c.collapsed = patch.collapsed
    if ('pos' in patch) {
      const x = unit(patch.pos?.x)
      const y = unit(patch.pos?.y)
      c.pos = x !== null && y !== null ? { x, y } : null
    }
    this.changed()
    return this.state()
  }

  /**
   * Хоткей «показать / свернуть гид» (levelingToggle): скрытый гид (режим, город, кампания пройдена) —
   * показать развёрнутым до входа в другую зону, видимый — свернуть ↔ развернуть. Одно действие на нажатие.
   */
  async toggleGuide(): Promise<LevelingState> {
    await this.load()
    if (this.guide().visible) return this.setConfig({ collapsed: !this.file_.config.collapsed })
    this.forced = true
    return this.setConfig({ collapsed: false })
  }

  /**
   * Новый персонаж вручную («Новый персонаж», «Начать заново (новый персонаж)»): маршрут с начала, первое
   * повышение уровня в журнале даст ему имя.
   */
  async createProfile(name: string): Promise<LevelingState> {
    await this.load()
    const lang = await this.uiLang()
    const now = this.now()
    const f = this.file_
    const p = newProfile(name.trim() || characterName(lang, f.profiles.length + 1), now)
    f.profiles.push(p)
    f.progress[p.id] = emptyProgress(this.progress.variant, now)
    f.activeId = p.id
    f.session = { ...f.session, character: null, fresh: true, endgame: null, finale: false, snapshot: null, zones: [] }
    this.changed()
    return this.state()
  }

  /** Выбор вручную: персонаж входа снова не подтверждён — журнал поправит по повышению уровня. */
  async selectProfile(id: string): Promise<LevelingState> {
    await this.load()
    const f = this.file_
    if (f.profiles.some((p) => p.id === id) && id !== f.activeId) {
      f.activeId = id
      f.session = { ...f.session, character: null, fresh: false, snapshot: { profileId: id, progress: f.progress[id] } }
      this.changed()
    }
    return this.state()
  }

  async updateProfile(id: string, patch: { name?: string; className?: string | null; character?: string | null }): Promise<LevelingState> {
    await this.load()
    const p = this.file_.profiles.find((x) => x.id === id)
    if (p) {
      if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 40)
      if (patch.className !== undefined) p.className = patch.className ? patch.className.slice(0, 40) : null
      if (patch.character !== undefined) p.character = patch.character ? patch.character.trim().slice(0, 40) : null
      p.updatedAt = this.now()
      this.changed()
    }
    return this.state()
  }

  async removeProfile(id: string): Promise<LevelingState> {
    await this.load()
    const f = this.file_
    if (f.profiles.length > 1 && f.profiles.some((p) => p.id === id)) {
      f.profiles = f.profiles.filter((p) => p.id !== id)
      delete f.progress[id]
      if (f.activeId === id) {
        f.activeId = f.profiles[0].id
        f.session = { ...f.session, character: null, snapshot: null }
      } else if (f.session.snapshot?.profileId === id) f.session = { ...f.session, snapshot: null }
      this.changed()
    }
    return this.state()
  }

  // ---------------------------------------------------------------------------

  private changed(): void {
    this.emit('changed', this.state())
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, SAVE_DELAY_MS)
  }

  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.f) return Promise.resolve()
    return writeJsonAtomic(this.file, this.f).catch((e) => console.error('[leveling] сохранение:', e))
  }

  /**
   * Для `before-quit` (S29): синхронно. Асинхронная запись на выходе не успевала rename — прогресс гида
   * оставался в leveling.json.tmp и терялся.
   */
  flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.f) return
    try {
      writeJsonAtomicSync(this.file, this.f)
    } catch (e) {
      console.error('[leveling] сохранение при выходе:', e)
    }
  }
}
