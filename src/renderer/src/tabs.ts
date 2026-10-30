import { GAMES, type GameId } from '@shared/games'
import type { AppTab } from '@shared/types'
import { advisorOn } from '@shared/advisor/flag'
import { buildOn } from '@shared/build/flag'
import { guideOn } from '@shared/guide/library'
import { normalizeRailPref, type RailPref } from '@shared/rail'

// Вкладки компаньона, их разделы на рельсе слева (S20, макет навигации — вариант Б)
// и доступность по игре (GameDef.features).
export interface TabDef {
  id: AppTab
  key: string
  /** иконка спрайта (docs/design-system.md, «Иконки»); подмножество IconName из overlay/Icon.tsx */
  icon: TabIcon
}

type TabIcon = 'ask' | 'bolt' | 'trade' | 'swap' | 'map' | 'coins' | 'search' | 'compass' | 'passive' | 'book'

export type SectionId = 'trade' | 'farm' | 'level' | 'help'

export interface SectionDef {
  id: SectionId
  key: string
  tabs: TabDef[]
}

const TABS: Record<AppTab, TabDef> = {
  priceCheck: { id: 'priceCheck', key: 'app.priceCheck', icon: 'ask' },
  live: { id: 'live', key: 'app.live', icon: 'bolt' },
  deals: { id: 'deals', key: 'app.deals', icon: 'trade' },
  flip: { id: 'flip', key: 'app.flip', icon: 'swap' },
  advisor: { id: 'advisor', key: 'app.advisor', icon: 'map' },
  wealth: { id: 'wealth', key: 'app.wealth', icon: 'coins' },
  regex: { id: 'regex', key: 'app.regex', icon: 'search' },
  campaign: { id: 'campaign', key: 'app.campaign', icon: 'compass' },
  build: { id: 'build', key: 'app.build', icon: 'passive' },
  guide: { id: 'guide', key: 'app.guide', icon: 'book' }
}

/** Разделы и порядок вкладок — одни в обеих играх, чтобы рука помнила; чего нет в игре, просто не показывается. */
const SECTIONS: { id: SectionId; key: string; tabs: AppTab[] }[] = [
  { id: 'trade', key: 'nav.sec.trade', tabs: ['priceCheck', 'live', 'deals', 'flip'] },
  { id: 'farm', key: 'nav.sec.farm', tabs: ['advisor', 'wealth', 'regex'] },
  { id: 'level', key: 'nav.sec.level', tabs: ['campaign', 'build'] },
  // S55: «Справочник» — своим разделом внизу рельса: новичку проще найти, чем среди инструментов «Фарма»
  { id: 'help', key: 'nav.sec.help', tabs: ['guide'] }
]

/** Флаг разработки POETH_ADVISOR=1 из preload (вкладка «Что фармить» скрыта в релизе, S16). */
const advisorDev = (): boolean =>
  (globalThis as { overlayApi?: { advisor?: { devFlag?: boolean } } }).overlayApi?.advisor?.devFlag === true

/** Флаг разработки POETH_BUILD=1 из preload (вкладка «Билд» скрыта до v0.2, S35–S39). */
const buildDev = (): boolean =>
  (globalThis as { overlayApi?: { build?: { devFlag?: boolean } } }).overlayApi?.build?.devFlag === true

function inGame(game: GameId, id: AppTab, dev: boolean): boolean {
  const f = GAMES[game].features
  // «Кампания» в PoE 1 — прокачка по маршруту (S14), в PoE 2 — компас
  if (id === 'campaign') return f.campaign || f.leveling
  if (id === 'advisor') return advisorOn(GAMES[game], dev)
  if (id === 'build') return buildOn(GAMES[game], buildDev())
  if (id === 'guide') return guideOn(game)
  return f[id]
}

/** Разделы рельса для игры; раздел без вкладок в этой игре не показывается. */
export function sectionsFor(game: GameId, dev = advisorDev()): SectionDef[] {
  return SECTIONS.map((s) => ({
    id: s.id,
    key: s.key,
    tabs: s.tabs.filter((id) => inGame(game, id, dev)).map((id) => TABS[id])
  })).filter((s) => s.tabs.length > 0)
}

/** Вкладки игры подряд, в порядке рельса. */
export function tabsFor(game: GameId, dev = advisorDev()): TabDef[] {
  return sectionsFor(game, dev).flatMap((s) => s.tabs)
}

/** Раздел вкладки — из неё самой, поэтому хоткеи и resolveTab о разделах не знают. */
export function sectionOf(tab: AppTab): SectionId {
  return (SECTIONS.find((s) => s.tabs.includes(tab)) ?? SECTIONS[0]).id
}

/** Ключ описания вкладки для подсказки на свёрнутом рельсе. */
export function tabHintKey(tab: AppTab, game: GameId): string {
  return tab === 'campaign' && game === 'poe2' ? 'nav.d.campaign.poe2' : `nav.d.${tab}`
}

/**
 * Нужная вкладка, если она есть в игре. Иначе «Кампания» (как до S20, когда она стояла в строке первой),
 * а без неё — первая на рельсе.
 */
export function resolveTab(game: GameId, wanted: AppTab | undefined, dev = advisorDev()): AppTab {
  const tabs = tabsFor(game, dev)
  if (tabs.some((t) => t.id === wanted)) return wanted as AppTab
  return tabs.some((t) => t.id === 'campaign') ? 'campaign' : tabs[0].id
}

// ---- рельс: свёрнут до иконок или развёрнут с названиями ----
// Правила общие с рельсом сайтов трейд-окна (S58) — в @shared/rail.

export { RAIL_INLINE_MIN, railWide, type RailPref } from '@shared/rail'

/** Выбор «свёрнут / развёрнут» — в localStorage окна, как развёрнутость папок избранного (Settings не трогаем). */
export const RAIL_KEY = 'poeth.nav.rail'

export function readRailPref(storage: { getItem(key: string): string | null } | undefined): RailPref | null {
  try {
    return normalizeRailPref(storage?.getItem(RAIL_KEY))
  } catch {
    return null
  }
}

export function writeRailPref(storage: { setItem(key: string, value: string): void } | undefined, pref: RailPref): void {
  try {
    storage?.setItem(RAIL_KEY, pref)
  } catch {
    // нет хранилища — выбор просто не запомнится
  }
}

/** Куда перейти фокусу по клавише на рельсе: стрелки вверх/вниз по кругу, Home/End; null — клавиша не наша. */
export function railStep(index: number, key: string, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
