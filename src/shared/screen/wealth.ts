// Результат распознавания вкладки → предметы «Богатства» (S68, чистый модуль). Снимок тайника PoE 1 строится из
// TabItems { id, name, items: StashItem[] } (src/shared/wealth/snapshot.ts) — та же форма здесь, чтобы оценка,
// разница снимков и прибыль за карту подключились к PoE 2 (API тайника у неё нет) без переделки. Модули wealth
// только импортируются по типам.
//
// Предметы особых вкладок и сетки — стопочные (валюта, эссенции, фрагменты, знамения): frameType 5, имя — английское
// (matchPrice ищет их в индексе цен как 'stackable' по baseType). Ячейки без предмета, неузнанные и уровни одного
// рисунка без раскладки (какой из Greater/Perfect — неизвестно) в снимок не идут — они сосчитаны в skipped.

import type { StashItem } from '../wealth/stash'
import type { TabItems } from '../wealth/snapshot'
import type { ScreenCell, ScreenRead } from '../types/screen'

/** Валюта и прочие стопочные предметы в ответе API тайника GGG. */
export const STACKABLE_FRAME = 5

export interface ScreenTabOptions {
  /** имя вкладки в снимке (по умолчанию — ключ раскладки или «окно») */
  name?: string
  /** число стопки не прочитано: 'skip' — предмет не берём (по умолчанию), 'one' — считаем одну штуку */
  uncounted?: 'skip' | 'one'
  /** брать только уверенно прочитанные числа (по умолчанию — все прочитанные) */
  sureOnly?: boolean
}

export interface ScreenTabItems {
  tab: TabItems
  /** предмет снимка ↔ ячейка снимка (тот же порядок, что tab.items) */
  cells: Array<{ item: StashItem; cell: ScreenCell }>
  skipped: {
    /** предмет есть, но не узнан */
    unknown: number
    /** уровни одного рисунка без раскладки */
    ambiguous: number
    /** число не прочитано (или не уверенно при sureOnly) */
    uncounted: number
  }
  /** в снимок вошли неуверенно прочитанные числа */
  approx: boolean
}

/** Стопочный предмет в форме StashItem (английское имя). */
export function stackItem(name: string, qty: number): StashItem {
  return { name: '', typeLine: name, baseType: name, frameType: STACKABLE_FRAME, qty, identified: true, corrupted: false, links: 0 }
}

/** Ключ вкладки в снимке: игра, окно и раскладка — один и тот же снимок вкладки даёт один ключ. */
export function screenTabId(read: ScreenRead): string {
  return `screen:${read.game}:${read.window}:${read.tab ?? 'free'}`
}

/** ScreenRead → TabItems для buildSnapshot / qtyProfit / diffSnapshots. */
export function screenTabItems(read: ScreenRead, o: ScreenTabOptions = {}): ScreenTabItems {
  const cells: ScreenTabItems['cells'] = []
  const skipped = { unknown: 0, ambiguous: 0, uncounted: 0 }
  let approx = false
  for (const c of read.cells) {
    if (!c.present) continue
    if (!c.item) {
      skipped.unknown++
      continue
    }
    if (read.tab === null && c.alt?.length) {
      skipped.ambiguous++
      continue
    }
    let qty = c.count
    if (qty !== null && o.sureOnly && !c.countSure) qty = null
    if (qty === null || !(qty > 0)) {
      if (o.uncounted === 'one') qty = 1
      else {
        skipped.uncounted++
        continue
      }
    } else if (!c.countSure) approx = true
    cells.push({ item: stackItem(c.item, qty), cell: c })
  }
  return {
    tab: { id: screenTabId(read), name: o.name ?? read.tab ?? read.window, items: cells.map((x) => x.item) },
    cells,
    skipped,
    approx
  }
}
