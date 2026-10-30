// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: функция `stat()` из renderer/src/assets/data/index.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: как у PoE1 (src/shared/poe1/parser/statRef.ts) — вместо проверки при init реестр, который
// проверяет тест (tests/poe2/parser.test.ts): каждый `ref`, на который код ссылается текстом, обязан существовать
// в данных PoE2 en и ru. Реестр отдельный от PoE1 (данные разные).

const REFS = new Set<string>()

/** Пометить английский шаблон стата PoE2, на который код ссылается текстом. */
export function stat(text: string): string {
  REFS.add(text)
  return text
}

export function registeredStatRefs(): string[] {
  return Array.from(REFS)
}
