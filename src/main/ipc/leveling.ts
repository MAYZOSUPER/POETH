import { app, ipcMain } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef, GameId } from '@shared/games'
import type { LevelingAction, LevelingConfig, LevelingVariant } from '@shared/types/leveling'
import { LevelingStore } from '../services/levelingStore'
import { getGameLogStatus, onGameLogStatus, subscribeGameLog } from '../services/gameLog'
import { resourcesDir } from '../services/questDataset'
import { sendToOverlay } from '../windows/gameOverlay'
import { sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «прокачка PoE1» (main, этап S14). Строки Client.txt — общий тейлер процесса (services/gameLog.ts:
// его же читают команды чата, сделки и трекер карт): вход в зону и уровень → шаг маршрута. Персонажи и
// прогресс — services/levelingStore.ts (userData/leveling.json). Только чтение лога.

/** Прокачка — только PoE1 (у PoE2 своя кампания — компас). */
const LEVELING_GAMES: readonly GameId[] = ['poe1']
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000

let store: LevelingStore | null = null
let logOff: (() => void) | null = null
let logGame: GameId | null = null

function getStore(): LevelingStore {
  if (!store) {
    store = new LevelingStore(
      path.join(app.getPath('userData'), 'leveling.json'),
      path.join(resourcesDir(), 'data', 'poe1', 'leveling', 'leveling.json')
    )
    store.on('changed', (state) => {
      sendToCompanion(IPC.events.levelingChanged, state)
      sendToOverlay(IPC.events.levelingChanged, state)
    })
  }
  return store
}

function syncLog(): void {
  const st = getGameLogStatus()
  getStore().setLog(!!logGame && st.running && !!st.logPath, st.logPath)
}

function stopLog(): void {
  logOff?.()
  logOff = null
  logGame = null
}

async function startLog(def: GameDef): Promise<void> {
  if (logOff && logGame === def.id) return
  stopLog()
  logGame = def.id
  const s = getStore()
  const sub = await subscribeGameLog(def, (lines) => s.ingestLines(lines))
  if (logGame !== def.id) {
    sub.off()
    return
  }
  logOff = sub.off
  syncLog()
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function cleanAction(a: unknown): LevelingAction | null {
  if (!isObj(a)) return null
  switch (a.type) {
    case 'next':
    case 'prev':
    case 'reset':
      return { type: a.type }
    case 'toggle':
      return typeof a.stepId === 'string' ? { type: 'toggle', stepId: a.stepId } : null
    case 'jump':
      return Number.isInteger(a.index) ? { type: 'jump', index: a.index as number } : null
    default:
      return null
  }
}

function register(): void {
  onGameLogStatus(() => syncLog())
  const s = (): LevelingStore => getStore()
  ipcMain.handle(IPC.leveling.data, () => s().getData())
  ipcMain.handle(IPC.leveling.state, async () => {
    await s().load()
    return s().state()
  })
  ipcMain.handle(IPC.leveling.act, async (_e, a: unknown) => {
    const action = cleanAction(a)
    await s().load()
    return action ? s().act(action) : s().state()
  })
  ipcMain.handle(IPC.leveling.setVariant, (_e, v: unknown) => s().setVariant(isObj(v) ? (v as Partial<LevelingVariant>) : {}))
  ipcMain.handle(IPC.leveling.setConfig, (_e, p: unknown) => s().setConfig(isObj(p) ? (p as Partial<LevelingConfig>) : {}))
  ipcMain.handle(IPC.leveling.profileCreate, (_e, name: unknown) => s().createProfile(typeof name === 'string' ? name.slice(0, 40) : ''))
  ipcMain.handle(IPC.leveling.profileSelect, (_e, id: unknown) => s().selectProfile(String(id)))
  ipcMain.handle(IPC.leveling.profileUpdate, (_e, id: unknown, patch: unknown) =>
    s().updateProfile(String(id), isObj(patch) ? (patch as { name?: string; className?: string | null; character?: string | null }) : {})
  )
  ipcMain.handle(IPC.leveling.profileRemove, (_e, id: unknown) => s().removeProfile(String(id)))
  ipcMain.handle(IPC.leveling.simulate, async (_e, lines: unknown) => {
    await s().load()
    if (Array.isArray(lines)) {
      s().ingestLines(
        lines
          .filter((l): l is string => typeof l === 'string')
          .slice(0, MAX_SIM_LINES)
          .map((l) => l.slice(0, MAX_LINE_LEN))
      )
    }
    return s().state()
  })
  app.on('before-quit', () => void store?.flush())
}

async function setupForGame(def: GameDef): Promise<void> {
  if (!LEVELING_GAMES.includes(def.id)) {
    stopLog()
    syncLog()
    return
  }
  await getStore().load()
  await startLog(def)
}

export const levelingDomain: IpcDomain = { register, setupForGame }
