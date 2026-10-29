import type { IpcMain } from 'electron'

// Проверка отправителя для КАЖДОГО канала IPC (S29). Домены регистрируют обработчики сами
// (src/main/ipc/<домен>.ts, реестр заморожен), поэтому проверка встаёт на сам ipcMain до регистрации:
// handle/on/once оборачивают обработчик, и он вызывается, только если allowed(event, channel).
// Чужой отправитель: invoke получает ошибку, send — молча отбрасывается (и одна строка в лог на канал).

/** Событие IPC: важен только кадр-отправитель (его адрес). */
export interface IpcSenderEvent {
  senderFrame?: { url: string } | null
}

export type IpcSenderCheck = (event: IpcSenderEvent, channel: string) => boolean

type Listener = (event: never, ...args: never[]) => unknown
type Target = Pick<IpcMain, 'handle' | 'handleOnce' | 'on' | 'once' | 'addListener'>

/** Адрес кадра-отправителя; кадр уже уничтожен или ушёл — пустая строка. */
export function senderUrl(event: IpcSenderEvent): string {
  try {
    return event.senderFrame?.url ?? ''
  } catch {
    return ''
  }
}

const guarded = new WeakSet<object>()

/** Обернуть методы регистрации ipcMain. Повторный вызов на том же объекте — no-op. */
export function guardIpcMain(ipc: Target, allowed: IpcSenderCheck, onReject: (channel: string, url: string) => void): void {
  if (guarded.has(ipc)) return
  guarded.add(ipc)
  const check = (event: IpcSenderEvent, channel: string): boolean => {
    let ok = false
    try {
      ok = allowed(event, channel)
    } catch {
      ok = false
    }
    if (!ok) onReject(channel, senderUrl(event))
    return ok
  }
  const wrapHandle = (orig: Target['handle']): Target['handle'] =>
    ((channel: string, listener: Listener) =>
      orig.call(ipc, channel, (event, ...args) => {
        if (!check(event, channel)) throw new Error(`ipc: untrusted sender for ${channel}`)
        return (listener as (...a: unknown[]) => unknown)(event, ...args)
      })) as Target['handle']
  const wrapOn = (orig: Target['on']): Target['on'] =>
    ((channel: string, listener: Listener) =>
      orig.call(ipc, channel, (event, ...args) => {
        if (check(event, channel)) (listener as (...a: unknown[]) => unknown)(event, ...args)
      })) as Target['on']
  ipc.handle = wrapHandle(ipc.handle)
  ipc.handleOnce = wrapHandle(ipc.handleOnce)
  ipc.on = wrapOn(ipc.on)
  ipc.addListener = wrapOn(ipc.addListener)
  ipc.once = wrapOn(ipc.once)
}
