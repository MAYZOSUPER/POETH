import { app, ipcMain } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef, GameId } from '@shared/games'
import type { LevelingAction, LevelingConfig, LevelingVariant } from '@shared/types/leveling'
import { LevelingStore } from '../services/levelingStore'
import { getGameLogStatus, onGameLogStatus, readLogTail, subscribeGameLog } from '../services/gameLog'
import { resourcesDir } from '../services/questDataset'
import { sendToOverlay } from '../windows/gameOverlay'
import { sendToCompanion } from '../windows/companionWindow'
import { onHotkeyAction } from '../hotkeys'
import type { IpcDomain } from './types'

// Домен «прокачка PoE1» (main, этапы S14, S22). Строки Client.txt — общий тейлер процесса (services/gameLog.ts:
// его же читают команды чата, сделки и трекер карт): вход в игру, зона и уровень → персонаж, шаг маршрута,
// «кампания пройдена». При запуске (и при смене файла лога) — хвост лога после последней учтённой строки.
// Персонажи и прогресс — services/levelingStore.ts (userData/leveling.json). Только чтение лога.

/** Прокачка — только PoE1 (у PoE2 своя кампания — компас). */
const LEVELING_GAMES: readonly GameId[] = ['poe1']
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000
/** Хвост лога при запуске: недели игры (Client.txt растёт годами, читаем только конец). */
const TAIL_BYTES = 8 * 1024 * 1024

let store: LevelingStore | null = null
let logOff: (() => void) | null = null
let logGame: GameId | null = null
/** файл лога, хвост которого уже прочитан */
let primedPath: string | null = null

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

/**
 * Догнать хвост лога (запуск; другой файл — например, выбранный во вкладке «Сделки»). Без файла — только
 * отпустить строки, накопленные с подписки.
 */
function prime(file: string | null): Promise<void> {
  if (file && file === primedPath) return Promise.resolve()
  primedPath = file
  return getStore().prime(() => (file ? readLogTail(file, TAIL_BYTES) : Promise.resolve([])))
}

function syncLog(): void {
  const st = getGameLogStatus()
  const connected = !!logOff && !!logGame && st.running && !!st.logPath
  getStore().setLog(connected, st.logPath)
  if (connected && st.logPath !== primedPath) void prime(st.logPath)
}

function stopLog(): void {
  logOff?.()
  logOff = null
  logGame = null
  primedPath = null
}

async function startLog(def: GameDef): Promise<void> {
  if (logOff && logGame === def.id) return
  stopLog()
  logGame = def.id
  const s = getStore()
  // строки тейлера до чтения хвоста ждут в очереди: иначе курсор уйдёт вперёд и хвост не догоним
  s.hold()
  const sub = await subscribeGameLog(def, (lines) => s.ingestLines(lines))
  if (logGame !== def.id) {
    sub.off()
    await prime(null)
    return
  }
  logOff = sub.off
  await prime(sub.logPath)
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
    case 'showAnyway':
      return { type: 'showAnyway', on: a.on === true }
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
  // «показать / свернуть гид» — только в PoE1: без обработчика хоткей в PoE2 не регистрируется
  onHotkeyAction('levelingToggle', () => void getStore().toggleGuide())
  await startLog(def)
}

export const levelingDomain: IpcDomain = { register, setupForGame }
