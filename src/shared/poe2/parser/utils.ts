// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/utils.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: сюда же перенесены чистые хелперы из Parser.ts EE2 (removeLinesEnding, replaceHashWithValues,
// parseAffixStrings) — чтобы advanced-mod-desc.ts и augment-builder.ts не импортировали Parser.ts (цикл импортов).

export function combinations<T>(arr: T[]): T[][] {
  return arr.reduce<T[][]>((acc, curr) => [...acc, ...acc.map((a) => [...a, curr])], [[]])
}

export function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

/** Из Parser.ts EE2. */
export function removeLinesEnding(lines: readonly string[], ending: string): string[] {
  return lines.map((line) => (line.endsWith(ending) ? line.slice(0, -ending.length) : line))
}

/** Из Parser.ts EE2. */
export function parseAffixStrings(text: string): string {
  return text.replace(/\[([^\]|]+)\|?([^\]]*)\]/g, (_, part1: string, part2: string) => {
    return part2 || part1
  })
}

/** Из Parser.ts EE2. */
export function replaceHashWithValues(template: string, values: number[]): string {
  let result = template
  values.forEach((value: number) => {
    result = result.replace('#', value.toString()) // Replace the first occurrence of #
  })
  return result
}
