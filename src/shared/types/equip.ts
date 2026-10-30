// Типы «Против надетого» (S41, B4): запомненная надетая вещь (userData/equipped.json) и состояние для окна цены.
// Текст предмета по Ctrl+D на диск не пишется: запись — только извлечённые числа и короткие поля (слот, редкость,
// EN-ключи имени и базы, сопротивления, жизнь, ES, мана, атрибуты, требования, DPS, скорость, вид флакона/самоцвета).

export type EquipElement = 'fire' | 'cold' | 'lightning' | 'chaos'
export type EquipAttribute = 'str' | 'dex' | 'int'

/** Слоты как в PoB (Swap не трогаем) + гнёзда самоцветов по порядку запоминания. */
export const EQUIP_GEAR_SLOTS = [
  'Weapon 1',
  'Weapon 2',
  'Helmet',
  'Body Armour',
  'Gloves',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Belt',
  'Flask 1',
  'Flask 2',
  'Flask 3',
  'Flask 4',
  'Flask 5'
] as const
/** Сколько самоцветов помнить (обычные и абиссы вместе). */
export const EQUIP_JEWELS_MAX = 12
export type EquipGearSlot = (typeof EQUIP_GEAR_SLOTS)[number]
export type EquipSlot = EquipGearSlot | `Jewel ${number}`

/**
 * Вид вещи для правил слотов: оружие одноручное / двуручное / лук, щит, колчан, броня, бижутерия, флакон,
 * самоцвет (обычный или абисс). `complex` — кластерный или уникальный самоцвет: не сравниваем («смотри в PoB»).
 */
export type EquipKind =
  | 'weapon1h'
  | 'weapon2h'
  | 'bow'
  | 'shield'
  | 'quiver'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'amulet'
  | 'ring'
  | 'belt'
  | 'flask'
  | 'jewel'
  | 'abyss'
  | 'complex'

export type EquipRarity = 'normal' | 'magic' | 'rare' | 'unique'

/** Вид флакона: сравниваем только с флаконом того же вида (у особых — той же базы). */
export type FlaskType = 'life' | 'mana' | 'hybrid' | 'utility'

/** Плоские числа вещи (из статов парсера — одинаково для RU и EN клиента). */
export interface EquipNumbers {
  life: number
  /** «#% increased maximum Life» — у самоцветов и поясов; точно только в PoB */
  lifePct: number
  /** у брони — свойство «Энергетический щит» вещи, у бижутерии — плоский мод */
  es: number
  mana: number
  res: Record<EquipElement, number>
  attr: Record<EquipAttribute, number>
  /** скорость передвижения, % */
  speed: number
  /** шанс блока щита, % */
  block: number
  /** DPS оружия из свойств (физ. и стихийный; хаос парсер не читает) */
  pdps: number
  edps: number
  /** у вещи есть моды урона, которые без PoB не оценить (чары, крит, «increased …») */
  dmg: number
  /** оружие для заклинаний (моды чар): его DPS для билда чар не важен */
  caster: boolean
}

/** Требования вещи (0 — нет). */
export interface EquipReq {
  level: number
  str: number
  dex: number
  int: number
}

/** Флакон: что восстанавливает и сколько длится. */
export interface FlaskNumbers {
  type: FlaskType
  life: number
  mana: number
  /** секунды восстановления или действия */
  duration: number
  /** зарядов за использование и всего */
  use: number
  charges: number
  quality: number
}

/** Вещь в окне цены (числа, без текста) — то, что сравнивается и что можно запомнить. */
export interface EquipItem {
  kind: EquipKind
  rarity: EquipRarity
  /** у уника — EN-имя (refName), у прочих — null (имя редкой вещи — случайные слова на языке клиента, не храним) */
  name: string | null
  /** EN-имя базы (refName) */
  base: string
  n: EquipNumbers
  req: EquipReq
  flask: FlaskNumbers | null
}

/** Запомненная надетая вещь. */
export interface EquipEntry extends EquipItem {
  slot: EquipSlot
  /** когда запомнили (мс) */
  at: number
}

/** «Мои сопротивления сейчас» — ввод игрока (как в окне персонажа), если билда нет или он о другом. */
export interface EquipMine {
  res: Partial<Record<EquipElement, number>>
  at: number
}

export interface EquipState {
  /** блок включён (флаг вкладки «Билд», только PoE 1) */
  on: boolean
  /** персонаж текущего входа по Client.txt; null — неизвестен (общий набор «без персонажа») */
  character: string | null
  /** его уровень по журналу */
  level: number | null
  items: EquipEntry[]
  mine: EquipMine | null
  /** «Точный расчёт (PoB)» включён (бета S44; equipped.json → pob) */
  pob?: boolean
}
