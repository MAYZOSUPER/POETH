import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import path from 'path'
import type { GameId } from '@shared/games'
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
import { filterSource, isNewerTag, latestReleaseUrl, parseRelease } from '@shared/lootFilter/source'
import { installedFileName, shouldCheck } from '@shared/lootFilter/rules'
import { getJson, lootFilterGet, ZIP_MAX_BYTES, ZIP_TIMEOUT_MS } from './fetch'
import { fileFacts, installFilter, recordFor, withRecord, type Net } from './install'
import { getLootFilterData, updateLootFilterData, type LootFilterData } from './store'

// Фильтр лута NeverSink (S53, main): папка фильтров игры, состояние экрана, проверка новой версии, установка.
// Папка: POETH_LOOTFILTER_DIR (подмена для проверок и тестов) → выбранная игроком → Документы/My Games/Path of Exile
// (app.getPath('documents') — с учётом переноса «Документов», например в OneDrive). POETH пишет туда только
// свои POETH-NeverSink-<уровень>.filter (и временный файл на время записи); чужие файлы не читает и не трогает.
// S64: то же для PoE 2 — игра запущенного режима (setLootFilterGame) выбирает репозиторий NeverSink, папку
// «Документы/My Games/Path of Exile 2» и свой файл состояния. Путь с кириллицей Node пишет как есть (тест на
// временной папке); видит ли его игра — проверка в игре, а для экрана есть флаг folder.nonAscii.

export const DIR_ENV = 'POETH_LOOTFILTER_DIR'

let busy = false
let checkError: LootFilterError | null = null
/** игра, для которой включён раздел; null — выключен */
let game: GameId | null = null

export function setLootFilterGame(g: GameId | null): void {
  if (g !== game) checkError = null
  game = g
}

/** Совместимость с S53: включить раздел для PoE 1 / выключить. */
export function setLootFilterEnabled(on: boolean): void {
  setLootFilterGame(on ? 'poe1' : null)
}

export function lootFilterGame(): GameId {
  return game ?? 'poe1'
}

export function defaultFolderPath(g: GameId = 'poe1'): string {
  return path.join(app.getPath('documents'), ...filterSource(g).docsDir)
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** В пути есть символы вне ASCII (кириллица в имени пользователя или «Документах»). */
export function hasNonAscii(p: string): boolean {
  return /[^ -~]/.test(p)
}

export function folderOf(d: LootFilterData, g: GameId = lootFilterGame()): LootFilterFolder {
  const env = process.env[DIR_ENV]
  const [p, source]: [string, LootFilterFolder['source']] =
    env && path.isAbsolute(env) ? [path.resolve(env), 'env'] : d.dir ? [d.dir, 'custom'] : [defaultFolderPath(g), 'default']
  const found = isDir(p)
  const looksLikeGame = found && filterSource(g).configFiles.some((f) => existsSync(path.join(p, f)))
  return { path: p, source, found, looksLikeGame, nonAscii: hasNonAscii(p) }
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
  const g = lootFilterGame()
  const d = await getLootFilterData(g)
  const folder = folderOf(d, g)
  return {
    on: game !== null,
    game: g,
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
 * (screenOpen) или с галочкой «Проверять». Один запрос к API релизов фильтра текущей игры.
 */
export async function checkLatest(
  screenOpen: boolean,
  now = Date.now(),
  onStart?: (state: LootFilterState) => void
): Promise<CheckOutcome> {
  const g = game
  if (!g || busy) return { state: await getLootFilterState(), newTag: null }
  const d = await getLootFilterData(g)
  if (!shouldCheck({ now, lastCheckAt: d.lastCheckAt, screenOpen, autoCheck: d.prefs.autoCheck })) {
    return { state: await getLootFilterState(), newTag: null }
  }
  busy = true
  try {
    onStart?.(await getLootFilterState())
    const r = await net.json(latestReleaseUrl(g))
    const release = r.ok ? parseRelease(r.json) : null
    checkError = r.ok ? (release ? null : 'bad-release') : r.error
    const next = await updateLootFilterData((x) => ({ ...x, lastCheckAt: now, latest: release ?? x.latest }), g)
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
  await updateLootFilterData((x) => ({ ...x, notifiedTag: tag }), lootFilterGame())
}

/** «Установить» / «Обновить» — действие игрока: свежий релиз с GitHub всегда. */
export async function installLootFilter(raw: unknown): Promise<LootFilterInstallResult> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const g = game
  if (!g) return { ok: false, error: 'refused', state: await getLootFilterState() }
  if (!isLevel(r.level) || !isStyle(r.style, g)) return { ok: false, error: 'refused', state: await getLootFilterState() }
  if (busy) return { ok: false, error: 'busy', state: await getLootFilterState() }
  const req: LootFilterInstallRequest = { level: r.level, style: r.style, confirm: r.confirm === true }
  busy = true
  try {
    const d = await getLootFilterData(g)
    const folder = folderOf(d, g)
    if (!folder.found) return { ok: false, error: 'no-folder', state: await finishBusy() }
    const out = await installFilter({ req, dir: folder.path, records: d.installed, net, game: g })
    const now = Date.now()
    if (out.release) checkError = null
    await updateLootFilterData(
      (x) => ({
        ...x,
        prefs: { ...x.prefs, level: req.level, style: req.style },
        latest: out.release ?? x.latest,
        lastCheckAt: out.release ? now : x.lastCheckAt,
        installed: out.ok ? withRecord(x.installed, out.record) : x.installed
      }),
      g
    )
    const state = await finishBusy()
    if (out.ok) return { ok: true, state, file: out.record.file, tag: out.release.tag }
    return { ok: false, state, error: out.error, confirm: out.confirm, file: out.confirm ? installedFileName(req.level) : undefined }
  } catch (e) {
    console.warn('[lootfilter] установка:', (e as Error).message)
    return { ok: false, error: 'write-failed', state: await finishBusy() }
  }
}

export async function setLootFilterPrefs(raw: unknown): Promise<LootFilterState> {
  const g = lootFilterGame()
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof LootFilterPrefs, unknown>>
  await updateLootFilterData(
    (x) => ({
      ...x,
      prefs: {
        level: isLevel(p.level) ? p.level : x.prefs.level,
        style: isStyle(p.style, g) ? p.style : x.prefs.style,
        autoCheck: typeof p.autoCheck === 'boolean' ? p.autoCheck : x.prefs.autoCheck
      }
    }),
    g
  )
  return getLootFilterState()
}

/** Своя папка фильтров (выбрана в диалоге) или null — снова по умолчанию. */
export async function setLootFilterDir(dir: string | null): Promise<LootFilterState> {
  if (dir !== null && (!path.isAbsolute(dir) || !isDir(dir))) return getLootFilterState()
  await updateLootFilterData((x) => ({ ...x, dir: dir === null ? null : path.resolve(dir) }), lootFilterGame())
  return getLootFilterState()
}
