// Типы вкладки «Билд» (S39, B3): сохранённые билды (userData/builds.json), состояние для окон, «взято» по журналу.
// Билд хранится разобранной моделью PoB (src/shared/pob/model.ts) — без <Import> (хэши аккаунта и персонажа)
// и без исходного кода; ссылка-источник — только страница сайта из allowlist.

import type { PobBuild } from '../pob/model'
import type { PobFetchError, PobImportError, PobImportResult, PobSource } from '../pob/import'
import type { PobStageEdits } from '../pob/stages'
import type { StarterLeveling } from '../starters/schema'

export type { PobSource, PobStageEdits }
export type { StarterCard, StartersState, StarterFilters, StarterSort } from '../starters/view'
export type { StarterLinkKind } from '../starters/schema'

/** Билд взят из «Стартеров» лиги (S59): какой записи и совпал ли PoB с проверенной версией. */
export interface StarterRef {
  /** id записи стартера */
  id: string
  /** лига списка (`3.30`) */
  league: string
  /** «Автор обновил PoB после нашей проверки»: отпечаток скачанного PoB не совпал с проверенным */
  changed: boolean
}

/** Билд в библиотеке: модель, откуда взят, правки этапов игрока. */
export interface StoredBuild {
  id: string
  build: PobBuild
  source: PobSource
  edits: PobStageEdits
  /** когда вставлен и когда открывался последний раз (мс) */
  addedAt: number
  openedAt: number
  /** S59: билд из «Стартеров» */
  starter?: StarterRef
}

/** Строка «Недавние билды» — без модели (имя на языке клиента собирает окно по ключу камня и классу). */
export interface BuildRecent {
  id: string
  /** имя главного камня, как в PoB (EN) */
  mainSkill: string
  /** ключ главного камня PoB — для имени на языке клиента */
  mainGemId: string | null
  /** classId и ascendClassId PoB (активное дерево) */
  classId: number
  ascendClassId: number
  className: string
  ascendClassName: string | null
  source: PobSource
  addedAt: number
  openedAt: number
  /** S59: id записи стартера, если билд взят из «Стартеров» */
  starter?: string
}

export interface BuildState {
  /** открытый билд; null — пустое состояние (вставить код) */
  active: StoredBuild | null
  /** все сохранённые, новые сверху (в том числе открытый) */
  recent: BuildRecent[]
}

/** Ноды дерева по журналу игры (строковые id, как в Client.txt) у персонажа текущего входа. */
export interface BuildTaken {
  /** персонаж (по последнему повышению уровня); null — ещё не знаем */
  character: string | null
  /** взятые ноды */
  taken: string[]
  /** снятые ноды (журнал видел снятие — даже если взята была раньше хвоста журнала) */
  removed: string[]
  /** журнал игры найден и читается */
  log: boolean
}

/** Ответ вставки: ошибка разбора или новое состояние (билд сохранён и открыт). */
export type BuildImportResult = Exclude<PobImportResult, { ok: true }> | { ok: true; state: BuildState }

/** Ответ «показать поверх дерева в игре»: есть ли наложение дерева (S38) в этой сборке. */
export interface BuildTreeResult {
  available: boolean
}

/** «Играть по этому гайду» (S59): сделать билд активным вместо текущего или только добавить в библиотеку. */
export type StarterPlayMode = 'replace' | 'add'

export type StarterPlayError =
  | PobImportError
  | 'removed' // паста удалена (404/410): «Автор убрал PoB. Откройте гайд автора»
  | 'unknown' // такой записи в списке нет (список обновился)

/** Ответ «Играть по этому гайду»: билд сохранён (и открыт при 'replace') или что случилось. */
export type StarterPlayResult =
  | {
      ok: true
      state: BuildState
      /** PoB изменился после нашей проверки */
      changed: boolean
      /** этапы прокачки в скачанном PoB: нет — «по актам вести не сможем» */
      leveling: StarterLeveling
    }
  | { ok: false; error: StarterPlayError; fetchError?: PobFetchError; detail?: string }
