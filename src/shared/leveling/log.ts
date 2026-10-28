// Строки Client.txt для прокачки PoE1 (S14): вход в зону (язык-независимо, как у трекера карт S11b) и
// повышение уровня. Тексты LevelUp — BackendErrors клиента (выгрузка LocalIdentity/poe2-data; EN сверено по
// настоящему Client.txt): EN «{0} ({1}) is now level {2}», RU «{0} ({1}) достигает {2} уровня».
// В группе такие строки пишутся и про других игроков — свой персонаж различается по имени.

import { splitLogLine } from '../deals/whisperParse'
import { parseFarmText } from '../farm/zones'

export type LevelingLogEvent =
  | { type: 'zone'; areaId: string; level: number }
  | { type: 'level'; character: string; className: string; level: number }

const LEVEL_UP = [/^: (.+) \((.+)\) is now level (\d+)$/, /^: (.+) \((.+)\) достигает (\d+) уровня$/]

export function parseLevelingText(text: string): LevelingLogEvent | null {
  const f = parseFarmText(text)
  if (f?.type === 'zone') return { type: 'zone', areaId: f.zone.areaId, level: f.zone.level }
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
