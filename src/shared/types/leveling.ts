// Прокачка PoE1 (этап S14): маршрут кампании актов 1–10 по логу игры. Данные —
// resources/data/poe1/leveling/leveling.json (генератор tools/leveling/build.mjs, маршрут exile-leveling, MIT);
// логика — src/shared/leveling/*.

/** Текстовый кусок шага: EN как в маршруте и наш перевод. */
export interface LvText {
  t: string
  r: string
}

/** Фрагмент шага (как в exile-leveling): зона, квест, босс, путевой камень… */
export type LvFrag =
  | { k: 'enter' | 'area'; a: string }
  | { k: 'wp'; a: string }
  | { k: 'wpicon' | 'wpget' | 'logout' | 'trial' }
  | { k: 'craft'; a?: string }
  | { k: 'portal'; v: 'set' | 'use' }
  | { k: 'quest'; q: string; o?: string[] }
  | { k: 'kill' | 'arena' | 'generic' | 'qtext' | 'copy'; v: string }
  | { k: 'ascend'; v: 'normal' | 'cruel' | 'merciless' | 'eternal' }
  | { k: 'dir'; d: number }

export type LvPart = LvText | LvFrag | string

export type LvTag = 'passive' | 'trial' | 'flask' | 'gem'

export interface LvStep {
  /** стабильный id: a<акт>-<номер> */
  id: string
  parts: LvPart[]
  /** подсказки под шагом: EN и наш RU (строки — уже без фрагментов, части как в шаге) */
  sub?: { en: LvPart[]; ru: LvPart[] }[]
  /** условия варианта маршрута: 'LEAGUE_START', '!BANDIT_KILL'… — все должны выполняться */
  cond?: string[]
  tags?: LvTag[]
  /** рекомендуемый уровень («8», «14–15») */
  lvl?: string
  /** «докачайтесь до …» */
  farm?: boolean
}

export interface LvSection {
  act: number
  en: string
  ru: string
  steps: LvStep[]
}

export interface LvArea {
  act: number
  level: number
  town?: boolean
  wp?: boolean
  townId?: string
  en: string
  ru: string
}

export interface LvGemReward {
  gem: string
  classes: string[]
  npc?: string
}

export interface LvQuest {
  act: number
  en: string
  ru: string
  /** очки пассивов за квест */
  passives?: number
  /** очки только в этом варианте (бандиты: BANDIT_KILL) */
  passivesIf?: string
  rewards?: Record<string, { npc: string | null; quest: LvGemReward[]; vendor: LvGemReward[] }>
}

export interface LvGem {
  en: string
  ru: string
  attr: 'strength' | 'dexterity' | 'intelligence' | string
  lvl: number
  support?: boolean
}

export interface LevelingData {
  meta: {
    source: { repo: string; commit: string; license: string; copyright: string }
    names: string[]
    acts: number
    steps: number
  }
  areas: Record<string, LvArea>
  quests: Record<string, LvQuest>
  gems: Record<string, LvGem>
  characters: Record<string, { start: string; chest: string }>
  killWaypoints: Record<string, string[]>
  /** EN → RU: боссы, арены, предметы квестов, NPC */
  names: Record<string, string>
  sections: LvSection[]
}

/** Выбор у бандитов во 2 акте: убить всех (+1 очко пассивов) или помочь одному. */
export type LvBandit = 'kill' | 'alira' | 'kraityn' | 'oak'

export interface LevelingVariant {
  /** маршрут «старт лиги»: побочные квесты, испытания, сундук с флаконом */
  leagueStart: boolean
  bandit: LvBandit
}

/** Персонаж прокачки (как ProfileMeta компаса PoE2, но свой список — компас не трогаем). */
export interface LevelingProfile {
  id: string
  name: string
  /** класс из журнала игры («(Witch) is now level») или выбранный вручную */
  className: string | null
  /** имя персонажа в игре — уровень берём только его (в группе в лог пишут и чужие) */
  character: string | null
  createdAt: number
  updatedAt: number
}

/** Прогресс персонажа по маршруту. */
export interface LevelingProgress {
  /** пройденные шаги: id → когда отмечен */
  done: Record<string, number>
  /** текущий шаг (id); null — маршрут пройден */
  current: string | null
  level: number
  /** последняя зона из журнала */
  areaId: string | null
  variant: LevelingVariant
  updatedAt: number
}

/** Гид поверх игры (userData/leveling.json). */
export interface LevelingConfig {
  /** гид поверх игры включён */
  overlay: boolean
  /** свёрнут в полосу */
  collapsed: boolean
  /** куда перетащили: левый верхний угол, доли окна игры; null — слева сверху под баффами */
  pos: { x: number; y: number } | null
}

export interface LevelingLogStatus {
  connected: boolean
  logPath: string | null
}

/** Состояние для окон: персонажи, активный, его прогресс, настройки гида. */
export interface LevelingState {
  profiles: LevelingProfile[]
  activeId: string
  progress: LevelingProgress
  config: LevelingConfig
  log: LevelingLogStatus
  /** игрок в зоне другого шага: номер шага в плоском маршруте, куда «перейти»; null — по маршруту */
  offRoute: number | null
}

/** Кнопки маршрута (одно действие — одно изменение прогресса, в игру ничего не шлём). */
export type LevelingAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'toggle'; stepId: string }
  | { type: 'jump'; index: number }
  | { type: 'reset' }
