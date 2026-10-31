// Хранение «Богатства PoE 2» (S70) — userData/wealth-poe2/, отдельно от PoE 1 (userData/wealth/):
//   sources.json        — источники по лигам: ручной ввод, золото, ценные предметы, принятые вкладки снимка
//                         (atomicJson);
//   session.json        — прибыль сессии фарма: снимок начала, граница забегов, последняя группа (atomicJson);
//   history.ndjson      — итоги снимков, только дописывается; правка последнего снимка (ввод подряд) — та же
//                         строка с тем же id ещё раз, при чтении побеждает последняя (сжатие — при запуске);
//   snapshots/<id>.json — детали последних снимков (как у PoE 1).
// История и детали — тем же WealthStore, что у PoE 1 (src/main/games/poe1/wealth/store.ts). Снимков экрана здесь
// нет: в источник попадают только имена и числа, которые игрок принял.

import { promises as fs } from 'fs'
import path from 'path'
import type { Poe2Sources, Poe2WealthSession, WealthSummary } from '@shared/types/wealth'
import { sanitizeSources } from '@shared/wealth/poe2'
import { readJson, writeJsonAtomic } from '../../../services/atomicJson'
import { WealthStore } from '../../poe1/wealth/store'

const MAX_LEAGUES = 20

/** sources.json → источники по лигам; битое отбрасывается. */
export function sanitizeLeagues(raw: unknown): Record<string, Poe2Sources> {
  const r = raw as { version?: unknown; leagues?: unknown } | null
  const out: Record<string, Poe2Sources> = {}
  if (!r || typeof r !== 'object' || r.version !== 1 || !r.leagues || typeof r.leagues !== 'object') return out
  for (const [league, s] of Object.entries(r.leagues as Record<string, unknown>)) {
    if (!league || league.length > 100 || Object.keys(out).length >= MAX_LEAGUES) continue
    out[league] = sanitizeSources(s)
  }
  return out
}

/**
 * Связка сессии фарма трекера карт PoE 2 (S69) со снимками богатства: прибыль сессии — одним числом
 * (setSessionProfit), отсчёт — снимок при «Начать», конец — первый ввод или снимок вкладок после «Стоп».
 */
export interface Poe2SessionLink {
  /** лига сессии */
  league: string | null
  session: Poe2WealthSession | null
  /** id сессии трекера карт */
  farmId: string | null
  /** забег сессии уже начинался — отсчёт больше не сдвигается */
  runStarted: boolean
}

export function emptyLink(): Poe2SessionLink {
  return { league: null, session: null, farmId: null, runStarted: false }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const okId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
const okNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function sanitizeLink(raw: unknown): Poe2SessionLink {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Poe2SessionLink>
  const out = emptyLink()
  if (typeof r.league === 'string' && r.league && r.league.length <= 100) out.league = r.league
  const s = r.session as Poe2WealthSession | null | undefined
  if (s && okNum(s.startedAt) && okId(s.startId) && okNum(s.startEx)) {
    const session: Poe2WealthSession = { startedAt: s.startedAt, startId: s.startId, startEx: s.startEx }
    if (okNum(s.stoppedAt)) session.stoppedAt = s.stoppedAt
    if (okId(s.endId) && okNum(s.endEx)) {
      session.endId = s.endId
      session.endEx = s.endEx
    }
    if (okNum(s.profitEx)) session.profitEx = s.profitEx
    if (s.low === true) session.low = true
    if (s.awaitingEnd === true) session.awaitingEnd = true
    out.session = session
  }
  if (okId(r.farmId)) out.farmId = r.farmId
  if (r.runStarted === true) out.runStarted = true
  return out
}

/** Итоги истории без повторов: у одного id — последняя запись (правка снимка дописывает строку заново). */
export function dedupeHistory(list: readonly WealthSummary[]): WealthSummary[] {
  const byId = new Map<string, WealthSummary>()
  for (const s of list) byId.set(s.id, s)
  return [...byId.values()].sort((a, b) => a.at - b.at)
}

export class Poe2WealthStore extends WealthStore {
  constructor(root: string) {
    super(root)
  }

  /** Источники по лигам (у новой лиги — свой тайник и своё богатство). */
  async loadSources(): Promise<Record<string, Poe2Sources>> {
    return sanitizeLeagues(await readJson<unknown>(path.join(this.root, 'sources.json'), null))
  }

  async saveSources(byLeague: Record<string, Poe2Sources>): Promise<void> {
    await writeJsonAtomic(path.join(this.root, 'sources.json'), { version: 1, leagues: byLeague })
  }

  async loadLink(): Promise<Poe2SessionLink> {
    return sanitizeLink(await readJson<unknown>(path.join(this.root, 'session.json'), null))
  }

  async saveLink(link: Poe2SessionLink): Promise<void> {
    await writeJsonAtomic(path.join(this.root, 'session.json'), link)
  }

  /** История без повторов; если повторов много — файл переписывается сжатым (временный файл + rename). */
  async loadHistoryCompact(): Promise<WealthSummary[]> {
    const all = await this.loadHistory()
    const list = dedupeHistory(all)
    if (all.length > 50 && all.length > list.length * 2) {
      const file = path.join(this.root, 'history.ndjson')
      const tmp = `${file}.tmp`
      await fs.writeFile(tmp, list.map((s) => `${JSON.stringify(s)}\n`).join(''), 'utf8')
      await fs.rename(tmp, file)
    }
    return list
  }
}
