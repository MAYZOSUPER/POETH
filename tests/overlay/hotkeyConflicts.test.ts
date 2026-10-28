import { describe, expect, it } from 'vitest'
import { HotkeyConflicts } from '../../src/main/input/hotkeyConflicts'

// Хоткей занят другой программой (APT, Sidekick — тоже Ctrl+D): плашка в настройках
// и предупреждение поверх игры — не чаще раза за сессию на сочетание.

describe('HotkeyConflicts', () => {
  it('занятое сочетание попадает в список, предупреждение — один раз за сессию', () => {
    const c = new HotkeyConflicts()
    expect(c.report('priceCheck', 'Control+D', false)).toBe(true)
    expect(c.list()).toEqual([{ action: 'priceCheck', accel: 'Control+D' }])
    // каждый возврат фокуса в игру — новая попытка; спама нет
    expect(c.report('priceCheck', 'Control+D', false)).toBe(false)
    expect(c.report('priceCheck', 'Control+D', false)).toBe(false)
    expect(c.list()).toHaveLength(1)
  })

  it('другую программу закрыли — регистрация прошла, конфликт снят', () => {
    const c = new HotkeyConflicts()
    c.report('priceCheck', 'Control+D', false)
    expect(c.report('priceCheck', 'Control+D', true)).toBe(false)
    expect(c.list()).toEqual([])
    // снова заняли в том же запуске — уже предупреждали, только в список
    expect(c.report('priceCheck', 'Control+D', false)).toBe(false)
    expect(c.list()).toHaveLength(1)
  })

  it('новое сочетание того же действия — снова предупредить; разные действия независимы', () => {
    const c = new HotkeyConflicts()
    expect(c.report('priceCheck', 'Control+D', false)).toBe(true)
    expect(c.report('priceCheck', 'Control+Alt+D', false)).toBe(true)
    expect(c.report('chat:hideout', 'F5', false)).toBe(true)
    expect(c.list()).toEqual([
      { action: 'priceCheck', accel: 'Control+Alt+D' },
      { action: 'chat:hideout', accel: 'F5' }
    ])
  })

  it('сменили сочетание или убрали действие в настройках — конфликт больше не показывается', () => {
    const c = new HotkeyConflicts()
    c.report('priceCheck', 'Control+D', false)
    c.report('overlayToggle', 'Shift+Space', false)
    c.report('chat:hideout', 'F5', false)
    c.retain([
      { action: 'priceCheck', accel: 'Control+Alt+D' },
      { action: 'overlayToggle', accel: 'Shift+Space' }
    ])
    expect(c.list()).toEqual([{ action: 'overlayToggle', accel: 'Shift+Space' }])
  })
})
