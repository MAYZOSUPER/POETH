// Общие заготовки тестов советника (S16).

import type { AdvisorStrategy } from '@shared/types/advisor'
import type { FarmSession, FarmSessionSummary, FarmState, FarmStats } from '@shared/types/farm'

export const T = (ru: string, en = ru.toUpperCase()): { ru: string; en: string } => ({ ru, en })

export function strategy(patch: Partial<AdvisorStrategy> = {}): AdvisorStrategy {
  return {
    id: 'demo',
    name: T('Демо', 'Demo'),
    summary: T('кратко', 'short'),
    why: T('почему', 'why'),
    difficulty: 1,
    build: { damage: 1, survival: 1, speed: 1 },
    tags: [],
    terms: [],
    minutesPerMap: 5,
    inputs: [
      { item: { kind: 'map', label: T('Карта', 'Map') }, qty: 1, own: true },
      { item: { kind: 'stackable', name: 'Essence Scarab' }, qty: 1 }
    ],
    outputs: [{ item: { kind: 'stackable', name: 'Deafening Essence of Greed' }, qty: 2 }],
    source: { text: T('оценка', 'estimate'), date: '2026-10' },
    atlas: [],
    steps: [T('шаг', 'step')],
    warnings: [],
    draft: false,
    patch: '3.29',
    ...patch
  }
}

export function stats(patch: Partial<FarmStats> = {}): FarmStats {
  return {
    durationMs: 0,
    maps: 0,
    runs: 0,
    mapsPerHour: null,
    avgMapMs: null,
    fastestMapMs: null,
    deaths: 0,
    mapsWithDeaths: 0,
    profitChaos: null,
    profitPerHour: null,
    ...patch
  }
}

let n = 0
export function done(st: Partial<FarmStats>, strategy?: string): FarmSessionSummary {
  n += 1
  const s: FarmSessionSummary = { id: `s${n}`, startedAt: n, endedAt: n + 1, pausedAt: null, pausedMs: 0, stats: stats(st) }
  if (strategy) s.strategy = strategy
  return s
}

export function farm(sessions: FarmSessionSummary[], live?: { st: Partial<FarmStats>; strategy?: string }): FarmState {
  let session: FarmSession | null = null
  if (live) {
    session = { id: 'live', startedAt: 0, endedAt: null, pausedAt: null, pausedMs: 0 }
    if (live.strategy) session.strategy = live.strategy
  }
  return {
    at: 0,
    current: null,
    inside: false,
    ticking: false,
    location: null,
    session,
    stats: live ? stats(live.st) : null,
    runs: [],
    sessions,
    config: { overlayWidget: false, widgetPos: null }
  }
}
