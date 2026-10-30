import { describe, expect, it, vi } from 'vitest'

// S49: переключатели Chromium до ready — POETH не открывает портов на приём (окно брандмауэра Windows).
// mDNS-ответчик WebRTC (UDP 5353) выключен фичей; уже заданный --disable-features не затирается.

const switches: Array<[string, string]> = []

vi.mock('electron', () => ({
  app: {
    userAgentFallback: 'Mozilla/5.0 Chrome/146 Electron/44 POETH/0.1.0',
    getVersion: () => '0.1.0',
    getName: () => 'POETH',
    commandLine: {
      appendSwitch: (name: string, value = '') => void switches.push([name, value]),
      // как base::CommandLine: последнее значение; до нас кто-то уже выключил свою фичу
      getSwitchValue: (name: string) =>
        [...switches].reverse().find(([n]) => n === name)?.[1] ?? (name === 'disable-features' ? 'SomeOtherFeature' : '')
    }
  },
  session: {}
}))

const { initNetIdentity, DISABLED_CHROMIUM_FEATURES } = await import('../../src/main/net/session')

describe('initNetIdentity: переключатели Chromium', () => {
  it('mDNS-ответчик WebRTC выключен, чужой --disable-features сохранён, повторный вызов — no-op', () => {
    expect(DISABLED_CHROMIUM_FEATURES).toContain('WebRtcHideLocalIpsWithMdns')
    initNetIdentity()
    initNetIdentity()
    expect(switches).toEqual([
      ['disable-blink-features', 'AutomationControlled'],
      ['disable-features', 'SomeOtherFeature,WebRtcHideLocalIpsWithMdns']
    ])
  })
})
