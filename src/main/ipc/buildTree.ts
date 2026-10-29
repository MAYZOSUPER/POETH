import { ipcMain } from 'electron'
import type { GameDef } from '@shared/games'
import { IPC } from '@shared/ipc'
import type { TreeOverlayPanelRect } from '@shared/build/treeOverlayState'
import {
  getTreeOverlayState,
  hide,
  resetTreeView,
  setTreePanelRect,
  setupTreeOverlay,
  stepTreeStage
} from '../build/treeOverlay'
import type { IpcDomain } from './types'

// Домен «дерево этапа поверх игры» (S38): src/main/build/treeOverlay.ts. Каналы зовёт только игровой оверлей
// (OVERLAY_CHANNELS, политика S29) — данные от него недоверенные, проверяем здесь.

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function panelRect(raw: unknown): TreeOverlayPanelRect | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, width, height } = raw as Record<string, unknown>
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null
  if (width > 10_000 || height > 10_000) return null
  return { x, y, width, height }
}

function register(): void {
  ipcMain.handle(IPC.buildTree.state, () => getTreeOverlayState())
  ipcMain.handle(IPC.buildTree.step, (_e, delta: unknown) => stepTreeStage(delta === 1 || delta === -1 ? delta : 0))
  ipcMain.handle(IPC.buildTree.reset, () => resetTreeView())
  ipcMain.handle(IPC.buildTree.hide, () => {
    hide()
    return getTreeOverlayState()
  })
  ipcMain.on(IPC.buildTree.panel, (_e, rect: unknown) => setTreePanelRect(panelRect(rect)))
}

async function setupForGame(def: GameDef): Promise<void> {
  await setupTreeOverlay(def)
}

export const buildTreeDomain: IpcDomain = { register, setupForGame }
