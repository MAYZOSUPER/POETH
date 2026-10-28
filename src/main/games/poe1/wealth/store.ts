// Хранение учёта богатства (S11a) — userData/wealth/, без новых нативных модулей:
//   config.json        — настройки, имя аккаунта (если ввели), выбор вкладок по лигам, сессия фарма
//                        (atomicJson: временный файл + rename);
//   history.ndjson     — итоги ВСЕХ снимков (одна строка — один WealthSummary), только дописывается;
//   snapshots/<id>.json — детали (строки предметов) последних KEEP_DETAILED снимков;
//   prices/…           — кэш цен (фид обмена по часам, poe.watch).
// Ядро без electron: корневая папка передаётся снаружи (тесты — tests/wealth/store.test.ts).
// node:sqlite в Electron 40 (Node 24.15) доступен без флагов, но для «дописать строку + последние
// 10 файлов» он не нужен.

import { promises as fs } from 'fs'
import path from 'path'
import type { WealthFarmSession, WealthOptions, WealthSnapshot, WealthSummary } from '@shared/types/wealth'
import type { StashTabInfo } from '@shared/wealth/stash'
import { DEFAULT_AUTO_INTERVAL_MIN, MAX_AUTO_INTERVAL_MIN, MIN_AUTO_INTERVAL_MIN } from '@shared/wealth/tabs'
import { readJson, writeJsonAtomic } from '../../../services/atomicJson'

export const KEEP_DETAILED = 10

export interface WealthConfig {
  version: 1
  options: WealthOptions
  /** введённое вручную имя аккаунта (иначе — из сессии сайта) */
  accountName?: string
  /** выбранные вкладки по лигам (id); нет ключа — выбор по умолчанию */
  selected: Record<string, string[]>
  /** последний список вкладок по лигам */
  tabs: Record<string, { at: number; list: StashTabInfo[] }>
  session: WealthFarmSession | null
}

export const DEFAULT_OPTIONS: WealthOptions = {
  autoEnabled: true,
  autoIntervalMin: DEFAULT_AUTO_INTERVAL_MIN,
  poeWatch: true
}

function sanitizeOptions(o: Partial<WealthOptions> | undefined): WealthOptions {
  const iv = Number(o?.autoIntervalMin)
  return {
    autoEnabled: o?.autoEnabled !== false,
    autoIntervalMin: Number.isFinite(iv)
      ? Math.min(MAX_AUTO_INTERVAL_MIN, Math.max(MIN_AUTO_INTERVAL_MIN, Math.round(iv)))
      : DEFAULT_AUTO_INTERVAL_MIN,
    poeWatch: o?.poeWatch !== false
  }
}

export function sanitizeConfig(raw: unknown): WealthConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<WealthConfig>
  const selected: Record<string, string[]> = {}
  for (const [lg, ids] of Object.entries(r.selected ?? {})) {
    if (Array.isArray(ids)) selected[lg] = ids.filter((x): x is string => typeof x === 'string').slice(0, 100)
  }
  const tabs: WealthConfig['tabs'] = {}
  for (const [lg, t] of Object.entries(r.tabs ?? {})) {
    if (t && typeof t.at === 'number' && Array.isArray(t.list)) tabs[lg] = { at: t.at, list: t.list }
  }
  const s = r.session
  const session =
    s && typeof s.league === 'string' && typeof s.startedAt === 'number' && typeof s.startId === 'string' && typeof s.startChaos === 'number'
      ? s
      : null
  const cfg: WealthConfig = { version: 1, options: sanitizeOptions(r.options), selected, tabs, session }
  if (typeof r.accountName === 'string' && r.accountName) cfg.accountName = r.accountName
  return cfg
}

function isSummary(v: unknown): v is WealthSummary {
  const s = v as WealthSummary
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.at === 'number' &&
    typeof s.league === 'string' &&
    typeof s.chaos === 'number' &&
    Array.isArray(s.tabs)
  )
}

/** Строки history.ndjson → итоги (битые строки пропускаются — например, оборванная запись). */
export function parseHistory(text: string): WealthSummary[] {
  const out: WealthSummary[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const v = JSON.parse(t) as unknown
      if (isSummary(v)) out.push(v)
    } catch {
      // оборванная строка — пропускаем
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/

export class WealthStore {
  constructor(readonly root: string) {}

  private p(...parts: string[]): string {
    return path.join(this.root, ...parts)
  }

  async loadConfig(): Promise<WealthConfig> {
    return sanitizeConfig(await readJson<unknown>(this.p('config.json'), null))
  }

  async saveConfig(cfg: WealthConfig): Promise<void> {
    await writeJsonAtomic(this.p('config.json'), cfg)
  }

  async loadHistory(): Promise<WealthSummary[]> {
    try {
      return parseHistory(await fs.readFile(this.p('history.ndjson'), 'utf8'))
    } catch {
      return []
    }
  }

  /** Дописать итог снимка (одна строка; при обрыве записи битой будет только она). */
  async appendHistory(s: WealthSummary): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    const handle = await fs.open(this.p('history.ndjson'), 'a')
    try {
      await handle.writeFile(`${JSON.stringify(s)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async saveDetail(snap: WealthSnapshot): Promise<void> {
    if (!ID_RE.test(snap.summary.id)) throw new Error('bad snapshot id')
    await writeJsonAtomic(this.p('snapshots', `${snap.summary.id}.json`), snap)
  }

  async loadDetail(id: string): Promise<WealthSnapshot | null> {
    if (!ID_RE.test(id)) return null
    const v = await readJson<WealthSnapshot | null>(this.p('snapshots', `${id}.json`), null)
    return v && isSummary(v.summary) && Array.isArray(v.lines) ? v : null
  }

  /** id снимков с деталями, от старых к новым. */
  async detailedIds(): Promise<string[]> {
    let files: string[]
    try {
      files = await fs.readdir(this.p('snapshots'))
    } catch {
      return []
    }
    const ids = files.map((f) => /^([A-Za-z0-9_-]{6,64})\.json$/.exec(f)?.[1]).filter((x): x is string => !!x)
    // id начинается с времени в base36 фиксированной длины — сортировка строк = по времени
    return ids.sort()
  }

  /** Оставить детали только последних `keep` снимков (+ закреплённые: начало идущей сессии). */
  async pruneDetails(keep = KEEP_DETAILED, pinned: readonly string[] = []): Promise<string[]> {
    const ids = await this.detailedIds()
    const drop = ids.slice(0, Math.max(0, ids.length - keep)).filter((id) => !pinned.includes(id))
    for (const id of drop) {
      await fs.rm(this.p('snapshots', `${id}.json`), { force: true })
      await fs.rm(this.p('snapshots', `${id}.json.bak`), { force: true })
    }
    return ids.filter((id) => !drop.includes(id))
  }

  // ---- кэш цен (PriceDeps)

  private cachePath(rel: string): string {
    if (!/^[a-z]+\/[A-Za-z0-9_.-]+$/.test(rel) || rel.includes('..')) throw new Error('bad cache path')
    return this.p('prices', rel)
  }

  async readCache(rel: string): Promise<unknown | null> {
    try {
      return JSON.parse(await fs.readFile(this.cachePath(rel), 'utf8')) as unknown
    } catch {
      return null
    }
  }

  async writeCache(rel: string, data: unknown): Promise<void> {
    const file = this.cachePath(rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
    await fs.rename(tmp, file)
  }

  async listCache(relDir: string): Promise<string[]> {
    if (!/^[a-z]+$/.test(relDir)) return []
    try {
      return await fs.readdir(this.p('prices', relDir))
    } catch {
      return []
    }
  }

  async removeCache(rel: string): Promise<void> {
    await fs.rm(this.cachePath(rel), { force: true })
  }
}

/** id снимка: время (base36, 9 знаков — сортируется как строка) + случайный хвост. */
export function newSnapshotId(at: number, rand: () => number = Math.random): string {
  const t = Math.max(0, Math.floor(at)).toString(36).padStart(9, '0')
  const r = Math.floor(rand() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
  return `${t}-${r}`
}
