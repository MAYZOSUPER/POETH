// Что взято на дереве у персонажа — по журналу игры Client.txt (S38). Подсчёт общий с вкладкой «Билд»:
// BuildTakenTracker (takenLog.ts, S39) относит вложения и снятия к персонажу текущего входа и отдаёт строковые id
// нод; здесь — перевод в hash для рисунка этапа. Журнал читается не с начала (хвост при запуске) — что взято
// раньше, он не знает: такие ноды остаются «keep». Чистый модуль (main, tests/build/**).

import type { TakenNodes } from './treeOverlayDraw'
import type { TreeData } from './types'
import type { BuildTaken } from '../types/build'

/** «Взято» вкладки → hash нод дерева; ноды не из этих данных дерева — мимо. null — журнал ничего не знает. */
export function takenHashes(tree: TreeData, taken: Pick<BuildTaken, 'taken' | 'removed'> | null): TakenNodes | null {
  if (!taken) return null
  const toHashes = (ids: string[]): Set<number> => {
    const out = new Set<number>()
    for (const id of ids) {
      const n = tree.byId.get(id)
      if (n) out.add(n.hash)
    }
    return out
  }
  const out = { taken: toHashes(taken.taken), removed: toHashes(taken.removed) }
  return out.taken.size || out.removed.size ? out : null
}
