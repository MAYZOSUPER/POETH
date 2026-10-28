import type { HotkeyConflict } from '@shared/types'

// Хоткеи, которые не удалось зарегистрировать: сочетание занято другой программой (часто
// Awakened PoE Trade или Sidekick — у них тоже Ctrl+D). Чистый учёт без electron —
// tests/overlay/hotkeyConflicts.test.ts. Регистрация повторяется при каждом возврате фокуса в
// игру (хоткеи области 'game'), а предупреждать игрока нужно один раз за сессию на сочетание.

export class HotkeyConflicts {
  /** action → сочетание, которое сейчас не зарегистрировано */
  private current = new Map<string, string>()
  /** «action|accel», о которых уже предупредили в этом запуске */
  private warned = new Set<string>()

  /**
   * Итог попытки регистрации. true — предупредить игрока: сочетание занято, и об этом
   * действии с этим сочетанием в этом запуске ещё не говорили.
   */
  report(action: string, accel: string, ok: boolean): boolean {
    if (ok) {
      this.current.delete(action)
      return false
    }
    this.current.set(action, accel)
    const key = `${action}|${accel}`
    if (this.warned.has(key)) return false
    this.warned.add(key)
    return true
  }

  /**
   * Новый план хоткеев (сменили сочетание, убрали действие): конфликт остаётся только у
   * действий, которые по-прежнему стоят на том же сочетании.
   */
  retain(planned: readonly { action: string; accel: string }[]): void {
    const keep = new Map(planned.map((p) => [p.action, p.accel]))
    for (const [action, accel] of this.current) if (keep.get(action) !== accel) this.current.delete(action)
  }

  list(): HotkeyConflict[] {
    return [...this.current].map(([action, accel]) => ({ action, accel }))
  }
}
