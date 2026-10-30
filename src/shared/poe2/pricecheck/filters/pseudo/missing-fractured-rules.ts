// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/pseudo/missing-fractured-rules.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: нет (перенесено как есть, форматирование).

import { FilterTag, type StatFilter } from '../interfaces'

/** Предмет «расколот», но ни один мод не помечен расколотым — явные моды считаем расколотыми. */
export function applyRules(filters: StatFilter[], explicitStats: StatFilter[]) {
  if (filters.some((f) => f.tag === FilterTag.Fractured)) return
  const asFractured = explicitStats
    .filter((f) => f.tag === FilterTag.Explicit)
    .map((f) => ({ ...f, tag: FilterTag.Fractured }))

  filters.push(...asFractured)
}
