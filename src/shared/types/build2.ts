// Типы IPC экрана «Билд» PoE 2 (S66): импорт PoB2, предпросмотр этапов, «Сохранить в игру» (файл `.build` в папку
// игрового планировщика), «Вложение». Модель и расчёты — src/shared/poe2/build/*, main считает, окно показывает.

import type { Pob2ImportError, PobFetchError } from '../pob/import'
import type { PobCopySite } from '../pob/links'
import type { Build2Summary } from '../poe2/build/view'
import type { BuildHintLang } from '../poe2/build/gameBuild'

export type { Build2GemView, Build2NodeView, Build2StageView, Build2Summary } from '../poe2/build/view'
export type { BuildHintLang, GameBuildReport } from '../poe2/build/gameBuild'

export interface Build2Recent {
  id: string
  /** название по умолчанию RU/EN — как в сводке */
  name: { ru: string; en: string }
  importedAt: number
}

/** Папка игрового планировщика (Documents/My Games/Path of Exile 2/BuildPlanner). */
export interface Build2Dir {
  /** полный путь к папке BuildPlanner */
  path: string
  /** папка игры «Path of Exile 2» есть (игра запускалась на этом компьютере) */
  game: boolean
}

export interface Build2State {
  active: Build2Summary | null
  recent: Build2Recent[]
  /** данных дерева/камней нет или формат новее — экспорт недоступен */
  dataError: boolean
}

export type Build2ImportResult =
  | { ok: true; state: Build2State }
  | { ok: false; error: Pob2ImportError | 'no-data'; copySite?: PobCopySite; host?: string; fetchError?: PobFetchError }

export interface Build2SaveRequest {
  id: string
  /** название билда (в игре; из него — имя файла) */
  name: string
  /** язык подсказок в файле */
  lang: BuildHintLang
  /** игрок подтвердил запись в показанный путь (второй вызов) */
  confirm?: boolean
  /** имя файла из первого ответа: если путь изменился — спросить снова */
  fileName?: string
  /** файл уже есть: true — заменить, false/нет — не трогать */
  overwrite?: boolean
  /** «Сохранить копией»: main сам подберёт свободное «Название (N)» после обрезки имени */
  copy?: boolean
}

export type Build2SaveError =
  | 'no-build' // билда нет
  | 'no-data' // данных дерева нет
  | 'no-game-dir' // папки игры нет (игра не запускалась на этом компьютере)
  | 'exists' // файл уже есть, а замену не подтвердили
  | 'changed' // имя файла изменилось после подтверждения — спросить снова
  | 'no-free-name' // «Сохранить копией»: свободного имени нет (99 копий)
  | 'io' // не удалось записать

export type Build2SaveResult =
  /** записано */
  | { ok: true; path: string; fileName: string; name: string; replaced: boolean }
  /** первый вызов: куда запишем — показать игроку и спросить; name — название в игре (у копии — с «(N)») */
  | { ok: false; error: 'confirm'; dir: Build2Dir; fileName: string; name: string; exists: boolean }
  | { ok: false; error: Build2SaveError; dir?: Build2Dir; fileName?: string }
