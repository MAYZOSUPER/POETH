// Классы PoE1 (S14): база для наград-камней (в данных exile-leveling — английские базовые классы) из того,
// что пишет журнал игры в «<имя> (<класс>) is now level N»: базовый класс или класс восхождения, на языке
// клиента. RU-имена базовых классов — как в русском клиенте; классы восхождения на русском — нет в данных,
// тогда класс выбирают вручную.

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

/** Базовый класс по строке журнала или выбору; null — не узнали. */
export function baseClass(name: string | null | undefined): BaseClass | null {
  if (!name) return null
  if ((BASE_CLASSES as readonly string[]).includes(name)) return name as BaseClass
  return ASCENDANCY[name] ?? RU_BASE[name] ?? null
}
