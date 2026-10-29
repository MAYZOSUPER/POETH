import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { inflateNode } from '@shared/advisor/codecNode'
import type { GameDef } from '@shared/games'
import { IPC } from '@shared/ipc'
import { BUILD_TREE_FILE, parseTreeData } from '@shared/build/data'
import { buildDevFlag, buildOn } from '@shared/build/flag'
import type { TreeData } from '@shared/build/types'
import {
  alignAt,
  defaultView,
  emptyCalibration,
  normalizeCalibration,
  panView,
  savedView,
  validClient,
  withView,
  type ClientSize,
  type TreeCalibration,
  type TreeView
} from '@shared/build/treeOverlay'
import { stageDrawing, type TreeDrawing } from '@shared/build/treeOverlayDraw'
import { TreeLogTracker } from '@shared/build/treeOverlayLog'
import { treeBuildFromPob, treeStageFor, type TreeBuild } from '@shared/build/treeOverlayStages'
import type {
  TreeOverlayDrift,
  TreeOverlayPanelRect,
  TreeOverlayProblem,
  TreeOverlayState
} from '@shared/build/treeOverlayState'
import { resolveGameLang } from '@shared/gameLang'
import { importPobCode } from '@shared/pob/import'
import type { PobBuild } from '@shared/pob/model'
import type { PobStagePlan } from '@shared/pob/stages'
import type { GameLang } from '@shared/types/settings'
import { parseLevelingLine } from '@shared/leveling/log'
import { getGameFocus, onGameFocusChange } from '../focus/gameFocus'
import { onHotkeyAction } from '../hotkeys'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { readLogTail, subscribeGameLog } from '../services/gameLog'
import { resourcesDir } from '../services/questDataset'
import { getSettings } from '../services/settingsStore'
import { getOverlayStatus, sendToOverlay } from '../windows/gameOverlay'
import { startTreeInput } from './treeOverlayInput'

// Дерево этапа билда поверх игрового дерева пассивок (S38). Хоткей buildTree (Alt+P) показывает и прячет
// наложение; оверлей только рисует и пропускает мышь в игру. Опора — стартовый круг класса: сначала считаем, что
// он в центре окна и дерево отдалено до упора (так игра открывает дерево после входа); средняя кнопка мыши над
// кругом — совместить точно. Игрок тянет дерево — наложение едет вместе; колесо (зум) — пометка «съехало».
// Положение помним по разрешению окна (userData/build-tree.json). «Взято» — по Client.txt (TreeLogTracker).
// Снимков экрана здесь нет; таймеров, которые что-то делают в игре, тоже.
//
// Откуда билд: вкладка «Билд» (B3) вызовет setTreeBuild(); пока её нет — в разработке файл с кодом PoB из
// POETH_TREE_POB (только в незапакованной сборке, как devEnv S29). POETH_TREE_SHOW=1 (тоже только в разработке) —
// показать наложение, как только окно игры в фокусе: стенд tools/tree-bench проверяет его без нажатий клавиш.

const CALIBRATION_FILE = 'build-tree.json'
/** Хвост журнала при первом показе: вложения нод за последние часы игры. */
const LOG_TAIL_BYTES = 1024 * 1024

let def: GameDef | null = null
let enabled = false
let tree: TreeData | null = null
let treeFailed = false
let build: TreeBuild | null = null
let plan: PobStagePlan | null = null
let stageIndex = 0
let stageAuto = true
let visible = false
let view: TreeView | null = null
/** разрешение, для которого посчитан view */
let viewClient: ClientSize | null = null
let aligned = false
let drift: TreeOverlayDrift | null = null
let calibration: TreeCalibration | null = null
let tracker: TreeLogTracker | null = null
let level: number | null = null
let lang: GameLang = 'en'
let panel: TreeOverlayPanelRect | null = null
let drawingCache: { key: string; drawing: TreeDrawing } | null = null
let offInput: (() => void) | null = null
let offLog: (() => void) | null = null
let logPath: string | null = null
let tailRead = false
let offFocus: (() => void) | null = null
let devShown = false

function dataBases(game: GameDef): string[] {
  return [path.join(app.getPath('userData'), 'data', game.dataDir), path.join(resourcesDir(), 'data', game.dataDir)]
}

/** Данные дерева: обновлённые (userData/data) главнее встроенных; битый или новый формат — следующий кандидат. */
async function loadTree(game: GameDef): Promise<TreeData | null> {
  if (tree || treeFailed) return tree
  for (const base of dataBases(game)) {
    try {
      const t = parseTreeData(JSON.parse(await fs.readFile(path.join(base, BUILD_TREE_FILE), 'utf8')))
      if (t) {
        tree = t
        return t
      }
    } catch {
      // следующий кандидат
    }
  }
  treeFailed = true
  console.error('[buildTree] tree data not found')
  return null
}

const calibrationFile = (): string => path.join(app.getPath('userData'), CALIBRATION_FILE)

async function loadCalibration(): Promise<TreeCalibration> {
  if (!calibration) calibration = normalizeCalibration(await readJson<unknown>(calibrationFile(), emptyCalibration()))
  return calibration
}

function saveCalibration(client: ClientSize, v: TreeView): void {
  calibration = withView(calibration ?? emptyCalibration(), client, v, Date.now())
  writeJsonAtomic(calibrationFile(), calibration).catch((e) => console.error('[buildTree] save failed:', e))
}

function gameClient(): { x: number; y: number; width: number; height: number } | null {
  const st = getOverlayStatus()
  return st.attached && st.bounds && validClient(st.bounds) ? st.bounds : null
}

function clientSize(): ClientSize | null {
  const b = gameClient()
  return b ? { width: b.width, height: b.height } : null
}

function stageNodes(i: number): number[] | null {
  return build?.stages[i]?.nodes ?? null
}

/** Рисунок текущего этапа (кэш: этап, журнал). */
function drawing(): TreeDrawing | null {
  if (!tree || !build || !build.stages.length) return null
  const s = build.stages[stageIndex]
  if (!s) return null
  const log = tracker?.nodes() ?? null
  const key = `${stageIndex}|${log ? [...log.taken].join(',') + '/' + [...log.removed].join(',') : '-'}`
  if (drawingCache?.key === key) return drawingCache.drawing
  const d = stageDrawing(tree, {
    classId: s.classId,
    nodes: s.nodes,
    prev: s.prev !== null ? stageNodes(s.prev) : null,
    log
  })
  drawingCache = { key, drawing: d }
  return d
}

function problem(): TreeOverlayProblem | null {
  if (!build) return 'no-build'
  if (!build.stages.length) return 'no-stages'
  if (!tree) return 'no-data'
  if (!clientSize()) return 'no-game'
  return null
}

/** Положение для текущего окна: уже посчитанное → сохранённое → «круг класса в центре, отдалено до упора». */
function ensureView(): void {
  const client = clientSize()
  const d = drawing()
  if (!client || !d?.anchor) return
  if (view && viewClient && viewClient.width === client.width && viewClient.height === client.height) return
  const saved = calibration ? savedView(calibration, client) : null
  view = saved ?? defaultView(client, d.anchor)
  viewClient = client
  aligned = !!saved
  drift = null
}

export function getTreeOverlayState(): TreeOverlayState {
  const s = build?.stages[stageIndex]
  return {
    enabled,
    visible,
    problem: problem(),
    build: build ? { className: build.className, ascendClassName: build.ascendClassName, treeVersion: build.treeVersion } : null,
    dataTree: tree?.meta.tree ?? null,
    stage: s && build ? { index: stageIndex, count: build.stages.length, title: s.title, auto: stageAuto } : null,
    drawing: visible ? drawing() : null,
    view,
    client: viewClient,
    drift,
    aligned,
    lang
  }
}

function push(): void {
  sendToOverlay(IPC.events.buildTreeState, getTreeOverlayState())
}

function pushView(): void {
  if (view) sendToOverlay(IPC.events.buildTreeView, { view, drift })
}

// ---------------------------------------------------------------------------
// Показ, ввод, этапы
// ---------------------------------------------------------------------------

async function show(): Promise<void> {
  if (!def || !enabled) return
  await Promise.all([loadTree(def), loadCalibration(), loadDevBuild(), readTailOnce()])
  lang = await gameLang()
  visible = true
  autoStage()
  ensureView()
  if (!offInput)
    offInput = startTreeInput({
      client: gameClient,
      panel: () => panel,
      pan: (dx, dy) => {
        if (!view) return
        view = panView(view, dx, dy)
        pushView()
      },
      align: (at) => alignHere(at),
      zoom: () => {
        if (drift === 'zoom') return
        drift = 'zoom'
        pushView()
      },
      close: () => hide()
    })
  push()
}

export function hide(): void {
  if (!visible) return
  visible = false
  offInput?.()
  offInput = null
  // где игрок оставил дерево — на следующий показ и следующий запуск
  const client = clientSize()
  if (view && client && aligned && !drift) saveCalibration(client, view)
  push()
}

export async function toggleTreeOverlay(): Promise<void> {
  if (visible) hide()
  else await show()
}

/** Средняя кнопка над кругом класса: он здесь. Масштаб — «отдалено до упора» (зум колесом сбрасывается). */
function alignHere(at: { x: number; y: number }): void {
  const client = clientSize()
  const d = drawing()
  if (!client || !d?.anchor) return
  view = alignAt(defaultView(client, d.anchor), d.anchor, at)
  viewClient = client
  aligned = true
  drift = null
  saveCalibration(client, view)
  push()
}

/** Кнопка «В центр» на плашке: снова «круг класса в центре окна». */
export function resetTreeView(): TreeOverlayState {
  const client = clientSize()
  const d = drawing()
  if (client && d?.anchor) {
    view = defaultView(client, d.anchor)
    viewClient = client
    aligned = false
    drift = null
  }
  push()
  return getTreeOverlayState()
}

export function stepTreeStage(delta: number): TreeOverlayState {
  if (build && build.stages.length && Number.isInteger(delta)) {
    const next = Math.min(build.stages.length - 1, Math.max(0, stageIndex + delta))
    if (next !== stageIndex) {
      stageIndex = next
      stageAuto = false
    }
  }
  push()
  return getTreeOverlayState()
}

export function setTreePanelRect(rect: TreeOverlayPanelRect | null): void {
  panel = rect
}

function autoStage(): void {
  if (!build || !plan || !stageAuto) return
  stageIndex = treeStageFor(build, plan, { level })
}

/** Билд для наложения (вкладка «Билд»; null — убрать). stage — индекс этапа из TreeBuild.stages, иначе по уровню. */
export function setTreeBuild(next: PobBuild | null, nextPlan: PobStagePlan | null, stage?: number): void {
  build = next && nextPlan ? treeBuildFromPob(next, nextPlan) : null
  plan = next && nextPlan ? nextPlan : null
  drawingCache = null
  stageAuto = stage === undefined
  stageIndex = stage !== undefined && build ? Math.min(Math.max(0, stage), Math.max(0, build.stages.length - 1)) : 0
  autoStage()
  // другой класс — другая опора; положение пересчитаем при показе
  view = null
  viewClient = null
  if (visible) ensureView()
  push()
}

// ---------------------------------------------------------------------------
// Билд в разработке, журнал, язык
// ---------------------------------------------------------------------------

let devBuildLoaded = false

async function loadDevBuild(): Promise<void> {
  if (devBuildLoaded || build) return
  devBuildLoaded = true
  // как devEnv (S29): в установленном POETH переменная не действует
  const file = app.isPackaged ? undefined : process.env.POETH_TREE_POB
  if (!file) return
  try {
    const res = importPobCode((await fs.readFile(file, 'utf8')).trim(), inflateNode)
    if (res.ok) setTreeBuild(res.build, res.stages)
    else console.warn(`[buildTree] POETH_TREE_POB: ${res.error}`)
  } catch (e) {
    console.warn('[buildTree] POETH_TREE_POB: cannot read', e)
  }
}

function ingest(lines: string[]): void {
  if (!tree) return
  tracker ??= new TreeLogTracker(tree)
  let loggedIn = false
  for (const line of lines) {
    const ev = parseLevelingLine(line)
    if (ev?.type === 'level') level = ev.level
    if (ev?.type === 'login') loggedIn = true
  }
  const changed = tracker.ingest(lines)
  // после входа персонажем игра открывает дерево у круга класса — прежнее положение больше не верно
  if (loggedIn && !visible) {
    view = null
    viewClient = null
  }
  if (!changed) return
  autoStage()
  if (visible) push()
}

/** Хвост журнала один раз: что персонаж вкладывал до запуска POETH. */
async function readTailOnce(): Promise<void> {
  if (tailRead || !logPath || !def) return
  tailRead = true
  if (!(await loadTree(def))) return
  try {
    const lines = await readLogTail(logPath, LOG_TAIL_BYTES)
    tracker = new TreeLogTracker(tree as TreeData)
    ingest(lines)
  } catch (e) {
    console.warn('[buildTree] log tail failed:', e)
  }
}

async function gameLang(): Promise<GameLang> {
  const s = await getSettings()
  return resolveGameLang(s.gameLang, s.uiLang).lang
}

// ---------------------------------------------------------------------------
// Настройка под игру
// ---------------------------------------------------------------------------

export async function setupTreeOverlay(game: GameDef): Promise<void> {
  def = game
  enabled = buildOn(game, buildDevFlag(process.env))
  offLog?.()
  offLog = null
  offFocus?.()
  offFocus = null
  if (!enabled) {
    hide()
    return
  }
  onHotkeyAction('buildTree', () => toggleTreeOverlay(), { keepKeys: true })
  const devShow = !app.isPackaged && process.env.POETH_TREE_SHOW === '1'
  // окно игры появилось или вернулось в фокус: положение — для его нынешнего размера
  const onFocus = (game: boolean): void => {
    if (!game) return
    if (devShow && !devShown && !visible) {
      devShown = true
      void show()
    } else if (visible) {
      ensureView()
      push()
    }
  }
  offFocus = onGameFocusChange((f) => onFocus(f.game))
  // игра могла получить фокус раньше, чем домен настроился (оверлей цепляется к окну до нас)
  onFocus(getGameFocus().game)
  const sub = await subscribeGameLog(game, (lines) => {
    if (tailRead) ingest(lines)
  })
  offLog = sub.off
  logPath = sub.logPath
}
