import type { HotkeyAction, HotkeyMap, HotkeyScope } from '@shared/types'
import { normalizeAccelerator, reservedReason, type ReservedReason } from '@shared/accelerators'
import type { ChatHotkeyId } from '@shared/chatCommands'

// Какие хоткеи регистрировать и в какой «области». Чистый модуль (без electron) —
// tests/overlay/hotkeyPlan.test.ts. Регистрацию делает src/main/hotkeys.ts:
// 'always' — сразу, 'game' — только пока окно игры в фокусе.

/** Обычное действие (HotkeyMap) или динамическое — команда чата `chat:<id>`. */
export type HotkeyId = HotkeyAction | ChatHotkeyId

/** Хоткей вне HotkeyMap (команды чата): регистрируется по тем же правилам. */
export interface ExtraHotkey {
  action: ChatHotkeyId
  accel: string
  scope: HotkeyScope
}

export interface PlannedHotkey {
  action: HotkeyId
  /** каноническая запись акселератора (её и регистрируем) */
  accel: string
  scope: HotkeyScope
}

export type SkipReason = ReservedReason | 'invalid' | 'duplicate'

export interface SkippedHotkey {
  action: HotkeyId
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
 * и повторы (одно сочетание на два действия — побеждает первое по порядку: сначала
 * HotkeyMap, затем extra — команды чата).
 */
export function planHotkeys(
  map: HotkeyMap,
  hasHandler: (action: HotkeyId) => boolean,
  extra: readonly ExtraHotkey[] = []
): HotkeyPlan {
  const plan: HotkeyPlan = { game: [], always: [], skipped: [] }
  const taken = new Set<string>()
  const entries: [HotkeyId, { accel: string; scope: HotkeyScope }][] = [
    ...(Object.entries(map) as [HotkeyAction, HotkeyMap[HotkeyAction]][]),
    ...extra.map((e): [HotkeyId, { accel: string; scope: HotkeyScope }] => [e.action, e])
  ]
  for (const [action, binding] of entries) {
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
