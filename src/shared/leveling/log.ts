// Строки Client.txt для прокачки PoE1 (S14, S22): вход в зону (язык-независимо, как у трекера карт S11b),
// повышение уровня и вход в игру. Тексты LevelUp — BackendErrors клиента (выгрузка LocalIdentity/poe2-data; EN
// сверено по настоящему Client.txt): EN «{0} ({1}) is now level {2}», RU «{0} ({1}) достигает {2} уровня».
// В группе такие строки пишутся и про других игроков — свой персонаж различается по имени.
// Вход в игру — служебная строка движка `Async connecting to <сервер>.login.pathofexile.com:<порт>` (как
// `Generating level`, не переводится): при запуске игры, после выхода к выбору персонажа ({logout} маршрута)
// и после разрыва связи; дальше — смена зоны без неё. Сверено по настоящему Client.txt PoE1 3.29.

import { splitLogLine } from '../deals/whisperParse'
import { parseFarmText } from '../farm/zones'
import type { LevelingCursor } from '../types/leveling'

export type LevelingLogEvent =
  | { type: 'zone'; areaId: string; level: number }
  | { type: 'level'; character: string; className: string; level: number }
  | { type: 'login' }

const LEVEL_UP = [/^: (.+) \((.+)\) is now level (\d+)$/, /^: (.+) \((.+)\) достигает (\d+) уровня$/]
const LOGIN = /^Async connecting to \S*login\S*/i

export function parseLevelingText(text: string): LevelingLogEvent | null {
  const f = parseFarmText(text)
  if (f?.type === 'zone') return { type: 'zone', areaId: f.zone.areaId, level: f.zone.level }
  if (LOGIN.test(text)) return { type: 'login' }
  if (!text.startsWith(': ')) return null
  for (const re of LEVEL_UP) {
    const m = re.exec(text)
    if (m) return { type: 'level', character: m[1], className: m[2], level: Number(m[3]) }
  }
  return null
}

export function parseLevelingLine(line: string): LevelingLogEvent | null {
  const ll = splitLogLine(line)
  return ll ? parseLevelingText(ll.text) : null
}

/** Событие и место строки в журнале (время и счётчик клиента; null — строка без префикса). */
export function parseLevelingLog(line: string): { event: LevelingLogEvent; at: LevelingCursor | null } | null {
  const ll = splitLogLine(line)
  if (!ll) return null
  const event = parseLevelingText(ll.text)
  if (!event) return null
  return { event, at: ll.ts !== null && ll.uptimeMs !== undefined ? { ts: ll.ts, up: ll.uptimeMs } : null }
}

/** Строка позже курсора (строки без префикса — да: время не узнать). */
export function isAfter(line: string, cursor: LevelingCursor): boolean {
  const ll = splitLogLine(line)
  if (!ll || ll.ts === null || ll.uptimeMs === undefined) return true
  return ll.ts > cursor.ts || (ll.ts === cursor.ts && ll.uptimeMs > cursor.up)
}
