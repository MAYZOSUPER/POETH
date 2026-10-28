// Чистая логика запуска и обновлений (S10a): сравнение версий, «показывать ли окно
// обновления», текст «что нового», решение при старте (экран загрузки, компаньон),
// автозапуск с Windows, проверка манифеста данных. Без electron — tests/updates/**.

import type { DataManifest } from './types/updates'
import { isGameId, type GameId } from './games'
import { RELEASES_URL } from './links'

// ---------------------------------------------------------------------------
// Версии (semver: 1.2.3, 1.2.3-beta.1; «v» в начале допускается)
// ---------------------------------------------------------------------------

interface SemVer {
  nums: [number, number, number]
  pre: string[]
}

function parseSemver(v: string): SemVer | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim())
  if (!m) return null
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
}

/** a < b → -1, a = b → 0, a > b → 1; нераспознанная версия считается самой старой. */
export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1
  }
  // 1.0.0-beta < 1.0.0
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/**
 * Показывать ли окно «Вышло обновление»: версия новее установленной и игрок не отложил
 * именно её («Позже» действует до следующего запуска приложения).
 */
export function shouldOfferUpdate(current: string, available: string, snoozedVersion: string | null): boolean {
  if (compareVersions(available, current) <= 0) return false
  return snoozedVersion === null || compareVersions(available, snoozedVersion) !== 0
}

const NOTES_MAX = 1200

/**
 * «Что нового» простым текстом: описание релиза GitHub приходит HTML (или массивом заметок
 * по версиям) — убираем теги, сущности и лишние пустые строки, обрезаем по длине.
 */
export function releaseNotesText(notes: unknown, lang?: 'ru' | 'en'): string {
  let raw = ''
  if (typeof notes === 'string') raw = notes
  else if (Array.isArray(notes)) {
    raw = notes
      .map((n) => (typeof n === 'object' && n && typeof (n as { note?: unknown }).note === 'string' ? (n as { note: string }).note : ''))
      .filter(Boolean)
      .join('\n')
  }
  const text = raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|li|h\d|div)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split(/\r?\n/)
    .map((l) => markdownLine(l.replace(/[ \t]+/g, ' ').trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const mine = lang ? notesSection(text, lang) : text
  return mine.length > NOTES_MAX ? `${mine.slice(0, NOTES_MAX - 1).trimEnd()}…` : mine
}

/** Markdown (latest.yml с generic-сервера) → простой текст: заголовки, **жирный**, `код`, [ссылка](url), «- ». */
function markdownLine(l: string): string {
  return l
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|#)[^)]*\)/g, '$1')
}

const NOTES_HEAD = { ru: /^Что нового:?$/im, en: /^What[’']s new:?$/im }

/**
 * Описание релиза двуязычное (build/release-notes.md: «Что нового» и «What's new») — в окно
 * обновления только раздел языка интерфейса, без заголовка (он уже есть в окне). Нет обоих
 * заголовков — текст как есть.
 */
function notesSection(text: string, lang: 'ru' | 'en'): string {
  const own = NOTES_HEAD[lang].exec(text)
  const other = NOTES_HEAD[lang === 'ru' ? 'en' : 'ru'].exec(text)
  if (!own || !other) return text
  const start = own.index + own[0].length
  const end = other.index > own.index ? other.index : text.length
  return text.slice(start, end).trim()
}

/**
 * Адрес тестового сервера обновлений/данных (POETH_UPDATE_URL, POETH_DATA_MANIFEST_URL):
 * только http на loopback — иначе переменная окружения подменила бы источник обновлений.
 */
export function loopbackUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]'
    return u.protocol === 'http:' && loopback ? u.toString() : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------

export interface StartupInput {
  /** мастер первого запуска ещё не пройден (!settings.startup.firstRunDone) */
  firstRun: boolean
  /** запущен Windows при входе (аргумент --autostart) */
  autostarted: boolean
  /** настройка «Запускать свёрнутым» */
  minimized: boolean
  game: GameId
}

export interface StartupPlan {
  /** экран загрузки (не при автозапуске — тихо в трей) */
  splash: boolean
  /** открыть окно компаньона */
  showCompanion: boolean
}

/**
 * Как APT/Sidekick: POETH живёт в трее, большое окно само не открывается — кроме первого
 * запуска и если снят флажок «Запускать свёрнутым». PoE2: компаньон — это трекер кампании,
 * при ручном запуске он открывается как раньше (свёрнутым — только при автозапуске).
 */
export function decideStartup(i: StartupInput): StartupPlan {
  const showCompanion = i.firstRun || (i.game === 'poe2' ? !(i.autostarted && i.minimized) : !i.minimized)
  return { splash: !i.autostarted, showCompanion }
}

export const AUTOSTART_ARG = '--autostart'

/**
 * Параметры app.setLoginItemSettings для «Запускать вместе с Windows». null — не трогать:
 * в dev (не упакованное приложение) пункт автозапуска указывал бы на electron.exe проекта.
 */
export function loginItemSettings(
  withWindows: boolean,
  isPackaged: boolean,
  portableExe?: string
): { openAtLogin: boolean; args: string[]; path?: string } | null {
  if (!isPackaged) return null
  const opts = { openAtLogin: withWindows, args: withWindows ? [AUTOSTART_ARG] : [] }
  // portable: process.execPath — распакованная копия во %TEMP%, автозапуск должен вести на сам
  // POETH-Portable-….exe (PORTABLE_EXECUTABLE_FILE), иначе после очистки TEMP он сломается
  return portableExe ? { ...opts, path: portableExe } : opts
}

/** «Скачать новую версию» у portable (автообновления нет): страница релиза этой версии. */
export function releasePageUrl(version: string | undefined): string {
  const v = version && parseSemver(version) ? version.replace(/^v?/, 'v') : null
  return v ? `${RELEASES_URL}/tag/${encodeURIComponent(v)}` : `${RELEASES_URL}/latest`
}

// ---------------------------------------------------------------------------
// Манифест данных
// ---------------------------------------------------------------------------

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SHA256 = /^[0-9a-f]{64}$/
const MAX_FILES = 500
const MAX_FILE_SIZE = 64 * 1024 * 1024

/** Безопасный относительный путь: «en/stats.ndjson» — без «..», корня, обратных слэшей. */
export function isSafeDataPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) return false
  const parts = p.split('/')
  if (parts.length > 4) return false
  return parts.every((s) => SEGMENT.test(s) && s !== '..' && !s.endsWith('.'))
}

export type ManifestCheck = { ok: true; manifest: DataManifest } | { ok: false; error: string }

/** Проверить манифест из сети (всё, что пришло извне, — недоверенное). */
export function validateDataManifest(raw: unknown, appVersion: string): ManifestCheck {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.version !== 'string' || !/^[0-9A-Za-z.+-]{1,40}$/.test(r.version)) return { ok: false, error: 'bad version' }
  if (!isGameId(r.game)) return { ok: false, error: 'bad game' }
  if (r.minApp !== undefined && (typeof r.minApp !== 'string' || !parseSemver(r.minApp))) {
    return { ok: false, error: 'bad minApp' }
  }
  if (typeof r.minApp === 'string' && compareVersions(appVersion, r.minApp) < 0) {
    return { ok: false, error: `needs app ${r.minApp}` }
  }
  if (typeof r.files !== 'object' || r.files === null || Array.isArray(r.files)) return { ok: false, error: 'bad files' }
  const files: DataManifest['files'] = {}
  const entries = Object.entries(r.files as Record<string, unknown>)
  if (entries.length === 0 || entries.length > MAX_FILES) return { ok: false, error: 'bad file count' }
  for (const [path, f] of entries) {
    if (!isSafeDataPath(path) || path === 'manifest.json') return { ok: false, error: `bad path ${path}` }
    const e = f as Record<string, unknown> | null
    if (!e || typeof e.sha256 !== 'string' || !SHA256.test(e.sha256)) return { ok: false, error: `bad sha256 ${path}` }
    if (typeof e.size !== 'number' || !Number.isInteger(e.size) || e.size < 0 || e.size > MAX_FILE_SIZE) {
      return { ok: false, error: `bad size ${path}` }
    }
    files[path] = { sha256: e.sha256, size: e.size }
  }
  const manifest: DataManifest = { version: r.version, game: r.game, files }
  if (typeof r.minApp === 'string') manifest.minApp = r.minApp
  return { ok: true, manifest }
}
