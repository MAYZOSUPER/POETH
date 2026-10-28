import { app, ipcMain } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef, GameId } from '@shared/games'
import type { FarmConfigPatch, FarmLogStatus } from '@shared/types/farm'
import { cleanWidgetPos } from '@shared/farm/tracker'
import { getFarmService } from '../services/farmSession'
import { getGameLogStatus, onGameLogStatus, readLogTail, subscribeGameLog } from '../services/gameLog'
import { sendToOverlay } from '../windows/gameOverlay'
import { sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «трекер карт и сессия фарма» (main, этап S11b). Строки Client.txt — общий тейлер
// процесса (services/gameLog.ts, его же читают команды чата и менеджер сделок; свой путь к логу
// задаёт вкладка «Сделки»). Забеги и сессия — services/farmSession.ts (там же API для S11a).
// Только чтение лога: никаких действий в игре.

/** Игры с трекером: зоны и строки событий сверены для PoE1 (у PoE2 свои id зон и кампания). */
const FARM_GAMES: readonly GameId[] = ['poe1']
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000
const HEARTBEAT_MS = 60_000

const farm = getFarmService()

let logDef: GameDef | null = null
let logOff: (() => void) | null = null
let logGame: GameId | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null

/** Событие во все окна: компаньон (панель «Карты») и оверлей (виджет). */
function broadcast(channel: string, payload?: unknown): void {
  sendToCompanion(channel, payload)
  sendToOverlay(channel, payload)
}

function logStatus(): FarmLogStatus {
  const st = getGameLogStatus()
  const supported = !!logDef && FARM_GAMES.includes(logDef.id)
  return { connected: supported && st.running && !!st.logPath, logPath: st.logPath, supported }
}

function stopLog(): void {
  logOff?.()
  logOff = null
  logGame = null
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
}

async function startLog(def: GameDef): Promise<void> {
  if (logOff && logGame === def.id) return
  stopLog()
  logGame = def.id
  const sub = await subscribeGameLog(def, (lines) => farm.ingestLines(lines))
  if (logGame !== def.id) {
    sub.off() // игру сменили, пока открывали лог
    return
  }
  logOff = sub.off
  heartbeat = setInterval(() => farm.heartbeat(), HEARTBEAT_MS)
  // запуск посреди карты: догнать хвост лога (строки, пришедшие тем временем, ждут в очереди)
  const file = sub.logPath
  await farm.prime(() => (file ? readLogTail(file) : Promise.resolve([])))
}

function register(): void {
  farm.setFile(path.join(app.getPath('userData'), 'farm.json'))
  farm.on('changed', (state) => broadcast(IPC.events.farmChanged, state))
  onGameLogStatus(() => broadcast(IPC.events.farmLog, logStatus()))
  // выход: сессия на паузу, время в карте — до сейчас (синхронно, иначе не успеет записаться)
  app.on('before-quit', () => farm.suspendSync())

  ipcMain.handle(IPC.farm.state, async () => {
    await farm.load()
    return farm.state()
  })
  ipcMain.handle(IPC.farm.start, () => farm.start())
  ipcMain.handle(IPC.farm.pause, () => farm.pause())
  ipcMain.handle(IPC.farm.resume, () => farm.resume())
  ipcMain.handle(IPC.farm.stop, () => farm.stop())
  ipcMain.handle(IPC.farm.setConfig, (_e, patch: unknown) => {
    const p = (patch ?? {}) as FarmConfigPatch
    const clean: FarmConfigPatch = {}
    if (typeof p.overlayWidget === 'boolean') clean.overlayWidget = p.overlayWidget
    if ('widgetPos' in p) clean.widgetPos = cleanWidgetPos(p.widgetPos)
    return farm.setConfig(clean)
  })
  ipcMain.handle(IPC.farm.removeRun, (_e, id: unknown) =>
    typeof id === 'string' ? farm.removeRun(id) : farm.state()
  )
  ipcMain.handle(IPC.farm.clear, () => farm.clearHistory())
  ipcMain.handle(IPC.farm.simulate, async (_e, lines: unknown) => {
    await farm.load()
    if (Array.isArray(lines)) {
      const clean = lines
        .filter((l): l is string => typeof l === 'string')
        .slice(0, MAX_SIM_LINES)
        .map((l) => l.slice(0, MAX_LINE_LEN))
      farm.ingestLines(clean)
    }
    return farm.state()
  })
  ipcMain.handle(IPC.farm.logStatus, () => logStatus())
}

async function setupForGame(def: GameDef): Promise<void> {
  logDef = def
  await farm.load()
  if (!FARM_GAMES.includes(def.id)) {
    // мягкий перезапуск под другую игру: забег закрыт, лог больше не читаем
    if (logGame) await farm.endRun()
    stopLog()
    return
  }
  await startLog(def)
}

export const farmDomain: IpcDomain = { register, setupForGame }
