// Состояние наложения дерева этапа поверх игры (S38) — что main отдаёт виджету оверлея (IPC домена buildTree).

import type { GameLang } from '../types/settings'
import type { ClientSize, TreeView } from './treeOverlay'
import type { TreeDrawing } from './treeOverlayDraw'

/** Почему рисовать нечего. */
export type TreeOverlayProblem =
  | 'no-build' // билд не выбран (вкладка «Билд»; в разработке — POETH_TREE_POB)
  | 'no-stages' // в билде нет деревьев
  | 'no-data' // данные дерева не загрузились
  | 'no-game' // окно игры не найдено

export interface TreeOverlayStageInfo {
  index: number
  count: number
  title: string
  /** выбран по уровню персонажа (false — игрок листал этапы сам) */
  auto: boolean
}

export interface TreeOverlayState {
  /** функция включена (вкладка «Билд»: флаг игры или POETH_BUILD=1) */
  enabled: boolean
  visible: boolean
  problem: TreeOverlayProblem | null
  build: { className: string; ascendClassName: string | null; treeVersion: string } | null
  /** версия дерева в данных приложения (`3.29.1`) — у билда другая: часть нод могла сместиться */
  dataTree: string | null
  stage: TreeOverlayStageInfo | null
  drawing: TreeDrawing | null
  /** положение дерева, физические точки клиентской области игры */
  view: TreeView | null
  client: ClientSize | null
  /** игрок уже совмещал наложение в этом разрешении (иначе — догадка «круг класса в центре окна») */
  aligned: boolean
  /** язык подписей нод — язык клиента игры */
  lang: GameLang
}

/** Частое событие панорамы: только положение. */
export interface TreeOverlayViewEvent {
  view: TreeView
}

/** Прямоугольник плашки этапа (CSS-пиксели окна оверлея) — над ней мышь не двигает дерево игры. */
export interface TreeOverlayPanelRect {
  x: number
  y: number
  width: number
  height: number
}
