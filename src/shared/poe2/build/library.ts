// Билды PoE 2 на экране «Билд» (S66): userData/builds-poe2.json — только на этом компьютере. Храним сам код PoB2
// (и откуда он), а не разобранную модель: при чтении код заново проходит полный безопасный разбор (S35), так что
// испорченный или подменённый файл не даёт в приложение ничего, кроме ошибки. Чистый модуль;
// tests/build2/library.test.ts. Запись — main (src/main/build/poe2/library.ts).

import { POB_CODE_MAX_CHARS, cleanPobCode } from '../../pob/decode'
import type { Pob2Source } from '../../pob/import'

export const BUILDS2_FILE = 'builds-poe2.json'
export const BUILDS2_FORMAT = 1
/** сколько билдов помнить (новые вытесняют старые) */
export const BUILDS2_MAX = 10

export interface StoredBuild2 {
  id: string
  /** код PoB2 (base64url от zlib XML) */
  code: string
  source: Pob2Source
  importedAt: number
}

export interface Build2Library {
  v: typeof BUILDS2_FORMAT
  active: string | null
  /** новые — первыми */
  builds: StoredBuild2[]
}

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/
const SITES = new Set(['pobbin', 'pastebin', 'pobcodes', 'poedb', 'maxroll', 'rentry', 'poe2db'])

export function emptyLibrary2(): Build2Library {
  return { v: BUILDS2_FORMAT, active: null, builds: [] }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Источник с диска (недоверенные данные): только известные сайты и https-адрес без логина. */
export function cleanSource2(v: unknown): Pob2Source {
  if (!isObj(v) || v.kind !== 'link') return { kind: 'code' }
  const site = typeof v.site === 'string' && SITES.has(v.site) ? (v.site as Pob2Source['site']) : undefined
  let pageUrl: string | undefined
  if (typeof v.pageUrl === 'string' && v.pageUrl.length <= 300) {
    try {
      const u = new URL(v.pageUrl)
      if (u.protocol === 'https:' && !u.username && !u.password && !u.port) pageUrl = u.href
    } catch {
      // не адрес
    }
  }
  return site && pageUrl ? { kind: 'link', site, pageUrl } : { kind: 'code' }
}

/** Файл с диска → библиотека; мусор отбрасывается, чужой формат — пустая библиотека. */
export function parseLibrary2(raw: unknown): Build2Library {
  if (!isObj(raw) || raw.v !== BUILDS2_FORMAT || !Array.isArray(raw.builds)) return emptyLibrary2()
  const builds: StoredBuild2[] = []
  const seen = new Set<string>()
  for (const b of raw.builds as unknown[]) {
    if (builds.length >= BUILDS2_MAX || !isObj(b)) continue
    if (typeof b.id !== 'string' || !ID_RE.test(b.id) || seen.has(b.id)) continue
    if (typeof b.code !== 'string' || b.code.length > POB_CODE_MAX_CHARS || !cleanPobCode(b.code)) continue
    const at = typeof b.importedAt === 'number' && Number.isFinite(b.importedAt) && b.importedAt > 0 ? b.importedAt : 0
    seen.add(b.id)
    builds.push({ id: b.id, code: b.code, source: cleanSource2(b.source), importedAt: at })
  }
  const active = typeof raw.active === 'string' && seen.has(raw.active) ? raw.active : null
  return { v: BUILDS2_FORMAT, active, builds }
}

/** Новый билд — первым и открытым; тот же код ещё раз — переносится наверх (не дубль); лишние — вон. */
export function addBuild2(lib: Build2Library, entry: StoredBuild2): Build2Library {
  const rest = lib.builds.filter((b) => b.id !== entry.id && b.code !== entry.code)
  return { v: BUILDS2_FORMAT, active: entry.id, builds: [entry, ...rest].slice(0, BUILDS2_MAX) }
}

/** Код того же билда, загруженный заново по ссылке: на месте, тот же id. */
export function replaceCode2(lib: Build2Library, id: string, code: string): Build2Library {
  return { ...lib, builds: lib.builds.map((b) => (b.id === id ? { ...b, code, importedAt: Date.now() } : b)) }
}

export function openBuild2(lib: Build2Library, id: string | null): Build2Library {
  return { ...lib, active: id && lib.builds.some((b) => b.id === id) ? id : null }
}

export function removeBuild2(lib: Build2Library, id: string): Build2Library {
  const builds = lib.builds.filter((b) => b.id !== id)
  return { v: BUILDS2_FORMAT, active: lib.active === id ? null : lib.active, builds }
}

export function findBuild2(lib: Build2Library, id: string | null | undefined): StoredBuild2 | null {
  return (id && lib.builds.find((b) => b.id === id)) || null
}
