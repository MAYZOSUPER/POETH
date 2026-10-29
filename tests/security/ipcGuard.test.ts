import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { guardIpcMain, senderUrl, type IpcSenderEvent } from '../../src/main/security/ipcGuard'

// Обёртка ipcMain (S29): обработчик домена вызывается, только если отправитель прошёл проверку.

const OK = 'file:///app/out/renderer/index.html'
const EVIL = 'https://www.pathofexile.com/forum'

/** Мини-ipcMain: handle/handleOnce хранят обработчик, on/once — EventEmitter, как у Electron. */
class FakeIpc extends EventEmitter {
  handlers = new Map<string, (e: IpcSenderEvent, ...a: unknown[]) => unknown>()
  handle(ch: string, fn: (e: IpcSenderEvent, ...a: unknown[]) => unknown): void {
    this.handlers.set(ch, fn)
  }
  handleOnce(ch: string, fn: (e: IpcSenderEvent, ...a: unknown[]) => unknown): void {
    this.handlers.set(ch, fn)
  }
  invoke(ch: string, url: string | null, ...args: unknown[]): unknown {
    return this.handlers.get(ch)?.({ senderFrame: url === null ? null : { url } }, ...args)
  }
  send(ch: string, url: string, ...args: unknown[]): void {
    this.emit(ch, { senderFrame: { url } }, ...args)
  }
}

function setup(): { ipc: FakeIpc; rejected: string[] } {
  const ipc = new FakeIpc()
  const rejected: string[] = []
  guardIpcMain(
    ipc as never,
    (e, ch) => senderUrl(e) === OK && ch !== 'overlay:typeInChat-denied',
    (ch, url) => rejected.push(`${ch} ${url}`)
  )
  return { ipc, rejected }
}

describe('guardIpcMain', () => {
  it('handle: свой отправитель — обработчик с аргументами, чужой — ошибка без вызова', () => {
    const { ipc, rejected } = setup()
    const fn = vi.fn((_e: unknown, a: unknown, b: unknown) => `${a}+${b}`)
    ipc.handle('settings:get', fn)
    expect(ipc.invoke('settings:get', OK, 1, 2)).toBe('1+2')
    expect(() => ipc.invoke('settings:get', EVIL)).toThrow(/untrusted sender/)
    expect(() => ipc.invoke('settings:get', null)).toThrow(/untrusted sender/)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(rejected).toEqual([`settings:get ${EVIL}`, 'settings:get '])
  })

  it('handleOnce — так же', () => {
    const { ipc } = setup()
    const fn = vi.fn(() => 'ok')
    ipc.handleOnce('app:info', fn)
    expect(() => ipc.invoke('app:info', EVIL)).toThrow()
    expect(fn).not.toHaveBeenCalled()
  })

  it('on/addListener/once: чужое сообщение молча отбрасывается', () => {
    const { ipc, rejected } = setup()
    const on = vi.fn()
    const add = vi.fn()
    const once = vi.fn()
    ipc.on('overlay:activate', on)
    ipc.addListener('overlay:focusGame', add)
    ipc.once('window:minimize', once)
    ipc.send('overlay:activate', EVIL)
    ipc.send('overlay:focusGame', EVIL)
    ipc.send('window:minimize', EVIL)
    expect(on).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(rejected).toHaveLength(3)
    ipc.send('overlay:activate', OK, 'x')
    ipc.send('overlay:focusGame', OK)
    expect(on).toHaveBeenCalledWith({ senderFrame: { url: OK } }, 'x')
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('проверка по каналу: тот же отправитель, запрещённый канал — отказ', () => {
    const { ipc } = setup()
    const fn = vi.fn()
    ipc.handle('overlay:typeInChat-denied', fn)
    expect(() => ipc.invoke('overlay:typeInChat-denied', OK, 'text')).toThrow()
    expect(fn).not.toHaveBeenCalled()
  })

  it('падение проверки = отказ; повторная установка не оборачивает дважды', () => {
    const ipc = new FakeIpc()
    const check = vi.fn(() => {
      throw new Error('boom')
    })
    guardIpcMain(ipc as never, check, () => undefined)
    guardIpcMain(ipc as never, () => true, () => undefined)
    const fn = vi.fn()
    ipc.handle('x', fn)
    expect(() => ipc.invoke('x', OK)).toThrow(/untrusted sender/)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('senderUrl: кадр, который бросает при чтении адреса, — пустая строка', () => {
    const frame = Object.defineProperty({}, 'url', {
      get() {
        throw new Error('frame destroyed')
      }
    }) as { url: string }
    expect(senderUrl({ senderFrame: frame })).toBe('')
    expect(senderUrl({})).toBe('')
  })
})
