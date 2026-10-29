import type { AppTab, Deal, LiveSnapshot } from '@shared/types'

// Счётчики на иконках рельса и плашка «Сквозной режим» (S32, макет навигации — вариант Б).
// Live — сколько живых поисков сейчас работает (зелёный .ui-count--live), «Сделки» — новые входящие
// предложения, которых вы ещё не видели. Данные — из сторов Live и «Сделок», без новых IPC.

export type RailBadgeKind = 'live' | 'deals'

export interface RailBadge {
  kind: RailBadgeKind
  n: number
}

type T = (key: string, params?: Record<string, string | number>) => string

/** Live: включённые поиски, пока live search включён; главный выключатель выключен — счётчика нет. */
export function liveCount(snap: LiveSnapshot | null | undefined): number {
  if (!snap?.options.enabled) return 0
  return Math.max(0, snap.active)
}

/** Входящее предложение без ответа: не пример, карточку поверх игры не закрыли. */
export function isOpenOffer(d: Deal): boolean {
  return d.dir === 'in' && d.status === 'new' && !d.demo && !d.cardHidden
}

/**
 * «Просмотрено» — id сделок, которые вы уже видели; null — состояние «Сделок» ещё не пришло.
 * Первое пришедшее состояние видено целиком: история прошлых сессий не «новая».
 * Пока вкладка «Сделки» на экране, видено всё, что в ней есть, — счётчик сбрасывается и не растёт.
 * Не изменилось — тот же объект (без лишней перерисовки).
 */
export function nextSeen(
  prev: ReadonlySet<string> | null,
  deals: readonly Deal[] | undefined,
  viewing: boolean
): ReadonlySet<string> | null {
  if (!deals) return prev
  if (prev !== null && !viewing) return prev
  if (prev !== null && deals.every((d) => prev.has(d.id))) return prev
  return new Set(deals.map((d) => d.id))
}

/** Новые предложения: входящие без ответа, которых не было, когда вы последний раз смотрели «Сделки». */
export function dealsCount(deals: readonly Deal[] | undefined, seen: ReadonlySet<string> | null): number {
  if (!deals || !seen) return 0
  return deals.filter((d) => isOpenOffer(d) && !seen.has(d.id)).length
}

/** Счётчик пункта рельса; у остальных вкладок счётчиков нет. 0 — не показываем. */
export function badgeFor(tab: AppTab, counts: Record<RailBadgeKind, number>): RailBadge | null {
  if (tab !== 'live' && tab !== 'deals') return null
  const n = counts[tab]
  return n > 0 ? { kind: tab, n } : null
}

/** Число на значке: больше 99 — «99+», чтобы значок не ломал свёрнутый рельс. */
export function badgeText(n: number): string {
  return n > 99 ? '99+' : String(n)
}

/** Фраза счётчика со строчной буквы, без склонений: «новых предложений: 2», «active live searches: 3». */
export function countText(t: T, badge: RailBadge): string {
  return t(`nav.count.${badge.kind}`, { n: badge.n })
}

/** То же с заглавной — отдельной строкой в подсказке и в title значка. */
export function countTitle(t: T, badge: RailBadge): string {
  const s = countText(t, badge)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** aria-label пункта: название и счётчик одной фразой («Сделки, новых предложений: 2»). */
export function itemLabel(t: T, name: string, badge: RailBadge | null): string {
  return badge ? t('nav.item.withCount', { name, count: countText(t, badge) }) : name
}

// ---- плашка «Сквозной режим» ----

/** 'Control+Shift+L' → 'Ctrl+Shift+L' (как в подсказке замка в шапке). */
export function accelText(accel: string): string {
  return accel
    .split('+')
    .filter(Boolean)
    .map((k) => (k === 'Control' || k === 'CommandOrControl' ? 'Ctrl' : k === 'Super' ? 'Win' : k))
    .join('+')
}

/**
 * Как снять замок — во время замка окно не ловит мышь, кнопка замка в шапке не нажимается:
 * хоткей (если назначен) или пункт меню значка в трее.
 */
export function lockOffText(t: T, accel: string | undefined): string {
  const key = accelText(accel ?? '')
  return key ? t('nav.lock.off', { key }) : t('nav.lock.off.tray')
}
