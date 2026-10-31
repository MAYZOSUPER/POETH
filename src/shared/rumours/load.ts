// Загрузка «Слухов журнала» (S65; чистый модуль, tests/rumours/load.test.ts). Чтение файла — снаружи: в main это
// resolveDataFile('poe2', 'rumours', 'rumours.json') — обновлённый пакетом данных файл из userData/data, иначе
// встроенный.

import { RUMOUR_LIMITS, RUMOURS_FILE, isNewerSchema, validateRumoursFile, type RumourRecord } from './schema'

/** Прочитать файл папки rumours: текст или null (нет файла, ошибка чтения). */
export type RumoursRead = (file: string) => Promise<string | null>

export type RumoursStatus =
  | 'ready' // есть слухи
  | 'none' // данных нет или они битые
  | 'newer' // данные новее приложения: нужна новая версия POETH

export interface RumoursLoad {
  status: RumoursStatus
  /** патч PoE 2, из которого строки; null — файл не прочитался */
  patch: string | null
  updatedAt: string | null
  rumours: RumourRecord[]
  /** что не прошло проверку (для лога) */
  failed: { id: string | null; error: string }[]
}

const none = (failed: RumoursLoad['failed'], status: RumoursStatus = 'none'): RumoursLoad => ({
  status,
  patch: null,
  updatedAt: null,
  rumours: [],
  failed
})

export async function loadRumours(read: RumoursRead): Promise<RumoursLoad> {
  let s: string | null
  try {
    s = await read(RUMOURS_FILE)
  } catch {
    s = null
  }
  if (s === null) return none([{ id: null, error: 'нет файла' }])
  if (new TextEncoder().encode(s).length > RUMOUR_LIMITS.bytes) return none([{ id: null, error: `больше ${RUMOUR_LIMITS.bytes} байт` }])
  let raw: unknown
  try {
    raw = JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)
  } catch {
    return none([{ id: null, error: 'не JSON' }])
  }
  if (isNewerSchema(raw)) return none([], 'newer')
  const v = validateRumoursFile(raw)
  if (!v.ok) return none([{ id: null, error: v.error }])
  const failed = v.value.failed.map((f) => ({ id: f.id, error: f.error }))
  const { patch, updatedAt, rumours } = v.value.file
  return { status: rumours.length ? 'ready' : 'none', patch, updatedAt, rumours, failed }
}
