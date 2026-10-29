// Типы вкладки «Билд» (S39, B3): сохранённые билды (userData/builds.json), состояние для окон, «взято» по журналу.
// Билд хранится разобранной моделью PoB (src/shared/pob/model.ts) — без <Import> (хэши аккаунта и персонажа)
// и без исходного кода; ссылка-источник — только страница сайта из allowlist.

import type { PobBuild } from '../pob/model'
import type { PobImportResult, PobSource } from '../pob/import'
import type { PobStageEdits } from '../pob/stages'

export type { PobSource, PobStageEdits }

/** Билд в библиотеке: модель, откуда взят, правки этапов игрока. */
export interface StoredBuild {
  id: string
  build: PobBuild
  source: PobSource
  edits: PobStageEdits
  /** когда вставлен и когда открывался последний раз (мс) */
  addedAt: number
  openedAt: number
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
