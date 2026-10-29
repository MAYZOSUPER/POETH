import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { buildDevFlag, buildOn } from '@shared/build/flag'
import { treeStageIndex } from '@shared/build/view'
import { POB_CODE_MAX_CHARS } from '@shared/pob/decode'
import type { PobBuild } from '@shared/pob/model'
import { resolveStages, type PobStagePlan } from '@shared/pob/stages'
import type { BuildImportResult, BuildState, BuildTaken, BuildTreeResult, StoredBuild } from '@shared/types/build'
import { importPob } from '../pob/import'
import {
  findStored,
  getActiveBuild,
  getBuildState,
  onBuildLibrary,
  openStored,
  removeStored,
  replaceImported,
  saveImported,
  setStoredEdits
} from '../build/buildLibrary'
import { getTaken, onTaken, stopTaken } from '../build/buildTaken'
import { sendToCompanion } from '../windows/companionWindow'
import { sendToOverlay } from '../windows/gameOverlay'
import type { IpcDomain } from './types'

// Домен «Билд» (main, S39 — B3). Вставка кода или ссылки PoB (разбор и сеть — S35, src/main/pob/*), библиотека
// билдов (userData/builds.json), правки этапов игрока, «взято» по журналу игры, дерево этапа поверх игры (S38).
// Вставку и загрузку по ссылке зовёт только компаньон (политика S29). Вкладка скрыта до v0.2: без флага
// (GameFeatures.build или POETH_BUILD=1 в разработке) каналы отвечают пустым состоянием и в сеть не ходят.

let game: GameDef | null = null

const enabled = (): boolean => !!game && buildOn(game, buildDevFlag(process.env))

const EMPTY: BuildState = { active: null, recent: [] }
const NO_TAKEN: BuildTaken = { character: null, taken: [], removed: [], log: false }

// ---------------------------------------------------------------------------- дерево поверх игры (S38)

/**
 * Приёмник активного билда для дерева поверх игры: setTreeBuild(build, plan, stage?) из
 * src/main/build/treeOverlay.ts (S38). Подключается одной строкой при слиянии S38 — registerTreeSink(setTreeBuild);
 * stage — индекс этапа с деревом (TreeBuild.stages), без него — по уровню персонажа.
 */
export type TreeSink = (build: PobBuild | null, plan: PobStagePlan | null, stage?: number) => void

let treeSink: TreeSink | null = null
/** этап, выбранный кнопкой «Показать поверх дерева» (индекс в плане этапов); null — по уровню */
let treeStage: number | null = null

function pushTree(active: StoredBuild | null): void {
  if (!treeSink) return
  if (!active || !enabled()) {
    treeSink(null, null)
    return
  }
  const plan = resolveStages(active.build, active.edits)
  const stage = treeStage === null ? null : treeStageIndex(plan, treeStage)
  treeSink(active.build, plan, stage === null ? undefined : stage)
}

export function registerTreeSink(fn: TreeSink): void {
  treeSink = fn
  void getActiveBuild().then(pushTree)
}

// ---------------------------------------------------------------------------- обработчики

function broadcast(state: BuildState): void {
  sendToCompanion(IPC.events.buildState, state)
  sendToOverlay(IPC.events.buildState, state)
}

async function doImport(text: unknown): Promise<BuildImportResult> {
  if (typeof text !== 'string') return { ok: false, error: 'empty' }
  if (text.length > POB_CODE_MAX_CHARS + 4096) return { ok: false, error: 'too-large' }
  const res = await importPob(text)
  if (!res.ok) return res
  return { ok: true, state: await saveImported(res.build, res.source) }
}

async function doReload(id: unknown): Promise<BuildImportResult> {
  const stored = typeof id === 'string' ? await findStored(id) : null
  if (!stored || stored.source.kind !== 'link' || !stored.source.pageUrl) return { ok: false, error: 'empty' }
  const res = await importPob(stored.source.pageUrl)
  if (!res.ok) return res
  return { ok: true, state: await replaceImported(stored.id, res.build) }
}

function register(): void {
  onBuildLibrary((state, active) => {
    broadcast(state)
    treeStage = null
    pushTree(active)
  })
  onTaken((taken) => sendToCompanion(IPC.events.buildTaken, taken))

  ipcMain.handle(IPC.build.state, () => (enabled() ? getBuildState() : EMPTY))
  ipcMain.handle(IPC.build.importPob, (_e, text: unknown) =>
    enabled() ? doImport(text) : ({ ok: false, error: 'empty' } satisfies BuildImportResult)
  )
  ipcMain.handle(IPC.build.reload, (_e, id: unknown) =>
    enabled() ? doReload(id) : ({ ok: false, error: 'empty' } satisfies BuildImportResult)
  )
  ipcMain.handle(IPC.build.open, (_e, id: unknown) =>
    !enabled() ? EMPTY : openStored(typeof id === 'string' && id.length <= 64 ? id : null)
  )
  ipcMain.handle(IPC.build.remove, (_e, id: unknown) =>
    !enabled() || typeof id !== 'string' ? getStateOrEmpty() : removeStored(id)
  )
  ipcMain.handle(IPC.build.setEdits, (_e, id: unknown, edits: unknown) =>
    !enabled() || typeof id !== 'string' ? getStateOrEmpty() : setStoredEdits(id, edits)
  )
  ipcMain.handle(IPC.build.taken, () => (enabled() && game ? getTaken(game) : NO_TAKEN))
  ipcMain.handle(IPC.build.showTree, async (_e, stage: unknown): Promise<BuildTreeResult> => {
    if (!enabled() || !treeSink) return { available: false }
    treeStage = Number.isInteger(stage) && (stage as number) >= 0 && (stage as number) < 1000 ? (stage as number) : null
    pushTree(await getActiveBuild())
    return { available: true }
  })
}

function getStateOrEmpty(): Promise<BuildState> {
  return enabled() ? getBuildState() : Promise.resolve(EMPTY)
}

async function setupForGame(def: GameDef): Promise<void> {
  game = def
  stopTaken()
  if (!enabled()) {
    treeSink?.(null, null)
    return
  }
  // журнал «взято» начнёт читать первый запрос build:taken (вкладка открыта), не запуск приложения
  pushTree(await getActiveBuild())
}

export const buildDomain: IpcDomain = { register, setupForGame }
