// Загрузка «Стартеров» лиги (S59; чистый модуль, tests/starters/load.test.ts). Чтение файла — снаружи: в main это
// resolveDataFile('poe1', 'starters', <файл>) — обновлённый пакетом данных файл из userData/data, иначе встроенный.
// index.json называет текущую лигу и файлы; если у текущей лиги список пуст (до анонса), берём ближайшую прошлую
// лигу со стартерами — их покажем с пометкой «могут устареть».

import {
  STARTER_LIMITS,
  STARTERS_INDEX,
  isNewerSchema,
  startersFileName,
  validateIndex,
  validateStartersFile,
  type StarterRecord
} from './schema'

/** Прочитать файл папки starters: текст или null (нет файла, ошибка чтения). */
export type StartersRead = (file: string) => Promise<string | null>

export type StartersStatus =
  | 'ready' // у текущей лиги есть стартеры
  | 'empty' // список текущей лиги пуст: «появятся после анонса»
  | 'none' // данных нет или они битые
  | 'newer' // данные новее приложения: нужна новая версия POETH

export interface StartersLoad {
  status: StartersStatus
  /** текущая лига (index.current); null — индекс не прочитался */
  league: string | null
  /** когда правили список текущей лиги */
  updatedAt: string | null
  starters: StarterRecord[]
  /** пока у текущей лиги пусто — стартеры прошлой лиги */
  previous: { league: string; starters: StarterRecord[] } | null
  /** что не прошло проверку (для лога и `--check`) */
  failed: { file: string; id: string | null; error: string }[]
}

type Json = { ok: true; raw: unknown } | { ok: false; error: string }

async function readJson(read: StartersRead, file: string): Promise<Json> {
  let s: string | null
  try {
    s = await read(file)
  } catch {
    s = null
  }
  if (s === null) return { ok: false, error: 'нет файла' }
  if (new TextEncoder().encode(s).length > STARTER_LIMITS.bytes) return { ok: false, error: `больше ${STARTER_LIMITS.bytes} байт` }
  try {
    return { ok: true, raw: JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s) as unknown }
  } catch {
    return { ok: false, error: 'не JSON' }
  }
}

const none = (failed: StartersLoad['failed'], league: string | null = null, status: StartersStatus = 'none'): StartersLoad => ({
  status,
  league,
  updatedAt: null,
  starters: [],
  previous: null,
  failed
})

/** Список лиги: проверенные записи; файл битый — null и причина в failed. */
async function loadLeague(read: StartersRead, league: string, failed: StartersLoad['failed']): Promise<{ updatedAt: string; starters: StarterRecord[] } | 'newer' | null> {
  const file = startersFileName(league)
  const j = await readJson(read, file)
  if (!j.ok) {
    failed.push({ file, id: null, error: j.error })
    return null
  }
  if (isNewerSchema(j.raw)) return 'newer'
  const v = validateStartersFile(j.raw, league)
  if (!v.ok) {
    failed.push({ file, id: null, error: v.error })
    return null
  }
  for (const f of v.value.failed) failed.push({ file, id: f.id, error: f.error })
  return { updatedAt: v.value.file.updatedAt, starters: v.value.file.starters }
}

export async function loadStarters(read: StartersRead): Promise<StartersLoad> {
  const failed: StartersLoad['failed'] = []
  const idx = await readJson(read, STARTERS_INDEX)
  if (!idx.ok) return none([{ file: STARTERS_INDEX, id: null, error: idx.error }])
  if (isNewerSchema(idx.raw)) return none([], null, 'newer')
  const index = validateIndex(idx.raw)
  if (!index.ok) return none([{ file: STARTERS_INDEX, id: null, error: index.error }])

  const { current, leagues } = index.value
  const cur = await loadLeague(read, current, failed)
  if (cur === 'newer') return none(failed, current, 'newer')
  if (!cur) return none(failed, current)
  if (cur.starters.length) return { status: 'ready', league: current, updatedAt: cur.updatedAt, starters: cur.starters, previous: null, failed }

  let previous: StartersLoad['previous'] = null
  for (const league of leagues.slice(leagues.indexOf(current) + 1)) {
    const prev = await loadLeague(read, league, failed)
    if (prev && prev !== 'newer' && prev.starters.length) {
      previous = { league, starters: prev.starters }
      break
    }
  }
  return { status: 'empty', league: current, updatedAt: cur.updatedAt, starters: [], previous, failed }
}

/** Запись по id — в текущей лиге, затем в прошлой (её показываем до анонса). */
export function findStarter(load: StartersLoad, id: string): StarterRecord | null {
  return load.starters.find((s) => s.id === id) ?? load.previous?.starters.find((s) => s.id === id) ?? null
}
