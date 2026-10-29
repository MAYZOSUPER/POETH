import type { GameDef } from '@shared/games'
import { BuildTakenTracker } from '@shared/build/takenLog'
import { isAfter } from '@shared/leveling/log'
import { splitLogLine } from '@shared/deals/whisperParse'
import type { BuildTaken } from '@shared/types/build'
import { getGameLogStatus, readLogTail, subscribeGameLog } from '../services/gameLog'

// «Взято ✓» вкладки «Билд» (S39): вложение и снятие нод по Client.txt у персонажа текущего входа. Журнал
// подписывается, только когда вкладку открыли (первый запрос) — без вкладки POETH лог ради неё не читает. Хвост
// журнала при старте — вложения за последние часы игры; что взято раньше, вкладка честно не отмечает.
// Только чтение журнала, на диск ничего не пишется.

/** Хвост журнала: как у гида прокачки — часы игры, а не годы. */
const TAIL_BYTES = 8 * 1024 * 1024

type Listener = (taken: BuildTaken) => void

let tracker: BuildTakenTracker | null = null
let started: Promise<void> | null = null
let off: (() => void) | null = null
let logOk = false
const listeners = new Set<Listener>()

function emit(): void {
  if (!tracker) return
  const snap = tracker.snapshot(logOk)
  for (const cb of listeners) cb(snap)
}

/** Подписаться на журнал запущенной игры (один раз; повторный вызов ждёт первый). */
export function startTaken(def: GameDef): Promise<void> {
  started ??= (async () => {
    const t = new BuildTakenTracker()
    tracker = t
    // строки тейлера до чтения хвоста — в очередь; после хвоста берём только те, что позже его конца
    let queue: string[] | null = []
    const sub = await subscribeGameLog(def, (lines) => {
      if (queue) queue.push(...lines)
      else if (t.ingest(lines)) emit()
    })
    off = sub.off
    const logPath = sub.logPath ?? getGameLogStatus().logPath
    logOk = !!logPath
    let tail: string[] = []
    if (logPath) {
      try {
        tail = await readLogTail(logPath, TAIL_BYTES)
      } catch {
        tail = []
      }
    }
    t.ingest(tail)
    const lastLine = [...tail].reverse().find((l) => splitLogLine(l)?.ts != null)
    const last = lastLine ? splitLogLine(lastLine) : null
    const cursor = last && last.ts !== null && last.uptimeMs !== undefined ? { ts: last.ts, up: last.uptimeMs } : null
    const rest = queue
    queue = null
    t.ingest(cursor ? rest.filter((l) => isAfter(l, cursor)) : rest)
    emit()
  })()
  return started
}

export function stopTaken(): void {
  off?.()
  off = null
  started = null
  tracker = null
  logOk = false
}

export async function getTaken(def: GameDef): Promise<BuildTaken> {
  await startTaken(def)
  return tracker ? tracker.snapshot(logOk) : { character: null, taken: [], removed: [], log: false }
}

export function onTaken(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
