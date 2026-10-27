// IPC домена «вход в аккаунт и сеть» (этап S3).
// POESESSID и cookies НИКОГДА не уходят в renderer: только статус входа. Вставленный
// вручную POESESSID идёт в одну сторону (renderer → main) и обратно не возвращается.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type { AuthStatus, LeaguesState, PasteSessionResult } from '../types'

export const authChannels = {
  auth: {
    status: 'auth:status',
    login: 'auth:login',
    logout: 'auth:logout',
    recheck: 'auth:recheck',
    pasteSession: 'auth:pasteSession'
  },
  leagues: {
    get: 'leagues:get',
    refresh: 'leagues:refresh'
  }
} as const

export const authEvents = {
  authStatus: 'event:auth.status',
  authLeagues: 'event:auth.leagues'
} as const

export interface AuthIpcApi {
  auth: {
    /** текущий статус входа (без cookie) */
    status(): Promise<AuthStatus>
    /** открыть окно входа на официальной странице GGG (https://<siteHost>/login) */
    login(): Promise<void>
    /** выйти: очистить сессию POETH (partition persist:poe-account) */
    logout(): Promise<AuthStatus>
    /** перепроверить сессию на сайте */
    recheck(): Promise<AuthStatus>
    /** фолбэк: сохранить POESESSID, вставленный вручную (значение назад не возвращается) */
    pasteSession(poesessid: string): Promise<PasteSessionResult>
  }
  leagues: {
    /** лиги PoE1 и выбранная/авто лига */
    get(): Promise<LeaguesState>
    /** обновить список с сервера */
    refresh(): Promise<LeaguesState>
  }
  /** статус входа изменился */
  onAuthStatus(cb: (status: AuthStatus) => void): () => void
  /** список лиг или авто-лига изменились */
  onLeagues(cb: (state: LeaguesState) => void): () => void
}
