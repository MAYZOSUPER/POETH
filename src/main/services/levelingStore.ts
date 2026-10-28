import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type {
  LevelingAction,
  LevelingConfig,
  LevelingData,
  LevelingProfile,
  LevelingProgress,
  LevelingState,
  LevelingVariant
} from '@shared/types/leveling'
import {
  DEFAULT_VARIANT,
  emptyProgress,
  enterZone,
  flattenRoute,
  jumpTo,
  next,
  prev,
  toggle,
  type FlatStep
} from '@shared/leveling/route'
import { parseLevelingLine } from '@shared/leveling/log'
import { readJson, writeJsonAtomic } from './atomicJson'

// Прокачка PoE1 в main (S14): персонажи и прогресс по маршруту — userData/leveling.json (свой файл: профили
// компаса PoE2 в profiles.json не трогаем; модель та же — список персонажей + прогресс активного), строки
// Client.txt (общий тейлер gameLog подписывает домен ipc/leveling.ts) → вход в зону и уровень. Только чтение
// лога, в игру ничего не отправляется.

const FILE_VERSION = 1
const SAVE_DELAY_MS = 600

interface LevelingFile {
  version: number
  profiles: LevelingProfile[]
  activeId: string
  progress: Record<string, LevelingProgress>
  config: LevelingConfig
}

const DEFAULT_CONFIG: LevelingConfig = { overlay: true, collapsed: false, pos: null }

function newProfile(name: string, now: number): LevelingProfile {
  return { id: randomUUID(), name: name.trim() || 'Персонаж', className: null, character: null, createdAt: now, updatedAt: now }
}

const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)

function normVariant(v: unknown): LevelingVariant {
  const x = (v ?? {}) as Partial<LevelingVariant>
  const bandit = ['kill', 'alira', 'kraityn', 'oak'].includes(x.bandit as string) ? (x.bandit as LevelingVariant['bandit']) : DEFAULT_VARIANT.bandit
  return { leagueStart: typeof x.leagueStart === 'boolean' ? x.leagueStart : DEFAULT_VARIANT.leagueStart, bandit }
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
    updatedAt: Number.isFinite(x.updatedAt) ? (x.updatedAt as number) : now
  }
}

export function normalizeLevelingFile(raw: unknown, now: number): LevelingFile {
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
  if (profiles.length === 0) profiles.push(newProfile('Персонаж 1', now))
  const activeId = profiles.some((p) => p.id === x.activeId) ? (x.activeId as string) : profiles[0].id
  const progress: Record<string, LevelingProgress> = {}
  for (const p of profiles) progress[p.id] = normProgress(x.progress?.[p.id], now)
  const c = (x.config ?? {}) as Partial<LevelingConfig>
  const px = unit(c.pos?.x)
  const py = unit(c.pos?.y)
  return {
    version: FILE_VERSION,
    profiles,
    activeId,
    progress,
    config: {
      overlay: typeof c.overlay === 'boolean' ? c.overlay : DEFAULT_CONFIG.overlay,
      collapsed: c.collapsed === true,
      pos: px !== null && py !== null ? { x: px, y: py } : null
    }
  }
}

export class LevelingStore extends EventEmitter {
  private f: LevelingFile | null = null
  private loading: Promise<void> | null = null
  private data: LevelingData | null = null
  private flatCache: { key: string; flat: FlatStep[] } | null = null
  private offRoute: number | null = null
  private log = { connected: false, logPath: null as string | null }
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly file: string,
    private readonly dataFile: string,
    private readonly now: () => number = () => Date.now()
  ) {
    super()
  }

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        this.f = normalizeLevelingFile(await readJson<unknown>(this.file, null), this.now())
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

  flat(): FlatStep[] {
    const v = this.progress.variant
    const key = `${v.leagueStart}|${v.bandit}`
    if (this.flatCache?.key !== key) this.flatCache = { key, flat: flattenRoute(this.getData(), v) }
    return this.flatCache.flat
  }

  state(): LevelingState {
    const f = this.file_
    return {
      profiles: f.profiles.map((p) => ({ ...p })),
      activeId: f.activeId,
      progress: { ...this.progress, done: { ...this.progress.done }, variant: { ...this.progress.variant } },
      config: { ...f.config, pos: f.config.pos ? { ...f.config.pos } : null },
      log: { ...this.log },
      offRoute: this.offRoute
    }
  }

  setLog(connected: boolean, logPath: string | null): void {
    if (this.log.connected === connected && this.log.logPath === logPath) return
    this.log = { connected, logPath }
    if (this.f) this.emit('changed', this.state())
  }

  // ---------------------------------------------------------------------------
  // Строки лога
  // ---------------------------------------------------------------------------

  /** Новые строки Client.txt: вход в зону → шаг, повышение уровня своего персонажа → уровень и класс. */
  ingestLines(lines: string[]): void {
    if (!this.f) return
    let changed = false
    for (const line of lines) {
      const e = parseLevelingLine(line)
      if (!e) continue
      const now = this.now()
      if (e.type === 'zone') {
        const r = enterZone(this.flat(), this.progress, e.areaId, now)
        this.progress = r.progress
        this.offRoute = r.offRoute
        changed = true
      } else {
        const profile = this.file_.profiles.find((p) => p.id === this.file_.activeId)!
        // свой персонаж — по имени; пока имя неизвестно, берём первое повышение уровня
        if (profile.character && profile.character !== e.character) continue
        if (!profile.character) profile.character = e.character
        profile.className = e.className
        profile.updatedAt = now
        this.progress = { ...this.progress, level: e.level, updatedAt: now }
        changed = true
      }
    }
    if (changed) this.changed()
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
    }
    this.offRoute = null
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
    if (typeof patch.overlay === 'boolean') c.overlay = patch.overlay
    if (typeof patch.collapsed === 'boolean') c.collapsed = patch.collapsed
    if ('pos' in patch) {
      const x = unit(patch.pos?.x)
      const y = unit(patch.pos?.y)
      c.pos = x !== null && y !== null ? { x, y } : null
    }
    this.changed()
    return this.state()
  }

  async createProfile(name: string): Promise<LevelingState> {
    await this.load()
    const now = this.now()
    const p = newProfile(name || `Персонаж ${this.file_.profiles.length + 1}`, now)
    this.file_.profiles.push(p)
    this.file_.progress[p.id] = emptyProgress(this.progress.variant, now)
    this.file_.activeId = p.id
    this.offRoute = null
    this.changed()
    return this.state()
  }

  async selectProfile(id: string): Promise<LevelingState> {
    await this.load()
    if (this.file_.profiles.some((p) => p.id === id)) {
      this.file_.activeId = id
      this.offRoute = null
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
      if (f.activeId === id) f.activeId = f.profiles[0].id
      this.offRoute = null
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
}
