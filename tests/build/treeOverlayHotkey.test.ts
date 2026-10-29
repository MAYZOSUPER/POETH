import { describe, expect, it } from 'vitest'
import { planHotkeys } from '../../src/main/input/hotkeyPlan'
import { findHotkeyConflict } from '@shared/chatCommands'
import { HOTKEY_DEFAULTS, defaultHotkeys } from '@shared/settings'
import { isReservedAccelerator } from '@shared/accelerators'

// Хоткей наложения дерева этапа (S38): Alt+P в области game — только пока игра в фокусе, игрой и нашими
// хоткеями не занят; регистрируется, только если у действия есть обработчик (функция включена флагом).

describe('buildTree — Alt+P', () => {
  it('по умолчанию Alt+P, область game, не зарезервирован', () => {
    expect(HOTKEY_DEFAULTS.buildTree).toEqual({ accel: 'Alt+P', scope: 'game' })
    expect(isReservedAccelerator('Alt+P')).toBe(false)
  })

  it('не совпадает с другими хоткеями по умолчанию', () => {
    const cur = { hotkeys: defaultHotkeys(), chatCommands: [] }
    expect(findHotkeyConflict('Alt+P', cur, { action: 'buildTree' })).toBeNull()
  })

  it('без обработчика (функция выключена) — не регистрируется', () => {
    const on = planHotkeys(defaultHotkeys(), () => true)
    expect(on.game).toContainEqual({ action: 'buildTree', accel: 'Alt+P', scope: 'game' })
    const off = planHotkeys(defaultHotkeys(), (a) => a !== 'buildTree')
    expect(off.game.map((h) => h.action)).not.toContain('buildTree')
  })
})
