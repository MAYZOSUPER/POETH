import type { HotkeyAction, HotkeyMap, HotkeyScope } from '@shared/types'
import { normalizeAccelerator, reservedReason, type ReservedReason } from '@shared/accelerators'

// Какие хоткеи регистрировать и в какой «области». Чистый модуль (без electron) —
// tests/overlay/hotkeyPlan.test.ts. Регистрацию делает src/main/hotkeys.ts:
// 'always' — сразу, 'game' — только пока окно игры в фокусе.

export interface PlannedHotkey {
  action: HotkeyAction
  /** каноническая запись акселератора (её и регистрируем) */
  accel: string
  scope: HotkeyScope
}

export type SkipReason = ReservedReason | 'invalid' | 'duplicate'

export interface SkippedHotkey {
  action: HotkeyAction
  accel: string
  reason: SkipReason
}

export interface HotkeyPlan {
  game: PlannedHotkey[]
  always: PlannedHotkey[]
  skipped: SkippedHotkey[]
}

/**
 * Разложить хоткеи по областям. Пропускаются: не назначенные, без обработчика
 * для текущей игры (молча), записанные с ошибкой, зарезервированные игрой/системой
 * и повторы (одно сочетание на два действия — побеждает первое по порядку).
 */
export function planHotkeys(map: HotkeyMap, hasHandler: (action: HotkeyAction) => boolean): HotkeyPlan {
  const plan: HotkeyPlan = { game: [], always: [], skipped: [] }
  const taken = new Set<string>()
  for (const [action, binding] of Object.entries(map) as [HotkeyAction, HotkeyMap[HotkeyAction]][]) {
    if (!binding?.accel || !hasHandler(action)) continue
    const accel = normalizeAccelerator(binding.accel)
    if (!accel) {
      plan.skipped.push({ action, accel: binding.accel, reason: 'invalid' })
      continue
    }
    const reserved = reservedReason(accel)
    if (reserved) {
      plan.skipped.push({ action, accel, reason: reserved })
      continue
    }
    if (taken.has(accel)) {
      plan.skipped.push({ action, accel, reason: 'duplicate' })
      continue
    }
    taken.add(accel)
    const scope: HotkeyScope = binding.scope === 'always' ? 'always' : 'game'
    plan[scope].push({ action, accel, scope })
  }
  return plan
}
