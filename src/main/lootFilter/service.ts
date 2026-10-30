import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import path from 'path'
import type {
  LootFilterError,
  LootFilterFolder,
  LootFilterInstallRequest,
  LootFilterInstallResult,
  LootFilterInstalled,
  LootFilterPrefs,
  LootFilterState
} from '@shared/types/lootFilter'
import { isLevel, isStyle } from '@shared/lootFilter/levels'
import { LATEST_RELEASE_URL, isNewerTag, parseRelease } from '@shared/lootFilter/source'
import { installedFileName, shouldCheck } from '@shared/lootFilter/rules'
import { getJson, lootFilterGet, ZIP_MAX_BYTES, ZIP_TIMEOUT_MS } from './fetch'
import { fileFacts, installFilter, recordFor, withRecord, type Net } from './install'
import { getLootFilterData, updateLootFilterData, type LootFilterData } from './store'

// Фильтр лута NeverSink (S53, main): папка фильтров PoE 1, состояние экрана, проверка новой версии, установка.
// Папка: POETH_LOOTFILTER_DIR (подмена для проверок и тестов) → выбранная игроком → Документы/My Games/Path of Exile
// (app.getPath('documents') — с учётом переноса «Документов», например в OneDrive). POETH пишет туда только
// свои POETH-NeverSink-<уровень>.filter (и временный файл на время записи); чужие файлы не читает и не трогает.

export const DIR_ENV = 'POETH_LOOTFILTER_DIR'

let busy = false
let checkError: LootFilterError | null = null
let enabled = false

export function setLootFilterEnabled(on: boolean): void {
  enabled = on
}

export function defaultFolderPath(): string {
  return path.join(app.getPath('documents'), 'My Games', 'Path of Exile')
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function folderOf(d: LootFilterData): LootFilterFolder {
  const env = process.env[DIR_ENV]
  const [p, source]: [string, LootFilterFolder['source']] =
    env && path.isAbsolute(env) ? [path.resolve(env), 'env'] : d.dir ? [d.dir, 'custom'] : [defaultFolderPath(), 'default']
  const found = isDir(p)
  return { path: p, source, found, looksLikeGame: found && existsSync(path.join(p, 'production_Config.ini')) }
}

async function installedView(d: LootFilterData, folder: LootFilterFolder): Promise<LootFilterInstalled[]> {
  const mine = d.installed.filter((r) => recordFor([r], folder.path, r.file))
  const out: LootFilterInstalled[] = []
  for (const r of mine) {
    const f = await fileFacts(path.join(folder.path, r.file))
    const missing = !f.exists
    out.push({
      file: r.file,
      level: r.level,
      style: r.style,
      tag: r.tag,
      installedAt: r.installedAt,
      size: r.size,
      missing,
      modified: !missing && (!f.regularFile || f.sha !== r.sha256),
      outdated: !!d.latest && isNewerTag(d.latest.tag, r.tag)
    })
  }
  return out.sort((a, b) => a.level - b.level)
}

export async function getLootFilterState(): Promise<LootFilterState> {
  const d = await getLootFilterData()
  const folder = folderOf(d)
  return {
    on: enabled,
    folder,
    prefs: d.prefs,
    latest: d.latest,
    lastCheckAt: d.lastCheckAt,
    busy,
    installed: folder.found ? await installedView(d, folder) : [],
    checkError
  }
}

const net: Net = {
  json: getJson,
  zip: (url) => lootFilterGet(url, { kind: 'zip', maxBytes: ZIP_MAX_BYTES, timeoutMs: ZIP_TIMEOUT_MS })
}

export interface CheckOutcome {
  state: LootFilterState
  /** нашли версию новее установленной, о которой ещё не напоминали (для уведомления при «Проверять») */
  newTag: string | null
}

/**
 * Проверка новой версии без нажатия «Установить»: не чаще раза в сутки и только при открытом экране
 * (screenOpen) или с галочкой «Проверять». Один запрос к API релизов.
 */
export async function checkLatest(screenOpen: boolean, now = Date.now()): Promise<CheckOutcome> {
  const d = await getLootFilterData()
  if (!enabled || busy || !shouldCheck({ now, lastCheckAt: d.lastCheckAt, screenOpen, autoCheck: d.prefs.autoCheck })) {
    return { state: await getLootFilterState(), newTag: null }
  }
  busy = true
  try {
    const r = await net.json(LATEST_RELEASE_URL)
    const release = r.ok ? parseRelease(r.json) : null
    checkError = r.ok ? (release ? null : 'bad-release') : r.error
    const next = await updateLootFilterData((x) => ({ ...x, lastCheckAt: now, latest: release ?? x.latest }))
    let newTag: string | null = null
    if (release && next.notifiedTag !== release.tag && next.installed.some((i) => isNewerTag(release.tag, i.tag))) {
      newTag = release.tag
    }
    return { state: await finishBusy(), newTag }
  } catch {
    checkError = 'network'
    return { state: await finishBusy(), newTag: null }
  }
}

async function finishBusy(): Promise<LootFilterState> {
  busy = false
  return getLootFilterState()
}

export async function markNotified(tag: string): Promise<void> {
  await updateLootFilterData((x) => ({ ...x, notifiedTag: tag }))
}

/** «Установить» / «Обновить» — действие игрока: свежий релиз с GitHub всегда. */
export async function installLootFilter(raw: unknown): Promise<LootFilterInstallResult> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  if (!enabled) return { ok: false, error: 'refused', state: await getLootFilterState() }
  if (!isLevel(r.level) || !isStyle(r.style)) return { ok: false, error: 'refused', state: await getLootFilterState() }
  if (busy) return { ok: false, error: 'busy', state: await getLootFilterState() }
  const req: LootFilterInstallRequest = { level: r.level, style: r.style, confirm: r.confirm === true }
  busy = true
  try {
    const d = await getLootFilterData()
    const folder = folderOf(d)
    if (!folder.found) return { ok: false, error: 'no-folder', state: await finishBusy() }
    const out = await installFilter({ req, dir: folder.path, records: d.installed, net })
    const now = Date.now()
    if (out.release) checkError = null
    await updateLootFilterData((x) => ({
      ...x,
      prefs: { ...x.prefs, level: req.level, style: req.style },
      latest: out.release ?? x.latest,
      lastCheckAt: out.release ? now : x.lastCheckAt,
      installed: out.ok ? withRecord(x.installed, out.record) : x.installed
    }))
    const state = await finishBusy()
    if (out.ok) return { ok: true, state, file: out.record.file, tag: out.release.tag }
    return { ok: false, state, error: out.error, confirm: out.confirm, file: out.confirm ? installedFileName(req.level) : undefined }
  } catch (e) {
    console.warn('[lootfilter] установка:', (e as Error).message)
    return { ok: false, error: 'write-failed', state: await finishBusy() }
  }
}

export async function setLootFilterPrefs(raw: unknown): Promise<LootFilterState> {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof LootFilterPrefs, unknown>>
  await updateLootFilterData((x) => ({
    ...x,
    prefs: {
      level: isLevel(p.level) ? p.level : x.prefs.level,
      style: isStyle(p.style) ? p.style : x.prefs.style,
      autoCheck: typeof p.autoCheck === 'boolean' ? p.autoCheck : x.prefs.autoCheck
    }
  }))
  return getLootFilterState()
}

/** Своя папка фильтров (выбрана в диалоге) или null — снова по умолчанию. */
export async function setLootFilterDir(dir: string | null): Promise<LootFilterState> {
  if (dir !== null && (!path.isAbsolute(dir) || !isDir(dir))) return getLootFilterState()
  await updateLootFilterData((x) => ({ ...x, dir: dir === null ? null : path.resolve(dir) }))
  return getLootFilterState()
}
