// Разбор строк Client.txt Path of Exile 1 для трекера карт (чистый TS, без electron).
//
// Источники:
//  - вход в зону `Generating level N area "<id>" with seed S` — служебная DEBUG-строка движка,
//    одинаковая в EN и RU клиенте; seed одинаков при повторном входе в тот же экземпляр
//    (порталы туда-обратно) и разный у новой карты — сверено по настоящему Client.txt;
//  - имя зоны на языке клиента: `[SCENE] Set Source [<имя>]` (служебная) или системное
//    сообщение EnteredArea: EN «You have entered {0}.», RU «Вы вошли в область {0}.»;
//  - смерть PlayerSlain: EN «{0} has been slain.», RU «{0} был повержен.» — тексты игры из
//    BackendErrors (выгрузка данных клиента LocalIdentity/poe2-data, data/backenderrors.json и
//    data/russian/backenderrors.json; это строки GGG, кода оттуда нет). EN сверено по
//    настоящему Client.txt. В CLIENT_STRINGS APT системных событий области нет — только
//    CHAT_SYSTEM `^: (?<body>.+)$`, по нему и отделяем системные сообщения.
// `<имя> has been slain` — смерть ИГРОКА (своя или участника группы в той же зоне), не босса.
// Правила игры (вид зоны, ярус, строки смерти, имя сцены) — FarmRules: PoE 1 здесь (POE1_FARM_RULES),
// PoE 2 — zonesPoe2.ts (данные областей отдельно от кода). Без правил — PoE 1, как было.

import type { GameId } from '../games'
import type { FarmAreaKind } from '../types/farm'
import { splitLogLine } from '../deals/whisperParse'

export interface ZoneEnter {
  areaId: string
  level: number
  /** seed экземпляра; '' — в строке не было (старый формат) */
  seed: string
}

export type FarmLineEvent =
  | { type: 'zone'; zone: ZoneEnter }
  | { type: 'areaName'; name: string }
  | { type: 'death'; player: string }

export interface FarmLogLine {
  /** мс по локальному времени ПК; null — строка без префикса */
  ts: number | null
  event: FarmLineEvent
}

const GENERATING = /^Generating level (\d+) area "([^"]+)"(?: with seed (\d+))?/
const SCENE = /^\[SCENE\] Set Source \[(.+)\]$/
// CHAT_SYSTEM APT: `: <текст>`
const ENTERED = [/^: You have entered (.+)\.$/, /^: Вы вошли в область (.+)\.$/]
const SLAIN = [/^: (.+) has been slain\.$/, /^: (.+) был[аои]? поверж(?:ен|ена|ено|ены)\.$/]

/** Чем игры отличаются для трекера: вид зоны, ярус карты, строки смерти, имя сцены. */
export interface FarmRules {
  game: GameId
  /** вид зоны по id и уровню области */
  classify(areaId: string, level: number): FarmAreaKind
  /** ярус карты по уровню области; null — уровень не карты атласа */
  tier(level: number): number | null
  /** смерть игрока: системное сообщение `: <текст>` */
  slain: readonly RegExp[]
  /** `[SCENE] Set Source [<имя>]` — имя области (а не загрузка, меню, карта мира) */
  isAreaName(name: string): boolean
}

/** Текст строки лога (после префикса) → событие трекера. */
export function parseFarmText(text: string, rules: FarmRules = POE1_FARM_RULES): FarmLineEvent | null {
  const g = GENERATING.exec(text)
  if (g) return { type: 'zone', zone: { areaId: g[2], level: +g[1], seed: g[3] ?? '' } }
  const sc = SCENE.exec(text)
  if (sc) return rules.isAreaName(sc[1]) ? { type: 'areaName', name: sc[1] } : null
  if (!text.startsWith(': ')) return null
  for (const re of ENTERED) {
    const m = re.exec(text)
    if (m) return { type: 'areaName', name: m[1] }
  }
  for (const re of rules.slain) {
    const m = re.exec(text)
    if (m) return { type: 'death', player: m[1] }
  }
  return null
}

/** Строка Client.txt целиком → событие с временем. */
export function parseFarmLine(line: string, rules: FarmRules = POE1_FARM_RULES): FarmLogLine | null {
  const ll = splitLogLine(line)
  if (!ll) return null
  const event = parseFarmText(ll.text, rules)
  return event ? { ts: ll.ts, event } : null
}

/**
 * Хабы между забегами, которые не узнать по шаблону id: Rogue Harbour (ограбления), лобби
 * лабиринта (Aspirants' Plaza), корабль The Sovereign. Сверено по настоящему Client.txt.
 * Прочие хабы лиг обычно имеют уровень области 1 — см. classifyArea.
 */
const HUBS = new Set(['HeistHub', 'Labyrinth_Airlock', 'DeepwaterHub'])

/**
 * Вид зоны по id и уровню области. Шаблоны (настоящий Client.txt PoE1 3.2x):
 * Hideout* — хайдауты; *_town — города актов и эпилога; 1_1_1, 2_7_5_map — кампания
 * (N_…); MapWorlds* — карты атласа; Synthesis_MapGuardian* — «память» (карта с устройства);
 * N_Labyrinth_* — лабиринт (не кампания). Подобластей (`sub`) у PoE 1 нет.
 */
export function classifyArea(areaId: string, level: number): Exclude<FarmAreaKind, 'sub'> {
  if (/^Hideout/.test(areaId)) return 'hideout'
  if (/_town$/.test(areaId) || HUBS.has(areaId)) return 'town'
  if (/^\d+_Labyrinth_/.test(areaId)) return 'other'
  if (/^\d+_/.test(areaId)) return 'campaign'
  if (/^Map/.test(areaId) || /_Map(?:Guardian|Boss)/.test(areaId)) return 'map'
  // хабы лиг (Monastery of the Keepers, Kingsmarch…) — уровень области 1
  if (level <= 1) return 'town'
  return 'other'
}

/** Зона, в которой идёт забег (подобласть бывает только в PoE 2). */
export function isRunArea(kind: FarmAreaKind): kind is 'map' | 'other' | 'sub' {
  return kind === 'map' || kind === 'other' || kind === 'sub'
}

/** Ярус карты по уровню области: 68 → 1 … 83 → 16, 84 → 17; ниже 68 — null. */
export function mapTier(level: number): number | null {
  if (!Number.isFinite(level) || level < 68) return null
  return Math.min(17, level - 67)
}

/** Правила PoE 1 (S11b) — по умолчанию у трекера и разбора строк. */
export const POE1_FARM_RULES: FarmRules = {
  game: 'poe1',
  classify: classifyArea,
  tier: mapTier,
  slain: SLAIN,
  isAreaName: (name) => name !== '(null)'
}
