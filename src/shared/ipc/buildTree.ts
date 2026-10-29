// IPC домена «дерево этапа поверх игры» (S38): состояние наложения, этапы ← →, «в центр», спрятать, плашка.
// Звать может только игровой оверлей (политика S29, OVERLAY_CHANNELS в src/main/security/policy.ts).
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (уникальность — tests/ipc.test.ts).

import type { TreeOverlayPanelRect, TreeOverlayState, TreeOverlayViewEvent } from '../build/treeOverlayState'

export const buildTreeChannels = {
  buildTree: {
    state: 'buildTree:state',
    step: 'buildTree:step',
    reset: 'buildTree:reset',
    hide: 'buildTree:hide',
    panel: 'buildTree:panel'
  }
} as const

export const buildTreeEvents = {
  buildTreeState: 'event:buildTree.state',
  buildTreeView: 'event:buildTree.view'
} as const

export interface BuildTreeIpcApi {
  buildTree: {
    /** флаг разработки POETH_BUILD=1 из preload (наложение — часть вкладки «Билд», скрытой до v0.2) */
    devFlag: boolean
    state(): Promise<TreeOverlayState>
    /** ← → по этапам (±1) */
    step(delta: number): Promise<TreeOverlayState>
    /** снова «круг класса в центре окна» */
    reset(): Promise<TreeOverlayState>
    hide(): Promise<TreeOverlayState>
    /** где плашка этапа (над ней мышь не двигает дерево); null — плашки нет */
    panel(rect: TreeOverlayPanelRect | null): void
  }
  onBuildTreeState(cb: (state: TreeOverlayState) => void): () => void
  onBuildTreeView(cb: (e: TreeOverlayViewEvent) => void): () => void
}
