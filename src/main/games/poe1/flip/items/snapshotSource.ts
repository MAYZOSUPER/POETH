// Снимок цен уников (S33) из ветки `prices` репозитория: index.json → файл лиги. Собирает его CI раз в час
// из poe.ninja (tools/data/ninja-snapshot.mjs) — приложение к poe.ninja не ходит. Ядро без electron: сеть и диск
// передаются снаружи (боевой экземпляр — ./ipc.ts, тесты — tests/flip/items/snapshotSource.test.ts).
// Раз в час, условным запросом (If-None-Match); ошибка сети — данные из кэша на диске.

import type { ItemSnapshot } from '@shared/types/flip'
import { leagueFile, parseIndex, parseSnapshot } from '@shared/flip/items/snapshot'

export const PRICES_BASE_URL = 'https://raw.githubusercontent.com/MAYZOSUPER/POETH/prices/'
export const SNAPSHOT_TTL_MS = 60 * 60_000
const RETRY_MS = 10 * 60_000

export interface GetResult {
  status: number
  body: string
  etag?: string
}

export interface SourceDeps {
  /** GET без cookies; 304 — без тела. Бросает при сетевой ошибке. */
  get: (rel: string, etag?: string) => Promise<GetResult>
  readCache: (rel: string) => Promise<unknown | null>
  writeCache: (rel: string, data: unknown) => Promise<void>
  now?: () => number
  log?: (msg: string) => void
}

interface CacheFile {
  league: string
  etag?: string
  fetchedAt: number
  snapshot: unknown
}

export interface LoadResult {
  snap: ItemSnapshot | null
  problem: 'net' | 'missing' | null
}

export class SnapshotSource {
  private mem = new Map<string, { snap: ItemSnapshot | null; etag?: string; checkedAt: number; problem: LoadResult['problem'] }>()
  private indexEtag: string | undefined
  private index: ReturnType<typeof parseIndex> = null
  private indexAt = 0
  private readonly now: () => number

  constructor(private readonly deps: SourceDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Когда проверим снова (мс) — для «обновим в …». */
  nextAt(league: string): number | null {
    const m = this.mem.get(league)
    if (!m) return null
    return m.checkedAt + (m.problem === 'net' ? RETRY_MS : SNAPSHOT_TTL_MS)
  }

  private cacheRel(league: string): string {
    return `items-${leagueFile(league)}`
  }

  private async fromDisk(league: string): Promise<{ snap: ItemSnapshot; etag?: string; fetchedAt: number } | null> {
    const raw = (await this.deps.readCache(this.cacheRel(league))) as Partial<CacheFile> | null
    if (!raw || raw.league !== league || typeof raw.fetchedAt !== 'number') return null
    const snap = parseSnapshot(raw.snapshot)
    return snap && snap.league === league ? { snap, etag: raw.etag, fetchedAt: raw.fetchedAt } : null
  }

  private async loadIndex(): Promise<void> {
    if (this.index && this.now() - this.indexAt < SNAPSHOT_TTL_MS / 2) return
    const res = await this.deps.get('index.json', this.index ? this.indexEtag : undefined)
    this.indexAt = this.now()
    if (res.status === 304 && this.index) return
    if (res.status !== 200) throw new Error(`index HTTP ${res.status}`)
    const idx = parseIndex(JSON.parse(res.body))
    if (!idx) throw new Error('index: не тот формат')
    this.index = idx
    this.indexEtag = res.etag
  }

  /** Снимок лиги: из памяти, если свежий; иначе — сеть (условно), при ошибке — диск. Не бросает. */
  async load(league: string, force = false): Promise<LoadResult> {
    const now = this.now()
    let have = this.mem.get(league)
    if (!have) {
      const disk = await this.fromDisk(league).catch(() => null)
      have = { snap: disk?.snap ?? null, etag: disk?.etag, checkedAt: disk ? disk.fetchedAt : 0, problem: null }
      this.mem.set(league, have)
    }
    const wait = have.problem === 'net' ? RETRY_MS : SNAPSHOT_TTL_MS
    if (!force && have.snap && now - have.checkedAt < wait) return { snap: have.snap, problem: have.problem }
    if (!force && have.problem === 'net' && now - have.checkedAt < RETRY_MS) return { snap: have.snap, problem: 'net' }
    try {
      await this.loadIndex()
      const entry = this.index?.leagues.find((l) => l.league === league)
      if (!entry) {
        Object.assign(have, { checkedAt: now, problem: 'missing' as const })
        return { snap: have.snap, problem: 'missing' }
      }
      const res = await this.deps.get(entry.file, have.snap ? have.etag : undefined)
      if (res.status === 304 && have.snap) {
        Object.assign(have, { checkedAt: now, problem: null })
        await this.save(league, have.snap, have.etag)
        return { snap: have.snap, problem: null }
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const snap = parseSnapshot(JSON.parse(res.body))
      if (!snap || snap.league !== league) throw new Error('снимок: не тот формат')
      Object.assign(have, { snap, etag: res.etag, checkedAt: now, problem: null })
      await this.save(league, snap, res.etag)
      return { snap, problem: null }
    } catch (e) {
      this.deps.log?.(`[itemflip] снимок цен: ${e instanceof Error ? e.message : 'ошибка'}, данные из кэша`)
      Object.assign(have, { checkedAt: now, problem: 'net' as const })
      return { snap: have.snap, problem: 'net' }
    }
  }

  private async save(league: string, snap: ItemSnapshot, etag: string | undefined): Promise<void> {
    const data: CacheFile = { league, fetchedAt: this.now(), snapshot: { v: 1, ...snap } }
    if (etag) data.etag = etag
    await this.deps.writeCache(this.cacheRel(league), data).catch(() => undefined)
  }
}
