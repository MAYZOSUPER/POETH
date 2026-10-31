// Имена редких предметов PoE 2 (S62): у каждого редкого предмета в тайнике имя из двух слов («Gloom Path» /
// «Мрачный путь»), и поиск игры видит его. Общая подстрока «любой из» / «не хочу» не должна совпадать с именем —
// ни внутри слова, ни на стыке слов («m p» в «Gloom Path»). Слова — в данных генератора (rareWords, poe2-data).
// Та же проверка, что nameIndex в tools/regex/poe2/build-poe2-regex-data.mjs.

import { foldYo } from '../format'

export interface NameIndex {
  /** Подстрока (нижний регистр, свёрнутая ё→е) задевает имя редкого предмета. */
  hits(sub: string): boolean
}

const cache = new WeakMap<readonly string[], NameIndex>()

export function nameIndex(words: readonly string[]): NameIndex {
  const hit = cache.get(words)
  if (hit) return hit
  const list = [...new Set(words.map((w) => foldYo(w.toLowerCase())))]
  const joined = '\n' + list.join('\n') + '\n'
  const ends = new Set<string>()
  const starts = new Set<string>()
  for (const w of list) {
    for (let i = 0; i < w.length; i++) {
      ends.add(w.slice(i))
      starts.add(w.slice(0, i + 1))
    }
  }
  const index: NameIndex = {
    hits(sub) {
      const f = foldYo(sub.toLowerCase())
      if (!f.includes(' ')) return joined.includes(f)
      if (list.some((w) => w.includes(f))) return true
      const parts = f.split(' ')
      return ends.has(parts[0]) && starts.has(parts[parts.length - 1])
    }
  }
  cache.set(words, index)
  return index
}
