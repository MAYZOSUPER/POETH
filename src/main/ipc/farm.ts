import { app, ipcMain } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef, GameId } from '@shared/games'
import type { FarmConfigPatch, FarmLogStatus, FarmState } from '@shared/types/farm'
import { cleanWidgetPos } from '@shared/farm/tracker'
import { getRunningGame } from '../gameContext'
import { getFarmService, type FarmSessionService } from '../services/farmSession'
import { loadPoe2FarmRules } from '../services/farmData'
import { getGameLogStatus, onGameLogStatus, readLogTail, subscribeGameLog } from '../services/gameLog'
import { sendToOverlay } from '../windows/gameOverlay'
import { sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «трекер карт и сессия фарма» (main, этап S11b; PoE 2 — S69). Строки Client.txt — общий тейлер
// процесса (services/gameLog.ts, его же читают команды чата и менеджер сделок; свой путь к логу
// задаёт вкладка «Сделки»). Забеги и сессия — services/farmSession.ts (там же API для S11a и S70):
// у каждой игры свой сервис и своя история — farm.json (PoE 1) и farm.poe2.json (PoE 2); окна видят
// сервис запущенной игры. Только чтение лога: никаких действий в игре.

/** Игры с трекером: зоны и строки событий PoE 1 сверены по настоящему Client.txt, PoE 2 — по данным игры. */
const FARM_GAMES: readonly GameId[] = ['poe1', 'poe2']
const HISTORY_FILE: Record<GameId, string> = { poe1: 'farm.json', poe2: 'farm.poe2.json' }
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000
const MAX_ID_LEN = 64
const HEARTBEAT_MS = 60_000

let logDef: GameDef | null = null
let logOff: (() => void) | null = null
let logGame: GameId | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null

/** Окно компаньона создаётся раньше, чем main узнаёт игру: запросы окон ждут первой setupForGame. */
let markReady: () => void = () => undefined
const gameReady = new Promise<void>((resolve) => {
  markReady = resolve
})

/** Сервис игры, которую сейчас показывают окна. */
function active(): FarmSessionService {
  return getFarmService(logDef?.id ?? getRunningGame())
}

/** То же для запросов окон: после того как игра известна. */
async function svc(): Promise<FarmSessionService> {
  await gameReady
  return active()
}

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
  const farm = getFarmService(def.id)
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

const idArg = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN ? v : null)

function register(): void {
  const dir = app.getPath('userData')
  for (const game of FARM_GAMES) {
    const farm = getFarmService(game)
    farm.setFile(path.join(dir, HISTORY_FILE[game]))
    if (game === 'poe2') farm.setRulesLoader(loadPoe2FarmRules)
    // окна показывают только запущенную игру
    farm.on('changed', (state: FarmState) => {
      if (active() === farm) broadcast(IPC.events.farmChanged, state)
    })
  }
  onGameLogStatus(() => broadcast(IPC.events.farmLog, logStatus()))
  // выход: сессия на паузу, время в карте — до сейчас (синхронно, иначе не успеет записаться)
  app.on('before-quit', () => {
    for (const game of FARM_GAMES) getFarmService(game).suspendSync()
  })

  ipcMain.handle(IPC.farm.state, async () => {
    const farm = await svc()
    await farm.load()
    return farm.state()
  })
  ipcMain.handle(IPC.farm.start, async () => (await svc()).start())
  ipcMain.handle(IPC.farm.pause, async () => (await svc()).pause())
  ipcMain.handle(IPC.farm.resume, async () => (await svc()).resume())
  ipcMain.handle(IPC.farm.stop, async () => (await svc()).stop())
  ipcMain.handle(IPC.farm.setConfig, async (_e, patch: unknown) => {
    const p = (patch ?? {}) as FarmConfigPatch
    const clean: FarmConfigPatch = {}
    if (typeof p.overlayWidget === 'boolean') clean.overlayWidget = p.overlayWidget
    if ('widgetPos' in p) clean.widgetPos = cleanWidgetPos(p.widgetPos)
    return (await svc()).setConfig(clean)
  })
  ipcMain.handle(IPC.farm.removeRun, async (_e, id: unknown) => {
    const farm = await svc()
    return typeof id === 'string' ? farm.removeRun(id) : farm.state()
  })
  ipcMain.handle(IPC.farm.clear, async () => (await svc()).clearHistory())
  // «+ находка» (PoE 2): вход проверяет трекер (cleanFindInput) — ref, числа, длины
  ipcMain.handle(IPC.farm.addFind, async (_e, input: unknown) => (await svc()).addFind(input))
  ipcMain.handle(IPC.farm.removeFind, async (_e, runId: unknown, findId: unknown) => {
    const farm = await svc()
    const r = idArg(runId)
    const f = idArg(findId)
    if (r && f) await farm.removeFind(r, f)
    return farm.state()
  })
  ipcMain.handle(IPC.farm.simulate, async (_e, lines: unknown) => {
    const farm = await svc()
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
  const prev = logDef
  logDef = def
  try {
    // мягкий перезапуск под другую игру: забег прошлой игры закрыт, её лог больше не читаем
    if (prev && prev.id !== def.id) {
      const old = getFarmService(prev.id)
      stopLog()
      await old.load()
      await old.endRun()
    }
    const farm = getFarmService(def.id)
    await farm.load()
    markReady()
    // окна могли спросить состояние до того, как игра стала известна
    broadcast(IPC.events.farmChanged, farm.state())
    if (!FARM_GAMES.includes(def.id)) {
      stopLog()
      return
    }
    await startLog(def)
  } finally {
    markReady()
  }
}

export const farmDomain: IpcDomain = { register, setupForGame }
