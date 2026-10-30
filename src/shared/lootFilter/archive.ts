import type { LootFilterLevel, LootFilterStyle } from '../types/lootFilter'
import { levelDef, styleDef } from './levels'

// Выбор файла из архива релиза NeverSink (S53) — чистые правила, без распаковки.
// Архив GitHub: всё лежит в одной папке `NeverSinkDev-NeverSink-Filter-<sha>/`. Берём ровно один `.filter`
// нужного уровня и стиля; путь записи на диск строится НЕ из имени в архиве (см. files.ts), но имена всё равно
// проверяются: архив с абсолютным путём, `..`, обратным слэшем, буквой диска или управляющими символами —
// не архив GitHub, его отвергаем целиком.

/**
 * Имя записи безопасно: относительный путь через «/» без пустых частей, `.` и `..`; без `\`, `:` (буква диска,
 * потоки NTFS), `*?"<>|`, NUL и управляющих; части не начинаются с пробела и не кончаются пробелом или точкой
 * (Windows их срезает — «a.» и «a» один файл).
 */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 400) return false
  if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(name)) return false
  if (name.startsWith('/')) return false
  const parts = name.replace(/\/$/, '').split('/')
  return parts.every((p) => p !== '' && p !== '.' && p !== '..' && !/^\s/.test(p) && !/[ .]$/.test(p))
}

export interface ArchiveCheck {
  ok: boolean
  /** общая корневая папка архива (без «/») */
  root?: string
  /** первое плохое имя — для лога */
  bad?: string
}

/** Все имена безопасны и лежат в одной корневой папке. */
export function checkArchiveNames(names: readonly string[]): ArchiveCheck {
  let root: string | undefined
  for (const n of names) {
    if (!isSafeEntryName(n)) return { ok: false, bad: n }
    const top = n.split('/')[0]
    if (root === undefined) root = top
    else if (top !== root) return { ok: false, bad: n }
    if (!n.includes('/')) return { ok: false, bad: n } // файл в самом корне архива — не формат GitHub
  }
  return root === undefined ? { ok: false } : { ok: true, root }
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Путь файла внутри репозитория (без корневой папки архива) для уровня и стиля:
 *  default → `NeverSink's filter - 1-REGULAR.filter`
 *  стиль   → `(STYLE) ABYSS/NeverSink's filter - 1-REGULAR (abyss) .filter` (пробел перед `.filter` — как в релизе)
 * Совпадение по регулярке, регистр стиля не важен.
 */
export function filterPathPattern(level: LootFilterLevel, style: LootFilterStyle): RegExp {
  const code = esc(levelDef(level).code)
  const dir = styleDef(style).dir
  if (!dir) return new RegExp(`^NeverSink's filter - ${code}\\.filter$`)
  return new RegExp(`^\\(STYLE\\) ${esc(dir)}/NeverSink's filter - ${code} \\([^/()]+\\) ?\\.filter$`, 'i')
}

export type PickResult =
  | { ok: true; entry: string; repoPath: string }
  | { ok: false; error: 'bad-archive' | 'not-in-archive' }

/**
 * Запись архива с нужным фильтром: имена проверены (checkArchiveNames), совпадение ровно одно, это файл
 * (не папка) с расширением .filter. Ничего, кроме этого файла, из архива не берём.
 */
export function pickFilterEntry(names: readonly string[], level: LootFilterLevel, style: LootFilterStyle): PickResult {
  const check = checkArchiveNames(names)
  if (!check.ok || !check.root) return { ok: false, error: 'bad-archive' }
  const prefix = `${check.root}/`
  const re = filterPathPattern(level, style)
  const hits = names.filter((n) => !n.endsWith('/') && n.toLowerCase().endsWith('.filter') && re.test(n.slice(prefix.length)))
  if (hits.length > 1) return { ok: false, error: 'bad-archive' }
  if (hits.length === 0) return { ok: false, error: 'not-in-archive' }
  return { ok: true, entry: hits[0], repoPath: hits[0].slice(prefix.length) }
}
