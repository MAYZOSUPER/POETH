// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: функция `stat()` из renderer/src/assets/data/index.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: вместо проверки при init — реестр, который проверяет тест (tests/poe1/data.test.ts):
// каждый `ref`, на который код ссылается текстом, обязан существовать в данных en и ru.

const REFS = new Set<string>()

/** Пометить английский шаблон стата, на который код ссылается текстом. */
export function stat(text: string): string {
  REFS.add(text)
  return text
}

export function registeredStatRefs(): string[] {
  return Array.from(REFS)
}
