import { app } from 'electron'
import path from 'path'
import type { LootFilterLevel, LootFilterPrefs, LootFilterRelease, LootFilterStyle } from '@shared/types/lootFilter'
import { DEFAULT_LEVEL, DEFAULT_STYLE, isLevel, isStyle } from '@shared/lootFilter/levels'
import { isSafeTag, parseRelease } from '@shared/lootFilter/source'
import { isOurFileName } from '@shared/lootFilter/rules'
import { readJson, writeJsonAtomic } from '../services/atomicJson'

// Состояние фильтра лута (S53): %APPDATA%/POETH/lootfilter.json — выбор игрока (уровень, стиль, «Проверять»),
// своя папка фильтров (если выбрана), последний известный релиз и когда спрашивали GitHub, и что POETH поставил:
// имя своего файла, тег, стиль, SHA-256 и размер записанного (по ним видно, менял ли игрок файл).
// Ни текста фильтра, ни данных игрока здесь нет.

export interface InstalledRecord {
  file: string
  level: LootFilterLevel
  style: LootFilterStyle
  tag: string
  sha256: string
  size: number
  installedAt: string
  /** папка, куда записали (файл другой папки — не наш) */
  dir: string
}

export interface LootFilterData {
  prefs: LootFilterPrefs
  /** папка фильтров, выбранная игроком; null — по умолчанию (Документы/My Games/Path of Exile) */
  dir: string | null
  latest: LootFilterRelease | null
  lastCheckAt: number | null
  /** о каком теге уже напомнили уведомлением (раз на версию) */
  notifiedTag: string | null
  installed: InstalledRecord[]
}

export const EMPTY_DATA: LootFilterData = {
  prefs: { level: DEFAULT_LEVEL, style: DEFAULT_STYLE, autoCheck: false },
  dir: null,
  latest: null,
  lastCheckAt: null,
  notifiedTag: null,
  installed: []
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const str = (v: unknown, max = 1024): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

function normalizeInstalled(raw: unknown): InstalledRecord[] {
  if (!Array.isArray(raw)) return []
  const out: InstalledRecord[] = []
  for (const x of raw.slice(0, 20)) {
    const r = obj(x)
    if (!isOurFileName(r.file) || !isLevel(r.level) || !isStyle(r.style) || !isSafeTag(r.tag)) continue
    const sha = str(r.sha256, 64)
    const dir = str(r.dir)
    if (!sha || !/^[0-9a-f]{64}$/.test(sha) || !dir || !path.isAbsolute(dir)) continue
    if (typeof r.size !== 'number' || !Number.isInteger(r.size) || r.size < 0) continue
    const at = str(r.installedAt, 40) ?? ''
    out.push({ file: r.file, level: r.level, style: r.style, tag: r.tag, sha256: sha, size: r.size, installedAt: at, dir })
  }
  return out
}

/** Файл с диска → данные; всё непонятное отбрасывается. */
export function normalizeLootFilterData(raw: unknown): LootFilterData {
  const r = obj(raw)
  const p = obj(r.prefs)
  const dir = str(r.dir)
  const last = typeof r.lastCheckAt === 'number' && Number.isFinite(r.lastCheckAt) && r.lastCheckAt > 0 ? r.lastCheckAt : null
  const latestRaw = obj(r.latest)
  const latest = parseRelease({ tag_name: latestRaw.tag, name: latestRaw.name, published_at: latestRaw.publishedAt })
  return {
    prefs: {
      level: isLevel(p.level) ? p.level : DEFAULT_LEVEL,
      style: isStyle(p.style) ? p.style : DEFAULT_STYLE,
      autoCheck: p.autoCheck === true
    },
    dir: dir && path.isAbsolute(dir) ? dir : null,
    latest,
    lastCheckAt: last,
    notifiedTag: isSafeTag(r.notifiedTag) ? r.notifiedTag : null,
    installed: normalizeInstalled(r.installed)
  }
}

let cache: LootFilterData | null = null
let writing: Promise<void> = Promise.resolve()

function dataFile(): string {
  return path.join(app.getPath('userData'), 'lootfilter.json')
}

export async function getLootFilterData(): Promise<LootFilterData> {
  if (!cache) cache = normalizeLootFilterData(await readJson<unknown>(dataFile(), null))
  return cache
}

/** Правка и запись по очереди; запись ждём (установка должна знать, что манифест сохранён). */
export async function updateLootFilterData(fn: (d: LootFilterData) => LootFilterData): Promise<LootFilterData> {
  const next = fn(await getLootFilterData())
  cache = next
  writing = writing.then(() => writeJsonAtomic(dataFile(), { v: 1, ...next })).catch((e) => {
    console.error('[lootfilter] не удалось сохранить lootfilter.json:', e)
  })
  await writing
  return next
}
