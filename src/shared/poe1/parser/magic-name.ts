// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/parser/magic-name.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: данные языка передаются параметром.
//
// Имя волшебного предмета = [префикс] база [суффикс]: перебираем все подпоследовательности слов
// и берём самую длинную, которая является базой (craftable). Работает и для RU («Зелье маны … жары»).

import type { Poe1Data } from '../data/Poe1Data'

export function magicBasetype(name: string, d: Poe1Data): string | undefined {
  // Chinese and Japanese don't use spaces to separate words, so fallback to characters
  const separator = name.includes(' ') ? ' ' : ''
  const words = name.split(separator)

  const perm: string[] = words.flatMap((_, start) =>
    Array(words.length - start)
      .fill(undefined)
      .map((_, idx) => words.slice(start, start + idx + 1).join(separator))
  )

  const result = perm
    .map((name) => {
      const result = d.itemByTranslated('ITEM', name)
      return { name, found: result && result[0].craftable }
    })
    .filter((res) => res.found)
    .sort((a, b) => b.name.length - a.name.length)

  return result.length ? result[0].name : undefined
}
