import { describe, expect, it } from 'vitest'
import { planHotkeys, type HotkeyId } from '../../src/main/input/hotkeyPlan'
import { defaultHotkeys } from '@shared/settings'

const all = (): boolean => true

describe('planHotkeys', () => {
  it('дефолты раскладываются по областям game / always', () => {
    const plan = planHotkeys(defaultHotkeys(), all)
    expect(plan.game.map((h) => h.action)).toEqual([
      'priceCheck',
      'overlayToggle',
      'dealInvite',
      'dealTrade',
      'dealDismiss'
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
    expect(plan.game.map((h) => h.action)).toEqual(['overlayToggle', 'dealInvite', 'dealTrade', 'dealDismiss'])
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
      'chat:hideout'
    ])
    expect(plan.skipped).toEqual([
      { action: 'chat:dup', accel: 'Control+D', reason: 'duplicate' },
      { action: 'chat:bad', accel: 'Enter', reason: 'game' },
      { action: 'chat:dup2', accel: 'F5', reason: 'duplicate' }
    ])
  })
})
