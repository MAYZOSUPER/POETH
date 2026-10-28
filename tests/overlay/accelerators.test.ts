import { describe, expect, it } from 'vitest'
import {
  isReservedAccelerator,
  keyCodeToCode,
  keyPressToAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  reservedReason,
  sameAccelerator
} from '@shared/accelerators'
import { HOTKEY_ACTIONS, HOTKEY_DEFAULTS } from '@shared/settings'

describe('parseAccelerator / normalizeAccelerator', () => {
  it('приводит модификаторы и клавишу к канонической записи', () => {
    expect(normalizeAccelerator('ctrl+shift+d')).toBe('Control+Shift+D')
    expect(normalizeAccelerator('Shift+Control+D')).toBe('Control+Shift+D')
    expect(normalizeAccelerator('CommandOrControl+V')).toBe('Control+V')
    expect(normalizeAccelerator('CmdOrCtrl+Return')).toBe('Control+Enter')
    expect(normalizeAccelerator('Alt+Esc')).toBe('Alt+Escape')
    expect(normalizeAccelerator('ArrowUp')).toBe('Up')
    expect(normalizeAccelerator('f5')).toBe('F5')
    expect(normalizeAccelerator('Control+Shift+[')).toBe('Control+Shift+[')
    expect(normalizeAccelerator('Shift+num5')).toBe('Shift+num5')
    expect(normalizeAccelerator('Meta+L')).toBe('Super+L')
  })

  it('отбрасывает не-акселераторы', () => {
    expect(parseAccelerator('')).toBeNull()
    expect(parseAccelerator('Control')).toBeNull()
    expect(parseAccelerator('Control+A+B')).toBeNull()
    expect(parseAccelerator('Control++')).toBeNull()
    expect(parseAccelerator('Control+Foo')).toBeNull()
    expect(parseAccelerator(undefined as unknown as string)).toBeNull()
  })

  it('sameAccelerator сравнивает по смыслу', () => {
    expect(sameAccelerator('Shift+Space', 'space+shift')).toBe(true)
    expect(sameAccelerator('Control+D', 'Control+Shift+D')).toBe(false)
    expect(sameAccelerator('', '')).toBe(false)
  })
})

describe('isReservedAccelerator', () => {
  it('сочетания игры и нашего ввода в игру запрещены (в любой записи)', () => {
    for (const a of [
      'Control+C',
      'CommandOrControl+C',
      'ctrl+v',
      'Control+A',
      'Control+F',
      'Control+Alt+C',
      'Control+Enter',
      'Enter',
      'Return',
      'Escape',
      'Home',
      'Delete',
      'Up',
      'ArrowLeft',
      'Right',
      'Space'
    ]) {
      expect(reservedReason(a), a).toBe('game')
    }
  })

  it('обычные символы (в т.ч. с Shift) мешают печатать в чате', () => {
    expect(reservedReason('Shift+A')).toBe('typing')
    expect(reservedReason('Shift+1')).toBe('typing')
    expect(reservedReason('Shift+[')).toBe('typing')
    expect(reservedReason('num5')).toBe('typing')
  })

  it('системные сочетания Windows запрещены', () => {
    expect(reservedReason('Alt+F4')).toBe('system')
    expect(reservedReason('Alt+Tab')).toBe('system')
    expect(reservedReason('Super+D')).toBe('system')
  })

  it('разрешены нормальные хоткеи', () => {
    for (const a of ['Control+D', 'Shift+Space', 'Alt+D', 'F5', 'Control+Shift+O', 'Control+1', 'Shift+F2']) {
      expect(isReservedAccelerator(a), a).toBe(false)
    }
    expect(isReservedAccelerator('')).toBe(false)
  })

  it('ни один хоткей по умолчанию не запрещён', () => {
    for (const action of HOTKEY_ACTIONS) {
      const { accel } = HOTKEY_DEFAULTS[action]
      expect(isReservedAccelerator(accel), `${action}: ${accel}`).toBe(false)
    }
  })
})

describe('синтетические нажатия без скан-кода (пустой code)', () => {
  it('Ctrl+D с key-управляющим символом U+0004 — это Control+D', () => {
    expect(keyPressToAccelerator({ code: '', key: '', control: true })).toBe('Control+D')
    expect(keyPressToAccelerator({ code: '', key: '', control: true, alt: true })).toBe('Control+Alt+A')
  })

  it('keyCodeToCode: буквы, цифры, F-клавиши; остальное — не знаем', () => {
    expect(keyCodeToCode(68)).toBe('KeyD')
    expect(keyCodeToCode(51)).toBe('Digit3')
    expect(keyCodeToCode(116)).toBe('F5')
    expect(keyCodeToCode(13)).toBe('')
  })
})

describe('keyPressToAccelerator', () => {
  it('нажатие → акселератор по физической клавише', () => {
    expect(keyPressToAccelerator({ code: 'KeyD', key: 'в', control: true })).toBe('Control+D')
    expect(keyPressToAccelerator({ code: 'Space', key: ' ', shift: true })).toBe('Shift+Space')
    expect(keyPressToAccelerator({ code: 'Escape', key: 'Escape' })).toBe('Escape')
    expect(keyPressToAccelerator({ code: 'BracketLeft', key: '[', control: true, shift: true })).toBe(
      'Control+Shift+['
    )
    expect(keyPressToAccelerator({ code: 'Numpad7', key: '7' })).toBe('num7')
    expect(keyPressToAccelerator({ code: 'F12', key: 'F12' })).toBe('F12')
  })

  it('только модификатор — не сочетание', () => {
    expect(keyPressToAccelerator({ code: 'ControlLeft', key: 'Control', control: true })).toBeNull()
    expect(keyPressToAccelerator({ code: 'ShiftRight', key: 'Shift', shift: true })).toBeNull()
  })

  it('синтетическое нажатие без code — по key', () => {
    expect(keyPressToAccelerator({ code: '', key: 'Escape' })).toBe('Escape')
    expect(keyPressToAccelerator({ code: '', key: ' ', shift: true })).toBe('Shift+Space')
    expect(keyPressToAccelerator({ code: '', key: 'd', control: true })).toBe('Control+D')
    expect(keyPressToAccelerator({ code: '', key: 'в', control: true })).toBeNull()
  })
})
