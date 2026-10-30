import { describe, expect, it } from 'vitest'
import { IPC } from '@shared/ipc'
import { TRADE_WINDOW_CHANNELS, ipcAllowed, isMainFrameOf } from '../../src/main/security/policy'

// Шапка и рельс трейд-окна (S58): свернуть, развернуть, рельс и его шторка — только сайдбар трейд-окна, и обработчик
// проверяет, что звал главный кадр сайдбара именно этого окна (isMainFrameOf). Сайт GGG и вкладки сайтов — без
// preload и с чужим адресом (страница null) — не достают ни до одного канала.

describe('TRADE_WINDOW_CHANNELS', () => {
  it('новые каналы окна — и только они', () => {
    expect([...TRADE_WINDOW_CHANNELS].sort()).toEqual(
      [IPC.tradeWindow.minimize, IPC.tradeWindow.toggleMaximize, IPC.tradeWindow.setRail, IPC.tradeWindow.railDrawer].sort()
    )
  })

  it('сайдбар трейд-окна — да; компаньон, оверлей, сайт GGG и чужие — нет', () => {
    for (const ch of TRADE_WINDOW_CHANNELS) {
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(true)
      expect(ipcAllowed('index', ch), ch).toBe(false)
      expect(ipcAllowed('overlay', ch), ch).toBe(false)
      expect(ipcAllowed(null, ch), ch).toBe(false)
    }
  })

  it('прежние каналы трейд-окна не задеты (их зовут и компаньон, и прайс-чек)', () => {
    for (const ch of [IPC.tradeWindow.open, IPC.tradeWindow.toggle, IPC.tradeWindow.hide, IPC.tradeWindow.state]) {
      expect(ipcAllowed('index', ch), ch).toBe(true)
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(true)
      expect(ipcAllowed(null, ch), ch).toBe(false)
    }
  })

  it('window.minimize домена app — окно компаньона, не трейд-окно', () => {
    expect(IPC.window.minimize).not.toBe(IPC.tradeWindow.minimize)
  })
})

describe('isMainFrameOf — звал главный кадр именно этих webContents', () => {
  const sidebar = { mainFrame: { processId: 12, routingId: 1 } }
  const companion = { mainFrame: { processId: 7, routingId: 1 } }

  it('главный кадр сайдбара — да', () => {
    expect(isMainFrameOf(sidebar, { processId: 12, routingId: 1 }, sidebar)).toBe(true)
  })

  it('другое окно (компаньон) — нет, даже если номер кадра совпал', () => {
    expect(isMainFrameOf(companion, { processId: 12, routingId: 1 }, sidebar)).toBe(false)
    expect(isMainFrameOf(companion, companion.mainFrame, sidebar)).toBe(false)
  })

  it('iframe в сайдбаре, ушедший кадр, нет окна — нет', () => {
    expect(isMainFrameOf(sidebar, { processId: 12, routingId: 5 }, sidebar)).toBe(false)
    expect(isMainFrameOf(sidebar, { processId: 13, routingId: 1 }, sidebar)).toBe(false)
    expect(isMainFrameOf(sidebar, null, sidebar)).toBe(false)
    expect(isMainFrameOf(sidebar, undefined, sidebar)).toBe(false)
    expect(isMainFrameOf(sidebar, sidebar.mainFrame, null)).toBe(false)
  })
})
