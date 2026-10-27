// IPC домена «live search» — заполняет этап S6.
// TODO S6: list/start/stop/state live-поисков, события event:live.hit / event:live.state.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const liveChannels = {} as const

export const liveEvents = {} as const

export interface LiveIpcApi {}
