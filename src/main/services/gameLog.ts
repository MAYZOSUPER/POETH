import { open } from 'fs/promises'
import type { GameDef, GameId } from '@shared/games'
import { LogTailer } from './logTailer'

// Client.txt запущенной игры для функций вне кампании: команды чата (@last, <char>), менеджер
// сделок (S8, фаза 2 — может подписаться сюда же). Один тейлер на процесс, а не по одному на
// функцию; запускается с первым подписчиком и останавливается с последним. Путь — автопоиск по
// GameDef.logSubdirs (Settings.logPath принадлежит кампании PoE2); POETH_GAME_LOG=<путь> —
// свой файл (тесты, нестандартная установка). Кампания PoE2 живёт на своём экземпляре logTailer.

type LinesListener = (lines: string[]) => void

let tailer: LogTailer | null = null
let tailerGame: GameId | null = null
let logPath: string | null = null
const listeners = new Set<LinesListener>()

function stopGameLog(): void {
  tailer?.stop()
  tailer?.removeAllListeners()
  tailer = null
  tailerGame = null
  logPath = null
}

async function ensureTailer(def: GameDef): Promise<string | null> {
  if (tailer && tailerGame === def.id) return logPath
  stopGameLog()
  const t = new LogTailer({ logSubdirs: def.logSubdirs })
  tailer = t
  tailerGame = def.id
  t.on('lines', (lines: string[]) => {
    for (const cb of [...listeners]) {
      try {
        cb(lines)
      } catch (e) {
        console.error('[gameLog] listener failed:', e)
      }
    }
  })
  const status = await t.start(process.env.POETH_GAME_LOG || null)
  logPath = status.logPath ?? null
  console.log(`[gameLog] ${def.id}: ${logPath ?? 'Client.txt not found'}`)
  return logPath
}

/**
 * Подписаться на новые строки Client.txt запущенной игры. Возвращает найденный путь (null —
 * лог не найден, строк не будет) и отписку.
 */
export async function subscribeGameLog(
  def: GameDef,
  cb: LinesListener
): Promise<{ logPath: string | null; off: () => void }> {
  listeners.add(cb)
  const found = await ensureTailer(def)
  return {
    logPath: found,
    off: () => {
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
