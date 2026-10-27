// IPC домена «regex-строки» — заполняет этап S7.
// TODO S7: сборка строки по выбранным модам, библиотека сохранённых строк, вставка в игру (pasteSearch1..5).
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const regexChannels = {} as const

export const regexEvents = {} as const

export interface RegexIpcApi {}
