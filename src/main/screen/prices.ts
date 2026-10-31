import type { GameDef } from '@shared/games'
import type { PriceOf } from '@shared/screen/labels'
import { getDivineRate, getPriceIndex } from '../ipc/wealth'
import { getEffectiveLeague } from '../net/leagues'

// Цены для подписей поверх окон (S68). PoE 1 — общий индекс цен лиги (фид обмена GGG S13/S24, poe.watch, если
// включён в «Богатстве») и курс divine; стопочные предметы особых вкладок он покрывает. PoE 2 — источник
// подключает этап цен PoE 2 (S61 — фид GGG `poe2`, S67 — снимок poe.ninja) через setScreenPrices: до этого
// подписи PoE 2 без цен (ячейки распознаются, результат доступен «Богатству PoE 2»).

export interface ScreenPrices {
  priceOf: PriceOf
  base: 'chaos' | 'exalted'
  /** base за divine; null — курса нет */
  divine: number | null
}

export type ScreenPriceSource = (def: GameDef) => Promise<ScreenPrices | null>

const sources = new Map<string, ScreenPriceSource>()

/** Подключить источник цен игры (PoE 2 — этапы S61/S67). null — убрать. */
export function setScreenPrices(game: 'poe1' | 'poe2', src: ScreenPriceSource | null): void {
  if (src) sources.set(game, src)
  else sources.delete(game)
}

async function poe1(): Promise<ScreenPrices | null> {
  const league = await getEffectiveLeague().catch(() => null)
  if (!league) return null
  const [{ index }, rate] = await Promise.all([getPriceIndex(league), getDivineRate(league).catch(() => null)])
  return {
    base: 'chaos',
    divine: rate?.chaosPerDivine ?? null,
    priceOf: (item) => {
      const e = index.get('stackable', item)[0]
      return e ? { unit: e.chaos, low: e.low } : null
    }
  }
}

/** Цены игры для подписей; null — источника нет или он недоступен (подписи без цен). */
export async function screenPrices(def: GameDef): Promise<ScreenPrices | null> {
  const src = sources.get(def.id)
  if (src) return src(def).catch(() => null)
  return def.id === 'poe1' ? poe1().catch(() => null) : null
}
