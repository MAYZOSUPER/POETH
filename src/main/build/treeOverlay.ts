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
  wheelView,
  withView,
  type ClientSize,
  type TreeCalibration,
  type TreeView
} from '@shared/build/treeOverlay'
import { stageDrawing, type TreeDrawing } from '@shared/build/treeOverlayDraw'
import { takenHashes } from '@shared/build/treeOverlayLog'
import { fitPoints, type FitPoint } from '@shared/build/treeOverlayMatch'
import { treeBuildFromPob, treeStageFor, type TreeBuild } from '@shared/build/treeOverlayStages'
import type {
  TreeOverlayPanelRect,
  TreeOverlayProblem,
  TreeOverlayState
} from '@shared/build/treeOverlayState'
import { resolveGameLang } from '@shared/gameLang'
import { importPobCode } from '@shared/pob/import'
import type { PobBuild } from '@shared/pob/model'
import type { PobStagePlan } from '@shared/pob/stages'
import type { BuildTaken } from '@shared/types/build'
import type { GameLang } from '@shared/types/settings'
import { devEnv } from '../devEnv'
import { getGameFocus, onGameFocusChange } from '../focus/gameFocus'
import { onHotkeyAction } from '../hotkeys'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { resourcesDir } from '../services/questDataset'
import { getSettings } from '../services/settingsStore'
import { getOverlayStatus, sendToOverlay } from '../windows/gameOverlay'
import { getTaken, onTaken, takenCharacter } from './buildTaken'
import { captureTreeShot, fitTreeShot, type TreeShot } from './treeOverlayFit'
import { startTreeInput } from './treeOverlayInput'

// Дерево этапа билда поверх игрового дерева пассивок (S38). Хоткей buildTree (Alt+P) показывает и прячет
// наложение; оверлей только рисует и пропускает мышь в игру. Опора — стартовый круг класса: сначала считаем, что
// он в центре окна при z = 2 (так игра открывает дерево после входа, снимки S38); средняя кнопка мыши над
// кругом — совместить точно. Игрок тянет дерево — наложение едет вместе; колесо — тот же зум, что у игры
// (±0,625 к z на щелчок вокруг курсора, пределы 1…5, treeOverlay.ts).
// Положение помним по разрешению окна (userData/build-tree.json). «Взято» и уровень персонажа — общий с вкладкой
// «Билд» подсчёт по Client.txt (buildTaken.ts, S39): журнал начинает читаться при первом показе.
// Автоподгонка: по Alt+P, до показа — снимок окна в памяти, подгонка около подсказок в отдельном потоке
// (treeOverlayFit.ts); уверенно совпало — наложение встаёт туда само. Таймеров, которые что-то делают в игре, нет.
//
// Откуда билд: активный билд вкладки «Билд» (S39: registerTreeSink(setTreeBuild) в main/ipc/build.ts); без него в
// разработке — файл с кодом PoB из POETH_TREE_POB (только в незапакованной сборке, как devEnv S29).
// POETH_TREE_SHOW=1 (тоже только в разработке) — показать наложение, как только окно игры в фокусе: стенд
// tools/tree-bench проверяет его без нажатий клавиш.

const CALIBRATION_FILE = 'build-tree.json'

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
let calibration: TreeCalibration | null = null
/** последний снимок «взято» (buildTaken.ts) и его номер — ключ кэша рисунка */
let taken: BuildTaken | null = null
let takenRev = 0
/** персонаж снимка: сменился (новый вход) — игра снова открывает дерево у круга класса */
let character: string | null = null
let level: number | null = null
let lang: GameLang = 'en'
let panel: TreeOverlayPanelRect | null = null
let drawingCache: { key: string; drawing: TreeDrawing } | null = null
let offInput: (() => void) | null = null
/** ноды для автоподгонки (по данным дерева, один раз) */
let fitPts: FitPoint[] | null = null
/** номер подгонки: спрятали или показали снова — старый результат не ставим */
let fitSeq = 0
/** панорама и зум игрока, пока считается подгонка, — повторить поверх найденного; null — игрок совместил сам */
let fitOps: ((v: TreeView) => TreeView)[] | null = null
let offTaken: (() => void) | null = null
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
  const key = `${stageIndex}|${takenRev}`
  if (drawingCache?.key === key) return drawingCache.drawing
  const d = stageDrawing(tree, {
    classId: s.classId,
    nodes: s.nodes,
    prev: s.prev !== null ? stageNodes(s.prev) : null,
    log: takenHashes(tree, taken)
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

/** Положение для текущего окна: уже посчитанное → сохранённое → «круг класса в центре, z = 2» (как после входа). */
function ensureView(): void {
  const client = clientSize()
  const d = drawing()
  if (!client || !d?.anchor) return
  if (view && viewClient && viewClient.width === client.width && viewClient.height === client.height) return
  const saved = calibration ? savedView(calibration, client) : null
  view = saved ?? defaultView(client, d.anchor)
  viewClient = client
  aligned = !!saved
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
    aligned,
    lang
  }
}

function push(): void {
  sendToOverlay(IPC.events.buildTreeState, getTreeOverlayState())
}

function pushView(): void {
  if (view) sendToOverlay(IPC.events.buildTreeView, { view })
}

// ---------------------------------------------------------------------------
// Показ, ввод, этапы
// ---------------------------------------------------------------------------

async function show(): Promise<void> {
  if (!def || !enabled) return
  const [snap] = await Promise.all([
    getTaken(def).catch((e: unknown) => {
      console.warn('[buildTree] game log:', e)
      return null
    }),
    loadTree(def),
    loadCalibration(),
    loadDevBuild()
  ])
  if (snap) applyTaken(snap)
  lang = await gameLang()
  // снимок — до того, как наложение появится на экране (иначе на снимке наши же кольца)
  const shot = tree && build?.stages.length ? captureTreeShot() : null
  visible = true
  autoStage()
  ensureView()
  if (!offInput)
    offInput = startTreeInput({
      client: gameClient,
      panel: () => panel,
      pan: (dx, dy) => track((v) => panView(v, dx, dy)),
      align: (at) => alignHere(at),
      zoom: (at, notches) => {
        const client = clientSize()
        if (client) track((v) => wheelView(v, client, at, notches))
      },
      close: () => hide()
    })
  push()
  if (shot) void autoFit(shot)
}

/** Панорама или зум игрока: сдвинуть наложение (и запомнить, если сейчас считается подгонка). */
function track(op: (v: TreeView) => TreeView): void {
  if (!view) return
  view = op(view)
  fitOps?.push(op)
  pushView()
}

/** Подгонка по снимку около подсказок: где наложение сейчас, сохранённое, «как после входа». */
async function autoFit(shot: TreeShot): Promise<void> {
  const client = clientSize()
  const d = drawing()
  const t = tree
  if (!t || !view || !client || !d?.anchor || client.width !== shot.client.width || client.height !== shot.client.height) return
  const saved = calibration ? savedView(calibration, client) : null
  const priors = [view, ...(saved ? [saved] : []), defaultView(client, d.anchor)]
  const my = ++fitSeq
  fitOps = []
  try {
    const r = await fitTreeShot(shot, () => (fitPts ??= fitPoints(t)), priors)
    const ops = fitOps
    if (my !== fitSeq) return
    fitOps = null
    if (!r || !ops || !visible) return
    if (!r.ok) {
      console.info(`[buildTree] fit: not sure (${r.inliers}/${r.checked}, ${r.ms} ms)`)
      return
    }
    view = ops.reduce((v, op) => op(v), r.view)
    viewClient = client
    aligned = true
    push()
  } catch (e) {
    if (my === fitSeq) fitOps = null
    console.warn('[buildTree] fit failed:', e)
  }
}

export function hide(): void {
  if (!visible) return
  visible = false
  fitSeq++
  fitOps = null
  offInput?.()
  offInput = null
  // где игрок оставил дерево — на следующий показ и следующий запуск
  const client = clientSize()
  if (view && client && aligned) saveCalibration(client, view)
  push()
}

export async function toggleTreeOverlay(): Promise<void> {
  if (visible) hide()
  else await show()
}

/**
 * Средняя кнопка над кругом класса: он здесь. Масштаб — тот, что насчитали по колесу; если он не тот (зум
 * меняли, пока наложение было спрятано), игрок отдаляет дерево до упора — z = 1 у игры и у нас — и жмёт снова.
 */
function alignHere(at: { x: number; y: number }): void {
  const client = clientSize()
  const d = drawing()
  if (!client || !d?.anchor) return
  ensureView()
  // игрок совместил сам — подгонка, если ещё считается, ему не мешает
  fitOps = null
  view = alignAt(view ?? defaultView(client, d.anchor), d.anchor, at)
  viewClient = client
  aligned = true
  saveCalibration(client, view)
  push()
}

/** Кнопка «В центр» на плашке: снова «круг класса в центре окна». */
export function resetTreeView(): TreeOverlayState {
  const client = clientSize()
  const d = drawing()
  if (client && d?.anchor) {
    fitOps = null
    view = defaultView(client, d.anchor)
    viewClient = client
    aligned = false
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
  // devEnv (S29): в установленном POETH переменная не действует
  const file = devEnv('POETH_TREE_POB')
  if (!file) return
  try {
    const res = importPobCode((await fs.readFile(file, 'utf8')).trim(), inflateNode)
    if (res.ok) setTreeBuild(res.build, res.stages)
    else console.warn(`[buildTree] POETH_TREE_POB: ${res.error}`)
  } catch (e) {
    console.warn('[buildTree] POETH_TREE_POB: cannot read', e)
  }
}

/** Снимок «взято» (журнал прочитан, вложение, вход, повышение уровня своего персонажа). */
function applyTaken(snap: BuildTaken): void {
  if (snap === taken) return
  // после входа персонажем игра открывает дерево у круга класса — прежнее положение больше не верно
  if (snap.character !== character && !visible) {
    view = null
    viewClient = null
  }
  taken = snap
  takenRev++
  character = snap.character
  level = takenCharacter()?.level ?? null
  autoStage()
  if (visible) push()
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
  offTaken?.()
  offTaken = null
  taken = null
  takenRev++
  character = null
  level = null
  offFocus?.()
  offFocus = null
  if (!enabled) {
    hide()
    return
  }
  onHotkeyAction('buildTree', () => toggleTreeOverlay(), { keepKeys: true })
  const devShow = devEnv('POETH_TREE_SHOW') === '1'
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
  // снимки приходят, когда журнал читается (вкладка открыта или дерево показано)
  offTaken = onTaken(applyTaken)
}
