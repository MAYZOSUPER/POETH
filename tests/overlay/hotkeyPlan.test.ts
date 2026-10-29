import { describe, expect, it } from 'vitest'
import { planHotkeys, type HotkeyId } from '../../src/main/input/hotkeyPlan'
import { defaultHotkeys } from '@shared/settings'
import { findHotkeyConflict } from '@shared/chatCommands'

const all = (): boolean => true

describe('planHotkeys', () => {
  it('дефолты раскладываются по областям game / always', () => {
    const plan = planHotkeys(defaultHotkeys(), all)
    expect(plan.game.map((h) => h.action)).toEqual([
      'priceCheck',
      'overlayToggle',
      'dealInvite',
      'dealTrade',
      'dealDismiss',
      'levelingToggle',
      'bookRead',
      'buildTree'
    ])
    expect(plan.always.map((h) => h.action)).toEqual([
      'toggleCompanion',
      'toggleLock',
      'toggleTradeWindow',
      'prevStep',
      'nextStep'
    ])
    expect(plan.skipped).toEqual([])
    expect(plan.game[0]).toEqual({ action: 'priceCheck', accel: 'Control+D', scope: 'game' })
  })

  it('регистрируются только действия с обработчиком', () => {
    const handled = new Set<HotkeyId>(['priceCheck', 'toggleCompanion'])
    const plan = planHotkeys(defaultHotkeys(), (a) => handled.has(a))
    expect([...plan.game, ...plan.always].map((h) => h.action)).toEqual(['priceCheck', 'toggleCompanion'])
  })

  it('зарезервированные, ошибочные и повторы пропускаются с причиной', () => {
    const map = defaultHotkeys()
    map.priceCheck = { accel: 'Control+C', scope: 'game' }
    map.whisperLastHit = { accel: 'Shift+A', scope: 'game' }
    map.pasteSearch1 = { accel: 'Control+Bogus', scope: 'game' }
    map.pasteSearch2 = { accel: 'shift+space', scope: 'game' } // тот же, что overlayToggle
    map.toggleLock = { accel: 'Alt+F4', scope: 'always' }
    const plan = planHotkeys(map, all)
    expect(plan.skipped).toEqual([
      { action: 'priceCheck', accel: 'Control+C', reason: 'game' },
      { action: 'whisperLastHit', accel: 'Shift+A', reason: 'typing' },
      { action: 'pasteSearch1', accel: 'Control+Bogus', reason: 'invalid' },
      { action: 'pasteSearch2', accel: 'Shift+Space', reason: 'duplicate' },
      { action: 'toggleLock', accel: 'Alt+F4', reason: 'system' }
    ])
    expect(plan.game.map((h) => h.action)).toEqual([
      'overlayToggle',
      'dealInvite',
      'dealTrade',
      'dealDismiss',
      'levelingToggle',
      'bookRead',
      'buildTree'
    ])
  })

  it('регистрируется каноническая запись', () => {
    const map = defaultHotkeys()
    map.priceCheck = { accel: 'ctrl+alt+d', scope: 'game' }
    expect(planHotkeys(map, all).game[0].accel).toBe('Control+Alt+D')
  })

  it('команды чата: тот же план, обычные хоткеи побеждают при совпадении', () => {
    const map = defaultHotkeys()
    const plan = planHotkeys(map, all, [
      { action: 'chat:hideout', accel: 'F5', scope: 'game' },
      { action: 'chat:dup', accel: 'control+d', scope: 'game' }, // = priceCheck
      { action: 'chat:bad', accel: 'Enter', scope: 'game' },
      { action: 'chat:dup2', accel: 'F5', scope: 'game' }
    ])
    expect(plan.game.map((h) => h.action)).toEqual([
      'priceCheck',
      'overlayToggle',
      'dealInvite',
      'dealTrade',
      'dealDismiss',
      'levelingToggle',
      'bookRead',
      'buildTree',
      'chat:hideout'
    ])
    expect(plan.skipped).toEqual([
      { action: 'chat:dup', accel: 'Control+D', reason: 'duplicate' },
      { action: 'chat:bad', accel: 'Enter', reason: 'game' },
      { action: 'chat:dup2', accel: 'F5', reason: 'duplicate' }
    ])
  })

  it('стакан «Обмена» (S28): bookRead — Alt+D в области game, свободен, не совпадает с Ctrl+D', () => {
    const plan = planHotkeys(defaultHotkeys(), all)
    expect(plan.game).toContainEqual({ action: 'bookRead', accel: 'Alt+D', scope: 'game' })
    const cur = { hotkeys: defaultHotkeys(), chatCommands: [] }
    expect(findHotkeyConflict('Alt+D', cur, { action: 'bookRead' })).toBeNull()
    expect(findHotkeyConflict('Control+D', cur, { action: 'bookRead' })).toEqual({ kind: 'action', action: 'priceCheck' })
  })

  it('гид прокачки (S14): levelingToggle — Ctrl+Shift+G в области game, свободен; конфликты — с причиной', () => {
    const plan = planHotkeys(defaultHotkeys(), all)
    expect(plan.game).toContainEqual({ action: 'levelingToggle', accel: 'Control+Shift+G', scope: 'game' })
    // все сочетания по умолчанию разные
    const accels = [...plan.game, ...plan.always].map((h) => h.accel)
    expect(new Set(accels).size).toBe(accels.length)
    // в PoE2 обработчика нет — не регистрируется
    expect(planHotkeys(defaultHotkeys(), (a) => a !== 'levelingToggle').game.map((h) => h.action)).not.toContain('levelingToggle')

    const map = defaultHotkeys()
    map.levelingToggle = { accel: 'alt+1', scope: 'game' } // = dealInvite, выше по порядку
    expect(planHotkeys(map, all).skipped).toEqual([{ action: 'levelingToggle', accel: 'Alt+1', reason: 'duplicate' }])
    map.levelingToggle = { accel: 'G', scope: 'game' }
    expect(planHotkeys(map, all).skipped).toEqual([{ action: 'levelingToggle', accel: 'G', reason: 'typing' }])
    map.levelingToggle = { accel: '', scope: 'game' }
    expect(planHotkeys(map, all).game.map((h) => h.action)).not.toContain('levelingToggle')

    // валидатор окна настроек: то же сочетание у другого действия или занятое игрой
    const cur = { hotkeys: defaultHotkeys(), chatCommands: [] }
    expect(findHotkeyConflict('Control+Shift+G', cur, { action: 'levelingToggle' })).toBeNull()
    expect(findHotkeyConflict('Alt+1', cur, { action: 'levelingToggle' })).toEqual({ kind: 'action', action: 'dealInvite' })
    expect(findHotkeyConflict('Control+C', cur, { action: 'levelingToggle' })).toEqual({ kind: 'reserved', reason: 'game' })
    expect(findHotkeyConflict('ctrl+shift+g', cur, { action: 'dealTrade' })).toEqual({ kind: 'action', action: 'levelingToggle' })
  })
})
