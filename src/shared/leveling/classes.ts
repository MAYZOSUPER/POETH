// Классы PoE1 (S14): база для наград-камней (в данных exile-leveling — английские базовые классы) из того,
// что пишет журнал игры в «<имя> (<класс>) is now level N»: базовый класс или класс восхождения, на языке
// клиента. Все классы EN/RU (базовые и восхождения, как в клиенте) — data.classes из генератора
// tools/leveling/game-names.mjs (S31); таблицы ниже — запас, если в данных их нет.

export const BASE_CLASSES = ['Marauder', 'Witch', 'Scion', 'Ranger', 'Duelist', 'Shadow', 'Templar'] as const
export type BaseClass = (typeof BASE_CLASSES)[number]

const ASCENDANCY: Record<string, BaseClass> = {
  Juggernaut: 'Marauder',
  Berserker: 'Marauder',
  Chieftain: 'Marauder',
  Occultist: 'Witch',
  Elementalist: 'Witch',
  Necromancer: 'Witch',
  Ascendant: 'Scion',
  Raider: 'Ranger',
  Deadeye: 'Ranger',
  Pathfinder: 'Ranger',
  Warden: 'Ranger',
  Slayer: 'Duelist',
  Gladiator: 'Duelist',
  Champion: 'Duelist',
  Assassin: 'Shadow',
  Saboteur: 'Shadow',
  Trickster: 'Shadow',
  Inquisitor: 'Templar',
  Hierophant: 'Templar',
  Guardian: 'Templar'
}

const RU_BASE: Record<string, BaseClass> = {
  Дикарь: 'Marauder',
  Ведьма: 'Witch',
  Дворянка: 'Scion',
  Охотница: 'Ranger',
  Дуэлянт: 'Duelist',
  Бандит: 'Shadow',
  Жрец: 'Templar'
}

const isBase = (s: string | undefined): s is BaseClass => !!s && (BASE_CLASSES as readonly string[]).includes(s)

/** Базовый класс по строке журнала или выбору (classes — data.classes: «Покоритель» → Marauder); null — не узнали. */
export function baseClass(name: string | null | undefined, classes?: Record<string, string>): BaseClass | null {
  if (!name) return null
  if (isBase(name)) return name
  const fromData = classes?.[name]
  if (isBase(fromData)) return fromData
  return ASCENDANCY[name] ?? RU_BASE[name] ?? null
}
