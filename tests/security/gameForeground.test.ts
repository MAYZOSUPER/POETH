import { describe, expect, it, vi } from 'vitest'

// Без нативного модуля оверлея (electron-overlay-window не загрузился или POETH_OVERLAY_NO_ATTACH) POETH
// не знает, какое окно в фокусе, — ввод в чат и поиск не делаются (S29). Раньше хватало «наше окно не в
// фокусе», и клавиши уходили в любое активное окно (браузер, мессенджер).

vi.mock('electron', () => ({
  // ни одно окно POETH не в фокусе — прежняя проверка в этом случае разрешала ввод
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {},
  screen: {},
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  app: { isPackaged: false, on: () => undefined, getPath: () => '.', getAppPath: () => '.' }
}))

const { ensureGameForeground } = await import('../../src/main/windows/gameOverlay')

describe('ensureGameForeground без модуля оверлея', () => {
  it('ввод в игру запрещён, даже если окна POETH не в фокусе', () => {
    expect(ensureGameForeground()).toBe(false)
  })
})
