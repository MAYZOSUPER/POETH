// IPC домена «избранное и трейд-окно» — заполняет этап S5.
// TODO S5: папки/поиски избранного (CRUD), импорт/экспорт Better Trading, показать/скрыть трейд-окно, открыть поиск.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const favChannels = {} as const

export const favEvents = {} as const

export interface FavIpcApi {}
