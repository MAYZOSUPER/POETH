import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
import { getGameDef } from '@shared/games'

// «Скопировать предмет по-английски» (S51), main: хоткей → одно копирование (captureItemText) → запрос оверлею;
// запись в буфер — только от окна оверлея и только строкой разумной длины. Electron, хоткеи и ввод подменены.

const m = vi.hoisted(() => ({
  handlers: new Map<string, (e: { sender: unknown }, ...a: unknown[]) => unknown>(),
  hotkeys: new Map<string, () => Promise<void> | void>(),
  sent: [] as Array<[string, unknown]>,
  written: [] as string[],
  captures: 0,
  capture: null as { text: string; lang: 'ru' | 'en' } | null,
  overlayWc: { id: 'overlay' },
  otherWc: { id: 'companion' }
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (e: { sender: unknown }, ...a: unknown[]) => unknown) => m.handlers.set(ch, fn) },
  clipboard: { writeText: (t: string) => m.written.push(t) }
}))
vi.mock('../../src/main/hotkeys', () => ({
  onHotkeyAction: (id: string, fn: () => Promise<void> | void) => m.hotkeys.set(id, fn)
}))
vi.mock('../../src/main/windows/gameOverlay', () => ({
  getOverlayWindow: () => ({ webContents: m.overlayWc }),
  sendToOverlay: (ch: string, payload: unknown) => m.sent.push([ch, payload])
}))
vi.mock('../../src/main/input/gameInput', () => ({
  captureItemText: async () => {
    m.captures++
    return m.capture
  }
}))

const { registerCopyItemEn, setupCopyItemEn } = await import('../../src/main/ipc/itemEn')

beforeEach(() => {
  m.handlers.clear()
  m.hotkeys.clear()
  m.sent.length = 0
  m.written.length = 0
  m.captures = 0
  m.capture = null
})

describe('хоткей copyItemEn', () => {
  it('только PoE 1', () => {
    setupCopyItemEn(getGameDef('poe2'))
    expect(m.hotkeys.has('copyItemEn')).toBe(false)
    setupCopyItemEn(getGameDef('poe1'))
    expect(m.hotkeys.has('copyItemEn')).toBe(true)
  })

  it('одно нажатие — одно копирование; текст уходит только оверлею', async () => {
    setupCopyItemEn(getGameDef('poe1'))
    m.capture = { text: 'Класс предмета: Кольца\nРедкость: Редкий', lang: 'ru' }
    await m.hotkeys.get('copyItemEn')!()
    expect(m.captures).toBe(1)
    expect(m.sent).toEqual([[IPC.events.overlayItemEn, { text: m.capture.text, lang: 'ru' }]])
    // сам main в буфер ничего не пишет — ждёт английский текст от оверлея
    expect(m.written).toEqual([])
  })

  it('курсор не над предметом — уведомление, без запроса оверлею', async () => {
    setupCopyItemEn(getGameDef('poe1'))
    await m.hotkeys.get('copyItemEn')!()
    expect(m.captures).toBe(1)
    expect(m.sent).toEqual([[IPC.events.overlayNotice, { key: 'overlay.itemEn.noItem', kind: 'warn' }]])
  })
})

describe('канал overlay:copyItemEn', () => {
  it('пишет в буфер только от окна оверлея', async () => {
    registerCopyItemEn()
    const h = m.handlers.get(IPC.overlay.copyItemEn)!
    expect(await h({ sender: m.otherWc }, 'Item Class: Rings')).toBe(false)
    expect(m.written).toEqual([])
    expect(await h({ sender: m.overlayWc }, 'Item Class: Rings')).toBe(true)
    expect(m.written).toEqual(['Item Class: Rings'])
  })

  it('не строка, пустая или слишком длинная — отказ', async () => {
    registerCopyItemEn()
    const h = m.handlers.get(IPC.overlay.copyItemEn)!
    for (const bad of [null, 42, '', '   ', 'x'.repeat(33 * 1024)]) expect(await h({ sender: m.overlayWc }, bad)).toBe(false)
    expect(m.written).toEqual([])
  })
})
