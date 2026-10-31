import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { GameDef } from '@shared/games'
import { angePriceByName, feedIdsByName, poe2Rate } from '@shared/poe2/pricecheck/ange'
import { loadPoe2Prices, type LoadedPoe2Prices } from '@shared/poe2/prices/load'
import type { PriceOf } from '@shared/screen/labels'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { getDivineRate, getPriceIndex } from '../ipc/wealth'
import { getEffectiveLeague } from '../net/leagues'
import { resourcesDir } from '../services/questDataset'

// Цены для подписей поверх окон (S68).
// - PoE 1 — общий индекс цен лиги (фид обмена GGG S13/S24, poe.watch, если включён в «Богатстве») и курс divine;
//   стопочные предметы особых вкладок он покрывает.
// - PoE 2 — в exalted: фид обмена GGG `poe2` (S61, «цена у Ange»: тот же кэш часов, что у окна цены, курс ex ↔ div),
//   чего в фиде нет — снимок poe.ninja PoE 2 (S67, данные из CI). Запросы — только по нажатию хоткея: фид
//   обновляется не чаще раза в 10 минут (FeedStore), снимок — файл данных.
// Свой источник можно подставить через setScreenPrices (тесты, будущие источники).

export interface ScreenPrices {
  priceOf: PriceOf
  base: 'chaos' | 'exalted'
  /** base за divine; null — курса нет */
  divine: number | null
}

export type ScreenPriceSource = (def: GameDef) => Promise<ScreenPrices | null>

const sources = new Map<string, ScreenPriceSource>()

/** Подставить источник цен игры (тесты); null — вернуть встроенный. */
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

/** Часов фида PoE 2 для цены — как у окна цены (S61). */
const POE2_FEED_HOURS = 12

function poe2Dirs(): string[] {
  return [path.join(app.getPath('userData'), 'data', 'poe2'), path.join(resourcesDir(), 'data', 'poe2')]
}

async function readPoe2(rel: string): Promise<string | null> {
  for (const d of poe2Dirs()) {
    try {
      return await fs.readFile(path.join(d, rel), 'utf8')
    } catch {
      // следующий кандидат
    }
  }
  return null
}

let feedNames: Promise<Map<string, string[]> | null> | null = null
/** id фида PoE 2 ↔ английское имя (resources/data/poe2/exchange, S61); один раз за запуск. */
function poe2FeedNames(): Promise<Map<string, string[]> | null> {
  feedNames ??= readPoe2('exchange/exchange-ids.json').then((s) => {
    try {
      const raw = s ? (JSON.parse(s) as ExchangeIdNames) : null
      return raw && raw.version === 1 && raw.names && typeof raw.names === 'object' ? feedIdsByName(raw.names) : null
    } catch {
      return null
    }
  })
  return feedNames
}

const snapshots = new Map<string, Promise<LoadedPoe2Prices | null>>()
/** Снимок poe.ninja PoE 2 для лиги: меняется только с пакетом данных — держим до перезапуска. */
function poe2Snapshot(league: string): Promise<LoadedPoe2Prices | null> {
  let p = snapshots.get(league)
  if (!p) {
    p = loadPoe2Prices(readPoe2, league).catch(() => null)
    snapshots.set(league, p)
  }
  return p
}

async function poe2(): Promise<ScreenPrices | null> {
  const league = await getEffectiveLeague().catch(() => null)
  if (!league) return null
  const [names, snap, hours] = await Promise.all([
    poe2FeedNames(),
    poe2Snapshot(league),
    (async () => {
      const feed = getFeedStore('poe2')
      await feed.refresh(league, POE2_FEED_HOURS)
      return feed.hours(league, POE2_FEED_HOURS)
    })().catch(() => [])
  ])
  const rate = hours.length ? poe2Rate(hours, league) : null
  const table = snap?.table ?? null
  if (!rate && !table) return null
  return {
    base: 'exalted',
    divine: rate?.exaltedPerDivine ?? table?.exaltedPerDivine ?? null,
    priceOf: (item) => {
      const a = rate && names ? angePriceByName(hours, league, names, item, rate) : undefined
      if (a && a.exalted > 0) return { unit: a.exalted, low: a.low }
      const n = table?.byName(item)
      // снимок другой лиги (нет снимка лиги игрока) — цена примерная
      return n?.exalted ? { unit: n.exalted, low: n.low || snap?.match !== 'exact' } : null
    }
  }
}

/** Цены игры для подписей; null — источника нет или он недоступен (подписи без цен). */
export async function screenPrices(def: GameDef): Promise<ScreenPrices | null> {
  const src = sources.get(def.id)
  if (src) return src(def).catch(() => null)
  return (def.id === 'poe2' ? poe2() : poe1()).catch(() => null)
}
