import { existsSync } from 'fs'
import { open } from 'fs/promises'
import type { GameDef, GameId } from '@shared/games'
import { LogTailer } from './logTailer'

// Client.txt запущенной игры для функций вне кампании: команды чата (@last, <char>) и менеджер
// сделок (S8). Один тейлер на процесс, а не по одному на функцию; запускается с первым
// подписчиком и останавливается с последним. Путь: POETH_GAME_LOG=<путь> (тесты, нестандартная
// установка) → свой путь для игры (setGameLogPath: файл, выбранный во вкладке «Сделки») →
// автопоиск по GameDef.logSubdirs. Settings.logPath принадлежит кампании PoE2 — она живёт на
// своём экземпляре logTailer.

type LinesListener = (lines: string[]) => void

export interface GameLogStatus {
  /** игра, для которой открыт лог (null — тейлер не запущен) */
  game: GameId | null
  /** есть подписчики, тейлер читает файл */
  running: boolean
  /** файл, который читаем; null — не найден (строк не будет) */
  logPath: string | null
  /** читаем путь, заданный вручную (setGameLogPath), а не найденный автопоиском */
  custom: boolean
}

type StatusListener = (status: GameLogStatus) => void

let tailer: LogTailer | null = null
let tailerDef: GameDef | null = null
let logPath: string | null = null
let usingCustom = false
/** запуск тейлера в процессе — параллельные подписчики ждут тот же путь */
let starting: Promise<string | null> | null = null
const listeners = new Set<LinesListener>()
const statusListeners = new Set<StatusListener>()
const customPaths = new Map<GameId, string>()

export function getGameLogStatus(): GameLogStatus {
  return { game: tailerDef?.id ?? null, running: tailer !== null, logPath, custom: usingCustom }
}

/** Следить за статусом лога (запуск/остановка, смена файла). Возвращает отписку. */
export function onGameLogStatus(cb: StatusListener): () => void {
  statusListeners.add(cb)
  return () => {
    statusListeners.delete(cb)
  }
}

function emitStatus(): void {
  const st = getGameLogStatus()
  for (const cb of [...statusListeners]) {
    try {
      cb(st)
    } catch (e) {
      console.error('[gameLog] status listener failed:', e)
    }
  }
}

function dispatch(lines: string[]): void {
  for (const cb of [...listeners]) {
    try {
      cb(lines)
    } catch (e) {
      console.error('[gameLog] listener failed:', e)
    }
  }
}

/** Какой файл открыть: переменная окружения → свой путь (если файл есть) → автопоиск (null). */
function pickPath(id: GameId): { path: string | null; custom: boolean } {
  if (process.env.POETH_GAME_LOG) return { path: process.env.POETH_GAME_LOG, custom: false }
  const own = customPaths.get(id)
  if (own && existsSync(own)) return { path: own, custom: true }
  return { path: null, custom: false }
}

function stopTailer(): void {
  tailer?.stop()
  tailer?.removeAllListeners()
  tailer = null
  tailerDef = null
  logPath = null
  usingCustom = false
  starting = null
}

function stopGameLog(): void {
  const was = tailer !== null
  stopTailer()
  if (was) emitStatus()
}

/** (Пере)запустить тейлер для игры; подписчики остаются. */
function startTailer(def: GameDef): Promise<string | null> {
  stopTailer()
  const t = new LogTailer({ logSubdirs: def.logSubdirs })
  tailer = t
  tailerDef = def
  t.on('lines', dispatch)
  const want = pickPath(def.id)
  const run = (async () => {
    const status = await t.start(want.path)
    if (tailer !== t) {
      t.stop() // пока искали лог, тейлер остановили или заменили
      return null
    }
    logPath = status.logPath ?? null
    usingCustom = want.custom && logPath === want.path
    starting = null
    console.log(`[gameLog] ${def.id}: ${logPath ?? 'Client.txt not found'}${usingCustom ? ' (выбран вручную)' : ''}`)
    emitStatus()
    return logPath
  })()
  starting = run
  return run
}

async function ensureTailer(def: GameDef): Promise<string | null> {
  if (tailer && tailerDef?.id === def.id) return starting ?? logPath
  return startTailer(def)
}

/**
 * Свой Client.txt для игры (null — автопоиск). Если лог этой игры уже читается — тейлер
 * перезапускается на новом файле, подписчики остаются. Возвращает итоговый статус.
 */
export async function setGameLogPath(game: GameId, path: string | null): Promise<GameLogStatus> {
  if (path) customPaths.set(game, path)
  else customPaths.delete(game)
  if (tailer && tailerDef?.id === game) await startTailer(tailerDef)
  return getGameLogStatus()
}

/**
 * Подписаться на новые строки Client.txt запущенной игры. Возвращает найденный путь (null —
 * лог не найден, строк не будет) и отписку. Последняя отписка останавливает тейлер.
 */
export async function subscribeGameLog(
  def: GameDef,
  cb: LinesListener
): Promise<{ logPath: string | null; off: () => void }> {
  listeners.add(cb)
  const found = await ensureTailer(def)
  let active = true
  return {
    logPath: found,
    off: () => {
      if (!active) return
      active = false
      listeners.delete(cb)
      if (listeners.size === 0) stopGameLog()
    }
  }
}

/** Последние строки лога (хвост до maxBytes) — чтобы знать контекст, накопленный до запуска POETH. */
export async function readLogTail(path: string, maxBytes = 256 * 1024): Promise<string[]> {
  const fh = await open(path, 'r')
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split(/\r?\n/)
    if (start > 0) lines.shift() // первая строка обрезана посередине
    return lines.filter((l) => l.length > 0)
  } finally {
    await fh.close()
  }
}
