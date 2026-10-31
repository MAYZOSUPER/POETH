import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { HotkeyId } from '../hotkeys'
import type { RumoursData, RumoursOverlayCmd, RumoursUserState } from '@shared/types/rumours'
import { readRumoursFromText } from '@shared/rumours/match'
import { withMark, withPicked } from '@shared/rumours/marks'
import { onHotkeyAction } from '../hotkeys'
import { captureItemText } from '../input/gameInput'
import { getRunningGame } from '../gameContext'
import { sendToCompanion } from '../windows/companionWindow'
import { sendToOverlay } from '../windows/gameOverlay'
import { getRumoursLoad } from '../rumours/data'
import { getRumoursUser, updateRumoursUser } from '../rumours/store'
import { getRumourPrices } from '../rumours/prices'
import type { IpcDomain } from './types'

// Домен «Слухи журнала» (main, S65; только PoE 2). Данные — файл слухов (rumours/data.ts), выбор и пометки игрока —
// userData/rumours.json (rumours/store.ts), цены главных наград — rumours/prices.ts.
//
// Хоткей `rumours` (область «игра в фокусе»): одно нажатие — одно копирование, как у Ctrl+D.
//  - Курсор над журналом и в его тексте есть строки слухов — они становятся выбранными (pickedBy 'item'), поверх
//    игры открывается короткий вид «бери …».
//  - Предмет скопирован, а строк слухов нет — короткий вид с подсказкой «отметьте слухи в компаньоне».
//  - Курсор не над предметом — показать или спрятать короткий вид с выбранными руками.
// Через 30 секунд короткий вид прячется сам. Текст буфера живёт только в памяти: на диск и в сеть не уходит.

/** Действие хоткея. HotkeyAction 'rumours' и клавишу по умолчанию добавляет лид (S65-frozen.diff). */
const ACTION = 'rumours' as HotkeyId
const OVERLAY_SHOW_MS = 30_000

let shown = false
let hideTimer: ReturnType<typeof setTimeout> | null = null

function overlay(cmd: RumoursOverlayCmd): void {
  shown = cmd.show
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  if (cmd.show) hideTimer = setTimeout(() => overlay({ show: false, read: null, count: 0 }), OVERLAY_SHOW_MS)
  sendToOverlay(IPC.events.rumoursOverlay, cmd)
}

function push(state: RumoursUserState): RumoursUserState {
  sendToCompanion(IPC.events.rumoursState, state)
  sendToOverlay(IPC.events.rumoursState, state)
  return state
}

async function knownIds(): Promise<Set<string>> {
  return new Set((await getRumoursLoad()).rumours.map((r) => r.id))
}

async function data(): Promise<RumoursData> {
  if (getRunningGame() !== 'poe2') return { on: false, status: 'none', patch: null, updatedAt: null, rumours: [], failed: 0 }
  const load = await getRumoursLoad()
  return { on: true, status: load.status, patch: load.patch, updatedAt: load.updatedAt, rumours: load.rumours, failed: load.failed.length }
}

export async function onRumoursHotkey(): Promise<void> {
  const load = await getRumoursLoad()
  const item = await captureItemText()
  if (item) {
    const read = readRumoursFromText(load.rumours, item.text)
    if (read.ids.length) {
      const known = new Set(load.rumours.map((r) => r.id))
      push(await updateRumoursUser((s) => withPicked(s, read.ids, 'item', new Date(), known)))
      overlay({ show: true, read: 'found', count: read.ids.length })
    } else {
      overlay({ show: true, read: 'none', count: 0 })
    }
    return
  }
  overlay({ show: !shown, read: null, count: 0 })
}

function register(): void {
  ipcMain.handle(IPC.rumours.data, () => data())
  ipcMain.handle(IPC.rumours.state, () => getRumoursUser())
  ipcMain.handle(IPC.rumours.setPicked, async (_e, ids: unknown) => {
    const known = await knownIds()
    return push(await updateRumoursUser((s) => withPicked(s, ids, 'manual', new Date(), known)))
  })
  ipcMain.handle(IPC.rumours.setMark, async (_e, id: unknown, mark: unknown) => {
    if (typeof id !== 'string' || !(await knownIds()).has(id)) return getRumoursUser()
    return push(await updateRumoursUser((s) => withMark(s, id, mark)))
  })
  ipcMain.handle(IPC.rumours.prices, (_e, refresh: unknown) => getRumourPrices(refresh === true))
}

function setupForGame(def: GameDef): void {
  shown = false
  if (def.id !== 'poe2') return
  onHotkeyAction(ACTION, () => onRumoursHotkey())
}

export const rumoursDomain: IpcDomain = { register, setupForGame }
