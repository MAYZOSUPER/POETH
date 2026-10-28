import { GAMES, type GameId } from '@shared/games'
import type { AppTab } from '@shared/types'
import { advisorOn } from '@shared/advisor/flag'

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
  { id: 'wealth', key: 'app.wealth', icon: '💎' },
  { id: 'flip', key: 'app.flip', icon: '⚖️' },
  { id: 'advisor', key: 'app.advisor', icon: '🌾' }
]

/** Флаг разработки POETH_ADVISOR=1 из preload (вкладка «Что фармить» скрыта в релизе, S16). */
const advisorDev = (): boolean => typeof window !== 'undefined' && window.overlayApi?.advisor?.devFlag === true

export function tabsFor(game: GameId): TabDef[] {
  const f = GAMES[game].features
  // «Кампания» в PoE 1 — прокачка по маршруту (S14), в PoE 2 — компас
  return ALL_TABS.filter(
    (t) => f[t.id] || (t.id === 'campaign' && f.leveling) || (t.id === 'advisor' && advisorOn(GAMES[game], advisorDev()))
  )
}

/** The wanted tab if it exists for this game, otherwise the game's first tab. */
export function resolveTab(game: GameId, wanted: AppTab | undefined): AppTab {
  const tabs = tabsFor(game)
  return tabs.some((t) => t.id === wanted) ? (wanted as AppTab) : tabs[0].id
}
