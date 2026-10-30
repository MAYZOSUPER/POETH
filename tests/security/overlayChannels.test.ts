import { describe, expect, it } from 'vitest'
import { IPC } from '@shared/ipc'
import { OVERLAY_CHANNELS, ipcAllowed } from '../../src/main/security/policy'

// Каналы наложения дерева билда (S38) и «Против надетого» окна цены (S41) зовёт только игровой оверлей: компаньону и
// сайдбару трейд-окна они не нужны.

describe('OVERLAY_CHANNELS', () => {
  it('все каналы доменов buildTree и equip — и только они', () => {
    expect([...OVERLAY_CHANNELS].sort()).toEqual([...Object.values(IPC.buildTree), ...Object.values(IPC.equip)].sort())
  })

  it('оверлей — да; компаньон, сайдбар и чужие страницы — нет', () => {
    for (const ch of OVERLAY_CHANNELS) {
      expect(ipcAllowed('overlay', ch), ch).toBe(true)
      expect(ipcAllowed('index', ch), ch).toBe(false)
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(false)
      expect(ipcAllowed(null, ch), ch).toBe(false)
    }
  })

  it('остальные каналы оверлея не задеты', () => {
    expect(ipcAllowed('index', IPC.overlay.updateInteractiveRects)).toBe(true)
    expect(ipcAllowed('overlay', IPC.overlay.updateInteractiveRects)).toBe(true)
  })
})
