import { GAMES, type GameId } from '@shared/games'
import type { AppTab } from '@shared/types'

// Вкладки компаньона и их доступность по игре (GameDef.features).
export interface TabDef {
  id: AppTab
  key: string
  icon: string
}

const ALL_TABS: TabDef[] = [
  { id: 'campaign', key: 'app.campaign', icon: '🧭' },
  { id: 'priceCheck', key: 'app.priceCheck', icon: '💰' },
  { id: 'live', key: 'app.live', icon: '📡' },
  { id: 'regex', key: 'app.regex', icon: '🔎' },
  { id: 'deals', key: 'app.deals', icon: '🤝' },
  { id: 'wealth', key: 'app.wealth', icon: '💎' }
]

export function tabsFor(game: GameId): TabDef[] {
  const f = GAMES[game].features
  // «Кампания» в PoE 1 — прокачка по маршруту (S14), в PoE 2 — компас
  return ALL_TABS.filter((t) => f[t.id] || (t.id === 'campaign' && f.leveling))
}

/** The wanted tab if it exists for this game, otherwise the game's first tab. */
export function resolveTab(game: GameId, wanted: AppTab | undefined): AppTab {
  const tabs = tabsFor(game)
  return tabs.some((t) => t.id === wanted) ? (wanted as AppTab) : tabs[0].id
}
