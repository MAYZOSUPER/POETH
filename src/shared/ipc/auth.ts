// IPC домена «вход в аккаунт» — заполняет этап S3.
// TODO S3: status()/login()/logout() + событие смены статуса. POESESSID и cookies НИКОГДА не уходят в renderer.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

export const authChannels = {} as const

export const authEvents = {} as const

export interface AuthIpcApi {}
