// Рельс навигации: свёрнут до значков или развёрнут с названиями. Одна логика на рельс главного окна (S20,
// renderer/src/panels/NavRail.tsx) и рельс сайтов трейд-окна (S58, trade-sidebar/SiteRail.tsx): у трейд-окна
// разметку вью сайта считает main (windows/tradeLayout.ts), поэтому правила лежат в shared.

export type RailPref = 'wide' | 'narrow'

/** С этой ширины окна развёрнутый рельс стоит рядом с содержимым; на окне уже он открывается поверх. */
export const RAIL_INLINE_MIN = 820

/**
 * Развёрнут ли рельс рядом с содержимым. На узком окне — никогда (развёрнутый открывается поверх).
 * Пока пользователь не выбрал сам: в простом режиме развёрнут (новичку нужны названия), в экспертном — свёрнут.
 */
export function railWide(windowWide: boolean, pref: RailPref | null, simple: boolean): boolean {
  if (!windowWide) return false
  return pref ? pref === 'wide' : simple
}

/** Выбор из файла или хранилища: только 'wide' | 'narrow', остальное — «не выбирал» (null). */
export function normalizeRailPref(v: unknown): RailPref | null {
  return v === 'wide' || v === 'narrow' ? v : null
}
