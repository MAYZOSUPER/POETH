import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Буфер обмена Electron 44 (W3C, всё на Promise) — имитация с теми же свойствами, что у настоящего:
// элемент из read() ленивый (getType читает буфер в момент вызова), write() коммитит после await,
// writeText пишет сразу. Проверяем порядок «снимок → очистка → Ctrl+C» и возврат буфера игрока.

type Store = Record<string, string>

const cb = vi.hoisted(() => ({
  store: {} as Record<string, string>,
  failRead: false,
  log: [] as string[]
}))

vi.mock('electron', () => {
  class ClipboardItem {
    constructor(readonly data: Record<string, Blob | string>) {}
    get types(): string[] {
      return Object.keys(this.data)
    }
  }
  const lazyItem = () => ({
    types: Object.keys(cb.store),
    getType: async (type: string) => new Blob([cb.store[type] ?? ''], { type })
  })
  const clipboard = {
    clear: () => {
      cb.log.push('clear')
      cb.store = {}
    },
    readText: async () => cb.store['text/plain'] ?? '',
    writeText: async (text: string) => {
      cb.log.push(`writeText:${text}`)
      cb.store = { 'text/plain': text }
    },
    read: async () => {
      if (cb.failRead) throw new Error('read failed')
      cb.log.push('read')
      return Object.keys(cb.store).length ? [lazyItem()] : []
    },
    write: async (items: ClipboardItem[]) => {
      const next: Store = {}
      for (const item of items) {
        for (const [type, v] of Object.entries(item.data)) next[type] = typeof v === 'string' ? v : await v.text()
      }
      cb.log.push(`write:${Object.keys(next).join(',')}`)
      cb.store = next
    }
  }
  return { clipboard, ClipboardItem }
})

import { HostClipboard } from '../../src/main/input/hostClipboard'

const ITEM = ['Item Class: Stackable Currency', 'Rarity: Currency', 'Chaos Orb'].join('\r\n')
const USER: Store = { 'text/plain': 'пароль игрока', 'text/html': '<b>пароль</b>', 'text/rtf': '{\\rtf1 x}' }

/** «Игра»: через 30 мс после Ctrl+C кладёт текст предмета в буфер. */
function gameCopies(text: string | null) {
  return vi.fn(() => {
    cb.log.push('Ctrl+C')
    if (text !== null) setTimeout(() => (cb.store = { 'text/plain': text }), 30)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  cb.store = { ...USER }
  cb.failRead = false
  cb.log = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('HostClipboard (Electron 44)', () => {
  it('Ctrl+D: снимок, очистка, потом Ctrl+C; текст предмета; буфер игрока вернулся целиком', async () => {
    const hc = new HostClipboard()
    const press = gameCopies(ITEM)
    const res = hc.readItemText(press)
    expect(press).not.toHaveBeenCalled() // снимок асинхронный — клавиши только после него
    await vi.advanceTimersByTimeAsync(200)
    await expect(res).resolves.toBe(ITEM)
    expect(press).toHaveBeenCalledTimes(1)
    expect(cb.log.slice(0, 3)).toEqual(['read', 'clear', 'Ctrl+C'])
    expect(cb.store).toEqual(USER)
    expect(hc.isPolling).toBe(false)
  })

  it('курсор не над предметом: null через ~500 мс, буфер игрока вернулся', async () => {
    const hc = new HostClipboard()
    const res = hc.readItemText(gameCopies(null))
    await vi.advanceTimersByTimeAsync(400)
    expect(hc.isPolling).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    await expect(res).resolves.toBeNull()
    expect(cb.store).toEqual(USER)
  })

  it('пустой буфер игрока: после Ctrl+D снова пустой', async () => {
    cb.store = {}
    const hc = new HostClipboard()
    const res = hc.readItemText(gameCopies(ITEM))
    await vi.advanceTimersByTimeAsync(200)
    await expect(res).resolves.toBe(ITEM)
    expect(cb.store).toEqual({})
  })

  it('повторный Ctrl+D во время опроса — тот же результат, копирование нажато ещё раз, снимок один', async () => {
    const hc = new HostClipboard()
    const press = gameCopies(null)
    const a = hc.readItemText(press)
    await vi.advanceTimersByTimeAsync(100)
    const press2 = gameCopies(ITEM)
    const b = hc.readItemText(press2)
    expect(b).toBe(a)
    await vi.advanceTimersByTimeAsync(200)
    await expect(a).resolves.toBe(ITEM)
    expect(press2).toHaveBeenCalledTimes(1)
    expect(cb.log.filter((l) => l === 'read')).toHaveLength(1)
    expect(cb.store).toEqual(USER)
  })

  it('снимок не прочитался — Ctrl+C не нажат, буфер не тронут', async () => {
    cb.failRead = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const hc = new HostClipboard()
    const press = gameCopies(ITEM)
    const res = hc.readItemText(press)
    await vi.advanceTimersByTimeAsync(600)
    await expect(res).resolves.toBeNull()
    expect(press).not.toHaveBeenCalled()
    expect(cb.store).toEqual(USER)
    err.mockRestore()
  })

  it('ввод в чат: строка в буфере до клавиш, через 120 мс буфер игрока; повтор раньше — busy', async () => {
    const hc = new HostClipboard()
    const seen: string[] = []
    const ok = hc.restoreShortly(async (clip) => {
      await clip.writeText('@Buyer hi')
      seen.push(await clip.readText()) // здесь жмутся Ctrl+V/Enter
    })
    expect(ok).toBe(true)
    expect(hc.restoreShortly(async () => undefined)).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(seen).toEqual(['@Buyer hi'])
    expect(cb.store['text/plain']).toBe('@Buyer hi')
    await vi.advanceTimersByTimeAsync(100)
    expect(cb.store).toEqual(USER)
    expect(hc.restoreShortly(async () => undefined)).toBe(true)
  })

  it('Ctrl+D сразу после ввода в чат ждёт возврата буфера и запоминает буфер игрока, а не строку чата', async () => {
    const hc = new HostClipboard()
    hc.restoreShortly(async (clip) => {
      await clip.writeText('/hideout')
    })
    await vi.advanceTimersByTimeAsync(10)
    const press = gameCopies(ITEM)
    const res = hc.readItemText(press)
    await vi.advanceTimersByTimeAsync(60)
    expect(press).not.toHaveBeenCalled() // ещё не вернули буфер после чата
    await vi.advanceTimersByTimeAsync(300)
    await expect(res).resolves.toBe(ITEM)
    expect(cb.store).toEqual(USER)
  })

  it('Ctrl+D подряд: второй снимок — после возврата буфера первым', async () => {
    const hc = new HostClipboard()
    const a = hc.readItemText(gameCopies(ITEM))
    await vi.advanceTimersByTimeAsync(200)
    await expect(a).resolves.toBe(ITEM)
    const b = hc.readItemText(gameCopies(ITEM))
    await vi.advanceTimersByTimeAsync(200)
    await expect(b).resolves.toBe(ITEM)
    expect(cb.store).toEqual(USER)
  })
})
