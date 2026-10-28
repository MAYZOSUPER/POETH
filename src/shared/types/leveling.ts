// Прокачка PoE1 (этапы S14, S22): маршрут кампании актов 1–10 по логу игры. Данные —
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

/**
 * Почему кампания считается пройденной (S22, всё — из журнала игры): карта атласа, эпилог после 10 акта,
 * зона эндгейма (не кампания, уровень области ≥ 68) или высокий уровень персонажа.
 */
export type LevelingFinishReason = 'map' | 'epilogue' | 'endgame' | 'level'

export interface LevelingFinished {
  reason: LevelingFinishReason
  at: number
  /** зона-признак (карта, эпилог, эндгейм) */
  areaId?: string
  /** уровень области или персонажа */
  level?: number
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
  /** кампания пройдена (по журналу) — в режиме «авто» гид скрыт; null — нет */
  finished: LevelingFinished | null
  /** «Показать всё равно»: гид работает и после кампании */
  showAnyway: boolean
  updatedAt: number
}

/** Когда показывать гид поверх игры: авто — только в зонах кампании, пока она не пройдена. */
export type LevelingShow = 'auto' | 'always' | 'never'

/** Гид поверх игры (userData/leveling.json — свой файл, не Settings). */
export interface LevelingConfig {
  show: LevelingShow
  /** свёрнут в полосу */
  collapsed: boolean
  /** куда перетащили: левый верхний угол, доли окна игры; null — слева сверху под баффами */
  pos: { x: number; y: number } | null
}

/** Вид зоны для гида: кампания (акты 1–10), город, убежище, карта, эндгейм (эпилог, ≥ 68), прочее. */
export type LevelingZoneKind = 'campaign' | 'town' | 'hideout' | 'map' | 'endgame' | 'other'

/**
 * Текущий вход в игру по журналу (от строки входа на сервер до следующей): кто играет и где. Персонаж
 * узнаётся по своему повышению уровня; до тех пор события идут активному персонажу, а снимок его прогресса
 * позволяет откатить их, если вход окажется другим персонажем.
 */
export interface LevelingSession {
  /** имя персонажа этого входа (по повышению уровня); null — ещё не знаем */
  character: string | null
  /** вход начался в Сумрачном взморье (1_1_1) — новый персонаж */
  fresh: boolean
  /** признак «кампания пройдена» в этом входе; null — не было */
  endgame: LevelingFinished | null
  /** в этом входе персонаж дошёл до эпилога — гид ещё показывает последние шаги маршрута там */
  finale: boolean
  /** зона сейчас и её уровень */
  areaId: string | null
  areaLevel: number | null
  /** прогресс активного персонажа на входе — откат, если вход окажется другим персонажем */
  snapshot: { profileId: string; progress: LevelingProgress } | null
  /** зоны этого входа по порядку — перенести на персонажа, когда он узнается */
  zones: { areaId: string; level: number }[]
}

/** Последняя учтённая строка журнала: время и счётчик клиента (при запуске догоняем только новые). */
export interface LevelingCursor {
  ts: number
  up: number
}

/** Почему гид сейчас не виден: режим «никогда», не зона кампании, кампания пройдена, зона неизвестна. */
export type LevelingHidden = 'never' | 'zone' | 'finished' | 'noZone'

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
  /** игрок вернулся в зону раньше по маршруту: номер шага его прогресса, куда «вернуться»; null — нет */
  offRoute: number | null
  /** где игрок сейчас (по журналу); null — не знаем */
  zone: { areaId: string; level: number; kind: LevelingZoneKind } | null
  /** персонаж текущего входа в игру (по повышению уровня); null — ещё не узнали */
  character: string | null
  /** гид поверх игры: виден ли сейчас и почему нет; forced — показан хоткеем до входа в другую зону */
  guide: { visible: boolean; hidden: LevelingHidden | null; forced: boolean }
}

/** Кнопки маршрута (одно действие — одно изменение прогресса, в игру ничего не шлём). */
export type LevelingAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'toggle'; stepId: string }
  | { type: 'jump'; index: number }
  | { type: 'reset' }
  /** «Показать всё равно» после кампании (false — снова скрывать) */
  | { type: 'showAnyway'; on: boolean }
  /** «Начать заново (новый персонаж)»: новый персонаж, маршрут с начала */
  | { type: 'newCharacter'; name: string }
