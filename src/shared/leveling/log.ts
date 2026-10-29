// Строки Client.txt для прокачки PoE1 (S14, S22): вход в зону (язык-независимо, как у трекера карт S11b),
// повышение уровня и вход в игру. Тексты LevelUp — BackendErrors клиента (выгрузка LocalIdentity/poe2-data; EN
// сверено по настоящему Client.txt): EN «{0} ({1}) is now level {2}», RU «{0} ({1}) достигает {2} уровня».
// В группе такие строки пишутся и про других игроков — свой персонаж различается по имени.
// Вход в игру — служебная строка движка `Async connecting to <сервер>.login.pathofexile.com:<порт>` (как
// `Generating level`, не переводится): при запуске игры, после выхода к выбору персонажа ({logout} маршрута)
// и после разрыва связи; дальше — смена зоны без неё. Сверено по настоящему Client.txt PoE1 3.29.
//
// Вкладка «Билд» (S36) — отдельный разбор (parseBuildLogText…), гиду прокачки он не мешает:
//  - вложение и снятие пассивки — служебная строка движка (в таблицах клиента её нет, как `Generating level`):
//    `Successfully allocated passive skill id: attack_poison2349, name: Poison Chance` / `Successfully unallocated …`.
//    EN сверено по настоящему Client.txt 3.29: так же пишутся ноды атласа (`atlas_…`), мастерства (`mastery_…`,
//    выбранный эффект не пишется) и ноды кластерных самоцветов (их нет на дереве). На RU-клиенте не сверено:
//    ждём ту же строку с именем ноды на русском;
//  - очки пассивок и сброса, вывод `/passives` — системные сообщения `: …`, тексты из таблиц клиента PoE1 3.29.3.3
//    (BackendErrors, ClientStrings; выгрузка repoe-fork/dat-export, BUILD_LOG_STRINGS ниже — сверяет
//    tools/build-data/log-strings.mjs). Каждая строка `/passives` — отдельное сообщение. RU не сверено с живым
//    журналом;
//  - смерть — как у трекера карт (farm/zones.ts): `{0} has been slain.` / `{0} был повержен.`, в группе — и чужие.

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

// ---------------------------------------------------------------------------
// Вкладка «Билд» (S36): дерево по журналу, очки пассивок, /passives, смерти
// ---------------------------------------------------------------------------

/** Тексты клиента PoE1 3.29.3.3 по id таблиц (BackendErrors, ClientStrings); `{n}` — подстановки игры. */
export const BUILD_LOG_STRINGS = {
  ReceivedPassivePoint1: { en: 'You have received a Passive Skill Point.', ru: 'Вы получили очко пассивных умений.' },
  ReceivedPassivePointN: { en: 'You have received {0} Passive Skill Points.', ru: 'Вы получили очков пассивных умений: {0}.' },
  LostPassivePoint1: { en: 'You have lost a Passive Skill Point.', ru: 'Вы потеряли Очко пассивных умений' },
  LostPassivePointN: { en: 'You have lost {0} Passive Skill Points.', ru: 'Вы потеряли Очков пассивных умений: {0}.' },
  ReceivedRespecPoint1: { en: 'You have received a Passive Respec Point.', ru: 'Вы получили очко сброса пассивных умений.' },
  ReceivedRespecPointN: { en: 'You have received {0} Passive Respec Points.', ru: 'Вы получили очков сброса пассивных умений: {0}.' },
  PassiveInfoTotal: { en: '{0} total Passive Skill Points ({1} allocated)', ru: 'Всего очков пассивных умений: {0} (распределено: {1})' },
  PassiveInfoLevel: { en: '{0} Passive Skill Points from character level', ru: '{0} от уровня героя' },
  PassiveInfoQuestTotal: { en: '{0} Passive Skill Points from quests:', ru: '{0} от заданий:' },
  PassiveInfoQuest: { en: '({1} from {0})', ru: '({1} от {0})' },
  PassiveInfoAscendancy: { en: '{0} total Ascendancy Skill Points ({1} allocated)', ru: '{0} очков Восхождения ({1} использовано)' },
  PassiveInfoAscendancySkills: { en: '{0} Passive Skill Points from Ascendancy Passive Skills', ru: '{0} от пассивных умений Восхождения' },
  PlayerSlain: { en: '{0} has been slain.', ru: '{0} был повержен.' }
} as const

export type BuildLogStringId = keyof typeof BUILD_LOG_STRINGS

export type BuildLogEvent =
  /** вложена или снята нода; atlas — нода атласа (id `atlas_…`), к дереву персонажа не относится */
  | { type: 'passive'; allocated: boolean; id: string; name: string; atlas: boolean }
  /** получены (+) или потеряны (−) очки пассивок */
  | { type: 'passivePoints'; delta: number }
  /** получены очки сброса пассивок */
  | { type: 'respecPoints'; delta: number }
  /** `/passives`: всего очков и распределено */
  | { type: 'passivesTotal'; total: number; allocated: number }
  | { type: 'passivesLevel'; points: number }
  | { type: 'passivesQuests'; points: number }
  /** `/passives`: очки за квест (имя — как в клиенте; 0 — квест не сдан) */
  | { type: 'passivesQuest'; quest: string; points: number }
  | { type: 'passivesAscendancy'; points: number }
  | { type: 'ascendancyTotal'; total: number; allocated: number }
  /** смерть игрока (своя или участника группы — различать по имени) */
  | { type: 'death'; player: string }

const PASSIVE = /^Successfully (allocated|unallocated) passive skill id: (.+?), name: (.*)$/

/** Шаблон клиента → регулярка системного сообщения `: …` и номера подстановок по порядку групп. */
function compileTemplate(tpl: string): { re: RegExp; order: number[] } {
  const order: number[] = []
  const body = tpl
    .split(/(\{\d\})/)
    .map((part) => {
      const m = /^\{(\d)\}$/.exec(part)
      if (m) {
        order.push(Number(m[1]))
        return '(.+?)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return { re: new RegExp(`^: ${body}$`), order }
}

type ArgsTo = (a: string[]) => BuildLogEvent | null

const num = (s: string | undefined): number | null => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null)
const one =
  (make: (n: number) => BuildLogEvent): ArgsTo =>
  (a) => {
    const n = num(a[0])
    return n === null ? null : make(n)
  }
const two =
  (make: (x: number, y: number) => BuildLogEvent): ArgsTo =>
  (a) => {
    const x = num(a[0])
    const y = num(a[1])
    return x === null || y === null ? null : make(x, y)
  }

const BUILD_EVENTS: [BuildLogStringId, ArgsTo][] = [
  ['ReceivedPassivePoint1', () => ({ type: 'passivePoints', delta: 1 })],
  ['ReceivedPassivePointN', one((n) => ({ type: 'passivePoints', delta: n }))],
  ['LostPassivePoint1', () => ({ type: 'passivePoints', delta: -1 })],
  ['LostPassivePointN', one((n) => ({ type: 'passivePoints', delta: -n }))],
  ['ReceivedRespecPoint1', () => ({ type: 'respecPoints', delta: 1 })],
  ['ReceivedRespecPointN', one((n) => ({ type: 'respecPoints', delta: n }))],
  ['PassiveInfoTotal', two((total, allocated) => ({ type: 'passivesTotal', total, allocated }))],
  ['PassiveInfoLevel', one((points) => ({ type: 'passivesLevel', points }))],
  ['PassiveInfoQuestTotal', one((points) => ({ type: 'passivesQuests', points }))],
  [
    'PassiveInfoQuest',
    (a) => {
      const points = num(a[1])
      return points === null || !a[0] ? null : { type: 'passivesQuest', quest: a[0], points }
    }
  ],
  ['PassiveInfoAscendancy', two((total, allocated) => ({ type: 'ascendancyTotal', total, allocated }))],
  ['PassiveInfoAscendancySkills', one((points) => ({ type: 'passivesAscendancy', points }))]
]

const BUILD_MATCHERS = BUILD_EVENTS.flatMap(([id, make]) =>
  (['en', 'ru'] as const).map((lang) => ({ ...compileTemplate(BUILD_LOG_STRINGS[id][lang]), make }))
)

/** Текст строки журнала (после префикса) → событие вкладки «Билд». */
export function parseBuildLogText(text: string): BuildLogEvent | null {
  const p = PASSIVE.exec(text)
  if (p) return { type: 'passive', allocated: p[1] === 'allocated', id: p[2], name: p[3], atlas: p[2].startsWith('atlas_') }
  if (!text.startsWith(': ')) return null
  for (const m of BUILD_MATCHERS) {
    const hit = m.re.exec(text)
    if (!hit) continue
    const args: string[] = []
    m.order.forEach((idx, g) => (args[idx] = hit[g + 1]))
    const ev = m.make(args)
    if (ev) return ev
  }
  const f = parseFarmText(text)
  return f?.type === 'death' ? { type: 'death', player: f.player } : null
}

export function parseBuildLogLine(line: string): BuildLogEvent | null {
  const ll = splitLogLine(line)
  return ll ? parseBuildLogText(ll.text) : null
}

/** Событие «Билда» и место строки в журнале (как parseLevelingLog). */
export function parseBuildLog(line: string): { event: BuildLogEvent; at: LevelingCursor | null } | null {
  const ll = splitLogLine(line)
  if (!ll) return null
  const event = parseBuildLogText(ll.text)
  if (!event) return null
  return { event, at: ll.ts !== null && ll.uptimeMs !== undefined ? { ts: ll.ts, up: ll.uptimeMs } : null }
}

/** Вывод команды `/passives`, собранный из идущих подряд строк. */
export interface PassivesReport {
  total: number | null
  allocated: number | null
  fromLevel: number | null
  fromQuests: number | null
  /** очки по квестам (имя — как в клиенте), в порядке вывода */
  quests: { quest: string; points: number }[]
  ascendancyTotal: number | null
  ascendancyAllocated: number | null
  fromAscendancy: number | null
}

const PASSIVES_TYPES = new Set<BuildLogEvent['type']>([
  'passivesTotal',
  'passivesLevel',
  'passivesQuests',
  'passivesQuest',
  'passivesAscendancy',
  'ascendancyTotal'
])

const emptyReport = (): PassivesReport => ({
  total: null,
  allocated: null,
  fromLevel: null,
  fromQuests: null,
  quests: [],
  ascendancyTotal: null,
  ascendancyAllocated: null,
  fromAscendancy: null
})

/**
 * Последний вывод `/passives` в строках журнала. Новый вывод начинается со строки «всего очков» (если её нет —
 * со строки «очки за квесты:», которой в текущем выводе ещё не было); строки квестов после неё — его. Другие
 * строки журнала между ними вывод не прерывают.
 */
export function lastPassivesReport(lines: Iterable<string>): PassivesReport | null {
  let cur: PassivesReport | null = null
  for (const line of lines) {
    const ev = parseBuildLogLine(line)
    if (!ev || !PASSIVES_TYPES.has(ev.type)) continue
    if (!cur || ev.type === 'passivesTotal' || (ev.type === 'passivesQuests' && cur.fromQuests !== null)) cur = emptyReport()
    switch (ev.type) {
      case 'passivesTotal':
        cur.total = ev.total
        cur.allocated = ev.allocated
        break
      case 'passivesLevel':
        cur.fromLevel = ev.points
        break
      case 'passivesQuests':
        cur.fromQuests = ev.points
        break
      case 'passivesQuest':
        cur.quests.push({ quest: ev.quest, points: ev.points })
        break
      case 'ascendancyTotal':
        cur.ascendancyTotal = ev.total
        cur.ascendancyAllocated = ev.allocated
        break
      case 'passivesAscendancy':
        cur.fromAscendancy = ev.points
        break
    }
  }
  return cur
}
