import { describe, expect, it } from 'vitest'
import { windowsToastsPolicy } from '../../src/main/services/toastPolicy'

// Тосты Windows: Electron при первом тосте ставит в «Пуск» ярлык и COM-ключ на свой exe — тестовые и
// dev-запуски не должны всплывать у игрока «от Electron» и оставлять следы.

const packaged = { packaged: true, portable: false, env: {} }

describe('windowsToastsPolicy — когда показывать уведомления Windows', () => {
  it('установленная версия — да', () => {
    expect(windowsToastsPolicy(packaged)).toBe(true)
  })

  it('dev (electron.exe) — нет, только явно через POETH_DEV_TOASTS=1', () => {
    expect(windowsToastsPolicy({ ...packaged, packaged: false })).toBe(false)
    expect(windowsToastsPolicy({ ...packaged, packaged: false, env: { POETH_DEV_TOASTS: '0' } })).toBe(false)
    expect(windowsToastsPolicy({ ...packaged, packaged: false, env: { POETH_DEV_TOASTS: '1' } })).toBe(true)
  })

  it('portable — нет, даже с POETH_DEV_TOASTS', () => {
    expect(windowsToastsPolicy({ ...packaged, portable: true })).toBe(false)
    expect(windowsToastsPolicy({ ...packaged, portable: true, env: { POETH_DEV_TOASTS: '1' } })).toBe(false)
  })

  it('POETH_NO_WINDOWS_TOASTS=1 (автопроверки) — нет всегда', () => {
    expect(windowsToastsPolicy({ ...packaged, env: { POETH_NO_WINDOWS_TOASTS: '1' } })).toBe(false)
    expect(windowsToastsPolicy({ packaged: false, portable: false, env: { POETH_NO_WINDOWS_TOASTS: '1', POETH_DEV_TOASTS: '1' } })).toBe(false)
  })
})
