// IPC домена «менеджер сделок» — заполняет этап S8.
// TODO S8: события входящих/исходящих whisper'ов, действия карточек (invite/trade/kick/…), история, подсветка стэша.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const dealsChannels = {} as const

export const dealsEvents = {} as const

export interface DealsIpcApi {}
