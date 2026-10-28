// Время карты, доход в час и «Мой результат» по трекеру карт (чистый модуль; tests/advisor/time.test.ts).
//
// Время карты — время сессии без пауз ÷ карт (с заходами в убежище, как и живёт игрок):
//  1) ваши сессии с меткой этой стратегии; 2) все ваши сессии; 3) типичное время из стратегии.
// Источник берётся, только если карт в нём не меньше MIN_MAPS и время больше нуля.

import type { AdvisorMapTime, AdvisorMeasured, AdvisorMyResult } from '../types/advisor'
import type { FarmSession, FarmState, FarmStats } from '../types/farm'

/** Меньше карт — свой замер слишком шумный, берём следующий источник. */
export const MIN_MAPS = 3
const HOUR = 3_600_000
const MIN_RATE_MS = 60_000

interface Part {
  session: FarmSession
  stats: FarmStats
  live: boolean
}

/** Завершённые сессии и идущая (со статистикой на момент снимка). */
function parts(farm: FarmState | null): Part[] {
  if (!farm) return []
  const out: Part[] = farm.sessions.map((s) => ({ session: s, stats: s.stats, live: false }))
  if (farm.session && farm.stats) out.unshift({ session: farm.session, stats: farm.stats, live: true })
  return out
}

function cycle(list: readonly Part[]): { minutes: number; maps: number } | null {
  const maps = list.reduce((a, p) => a + p.stats.maps, 0)
  const ms = list.reduce((a, p) => a + p.stats.durationMs, 0)
  if (maps < MIN_MAPS || !(ms > 0)) return null
  return { minutes: ms / maps / 60_000, maps }
}

/** Минут на карту для стратегии; null — ни замеров, ни времени в стратегии. */
export function mapTime(strategyId: string, farm: FarmState | null, strategyMinutes: number): AdvisorMapTime | null {
  const all = parts(farm)
  const mine = cycle(all.filter((p) => p.session.strategy === strategyId))
  if (mine) return { ...mine, source: 'mine' }
  const tracker = cycle(all)
  if (tracker) return { ...tracker, source: 'tracker' }
  return strategyMinutes > 0 && Number.isFinite(strategyMinutes) ? { minutes: strategyMinutes, maps: 0, source: 'default' } : null
}

/** Прибыль за карту → в час; null — прибыли нет или время карты нулевое. */
export function perHour(profitPerMap: number | null, minutes: number | null | undefined): number | null {
  if (profitPerMap === null || !minutes || !(minutes > 0) || !Number.isFinite(minutes)) return null
  return (profitPerMap * 60) / minutes
}

/**
 * «Мой результат» → замер для экспорта стратегии (S17): только числа (карт, часов, доход в час), дата и
 * версия игры — без аккаунта и персонажа. null — мало карт или доход не посчитан.
 */
export function measuredFrom(
  mine: AdvisorMyResult | null,
  at: { date: string; patch?: string; league?: string }
): AdvisorMeasured | null {
  if (!mine || mine.maps < MIN_MAPS || mine.perHour === null || !(mine.durationMs > 0)) return null
  const out: AdvisorMeasured = {
    maps: mine.maps,
    hours: Math.round((mine.durationMs / HOUR) * 100) / 100,
    perHour: Math.round(mine.perHour),
    date: at.date
  }
  if (at.patch) out.patch = at.patch
  if (at.league) out.league = at.league
  return out
}

/** Ваши сессии фарма с этой стратегией; null — их не было. */
export function myResult(strategyId: string, farm: FarmState | null): AdvisorMyResult | null {
  const list = parts(farm).filter((p) => p.session.strategy === strategyId)
  if (!list.length) return null
  const maps = list.reduce((a, p) => a + p.stats.maps, 0)
  const durationMs = list.reduce((a, p) => a + p.stats.durationMs, 0)
  const withProfit = list.filter((p) => p.stats.profitChaos !== null)
  const profitChaos = withProfit.length ? withProfit.reduce((a, p) => a + (p.stats.profitChaos as number), 0) : null
  const profitMs = withProfit.reduce((a, p) => a + p.stats.durationMs, 0)
  return {
    sessions: list.length,
    maps,
    durationMs,
    profitChaos,
    perHour: profitChaos !== null && profitMs >= MIN_RATE_MS ? profitChaos / (profitMs / HOUR) : null,
    mapMinutes: maps > 0 && durationMs > 0 ? durationMs / maps / 60_000 : null,
    live: list.some((p) => p.live)
  }
}
