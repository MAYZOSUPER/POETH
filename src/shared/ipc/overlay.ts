// IPC домена «игровой оверлей» — заполняет этап S1.
// TODO S1: активировать/деактивировать оверлей, updateInteractiveRects, focusGame, захват предмета (сырой текст), событие фокуса игры.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const overlayChannels = {} as const

export const overlayEvents = {} as const

export interface OverlayIpcApi {}
