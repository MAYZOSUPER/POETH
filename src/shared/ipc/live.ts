// IPC домена «live search» (S6). Соединения и cookies — только в main; сюда приходят
// состояние поисков и находки. «Написать» вставляет whisper в чат и не отправляет.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  LiveAddResult,
  LiveHitEvent,
  LiveOptions,
  LiveSnapshot,
  LiveWhisperResult
} from '../types'

export const liveChannels = {
  live: {
    state: 'live:state',
    add: 'live:add',
    remove: 'live:remove',
    setEnabled: 'live:setEnabled',
    update: 'live:update',
    setOptions: 'live:setOptions',
    whisper: 'live:whisper',
    copyWhisper: 'live:copyWhisper',
    openHit: 'live:openHit'
  }
} as const

export const liveEvents = {
  liveState: 'event:live.state',
  liveHit: 'event:live.hit'
} as const

export interface LiveIpcApi {
  live: {
    state(): Promise<LiveSnapshot>
    /** добавить по ссылке на поиск сайта трейда PoE1, «лига/код» или коду */
    add(input: string, title?: string): Promise<LiveAddResult>
    remove(id: string): Promise<void>
    /** 'limit' — уже включено settings.live.maxSearches поисков */
    setEnabled(id: string, enabled: boolean): Promise<'ok' | 'limit' | 'not-found'>
    update(id: string, patch: { title?: string; sound?: boolean }): Promise<void>
    setOptions(patch: Partial<LiveOptions>): Promise<LiveSnapshot>
    /** вставить whisper находки в чат игры (не отправляет — Enter жмёт игрок) */
    whisper(hitKey: string): Promise<LiveWhisperResult>
    /** скопировать whisper в буфер обмена */
    copyWhisper(hitKey: string): Promise<boolean>
    /** открыть лот (до трейд-окна S5 — страница поиска в браузере) */
    openHit(hitKey: string): Promise<boolean>
  }
  onLiveState(cb: (s: LiveSnapshot) => void): () => void
  onLiveHit(cb: (e: LiveHitEvent) => void): () => void
}
