// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/magic-name.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: данные языка передаются параметром; разделитель слов — пробел (в EE2 особый случай только для
// cmn-Hant по AppConfig().language — у нас таких данных нет); нет данных сайта трейда (TRADE_ITEM_BY_REF) —
// ищем только по items.ndjson.
//
// Имя волшебного предмета = [префикс] база [суффикс]: перебираем все подпоследовательности слов и берём самую
// длинную, которая является базой (craftable). Работает и для RU («Кипящий … флакон жизни дистиллятора»).

import type { Poe2Data } from '../data/Poe2Data'

export function magicBasetype(name: string, d: Poe2Data): string | undefined {
  const separator = ' '
  const words = name.split(separator)

  const perm: string[] = words.flatMap((_, start) =>
    Array(words.length - start)
      .fill(undefined)
      .map((_, idx) => words.slice(start, start + idx + 1).join(separator))
  )

  const result = perm
    .map((name) => {
      // BUG[UPSTREAM]: https://www.pathofexile.com/forum/view-thread/3913283
      const result = d.itemByRef('ITEM', name) ?? d.itemByTranslated('ITEM', name)
      return { name, found: result && result[0].craftable }
    })
    .filter((res) => res.found)
    .sort((a, b) => b.name.length - a.name.length)

  return result.length ? result[0].name : undefined
}
