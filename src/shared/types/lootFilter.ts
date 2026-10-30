// Типы домена «Фильтр лута» (S53): фильтр NeverSink для PoE 1 в один клик — уровень строгости, стиль,
// установка в папку фильтров игры под своим именем, «есть новая версия».

/** Уровень строгости NeverSink: 0 — Soft (видно почти всё) … 6 — Uber Plus Strict (только самое ценное). */
export type LootFilterLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Стиль (цвета и звуки) — папка `(STYLE) <ИМЯ>` в релизе; 'default' — файлы в корне. CustomSounds не берём (нужны mp3). */
export type LootFilterStyle =
  | 'default'
  | 'abyss'
  | 'alloy'
  | 'azurite'
  | 'cobalt'
  | 'crimson'
  | 'elder'
  | 'gaia'
  | 'krangled'
  | 'lunaris'
  | 'necros'
  | 'purple'
  | 'tabula-rasa'
  | 'vaal'
  | 'velvet'
  | 'wow'

/** Релиз NeverSink на GitHub (из releases/latest; только проверенные поля). */
export interface LootFilterRelease {
  tag: string
  name: string
  /** ISO-время публикации */
  publishedAt: string
}

/** Установленный POETH файл фильтра (запись в userData/lootfilter.json + проверка файла на диске). */
export interface LootFilterInstalled {
  /** имя файла в папке фильтров: POETH-NeverSink-<уровень>.filter */
  file: string
  level: LootFilterLevel
  style: LootFilterStyle
  /** версия релиза NeverSink */
  tag: string
  /** когда поставили (ISO) */
  installedAt: string
  size: number
  /** файла нет на диске (игрок удалил) */
  missing: boolean
  /** файл менялся после установки (SHA-256 не совпадает): перезапись — только с подтверждением */
  modified: boolean
  /** вышла версия новее этой */
  outdated: boolean
}

export type LootFilterFolderSource = 'default' | 'custom' | 'env'

export interface LootFilterFolder {
  /** папка фильтров PoE 1 (Документы/My Games/Path of Exile) */
  path: string
  /** откуда путь: по умолчанию, выбран игроком, подменён переменной POETH_LOOTFILTER_DIR (проверки) */
  source: LootFilterFolderSource
  /** папка существует */
  found: boolean
  /** в папке есть production_Config.ini — похоже на папку игры */
  looksLikeGame: boolean
}

export interface LootFilterPrefs {
  level: LootFilterLevel
  style: LootFilterStyle
  /** проверять новую версию раз в сутки и без открытого экрана (по умолчанию выкл.) */
  autoCheck: boolean
}

export type LootFilterError =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'http'
  | 'bad-release'
  | 'too-large'
  | 'bad-archive'
  | 'not-in-archive'
  | 'verify-failed'
  | 'not-filter'
  | 'no-folder'
  | 'write-failed'
  | 'refused'
  | 'busy'

export interface LootFilterState {
  /** функция доступна (PoE 1) */
  on: boolean
  folder: LootFilterFolder
  prefs: LootFilterPrefs
  latest: LootFilterRelease | null
  /** когда последний раз спрашивали GitHub (мс), null — ни разу */
  lastCheckAt: number | null
  /** идёт проверка или установка */
  busy: boolean
  installed: LootFilterInstalled[]
  /** ошибка последней проверки (не установки) */
  checkError: LootFilterError | null
}

export interface LootFilterInstallRequest {
  level: LootFilterLevel
  style: LootFilterStyle
  /** игрок подтвердил перезапись своего изменённого файла */
  confirm?: boolean
}

/** Почему нужна галочка «Перезаписать»: файл менялся после установки или POETH его не помнит. */
export type LootFilterConfirmReason = 'modified' | 'unknown'

export type LootFilterInstallResult =
  | { ok: true; state: LootFilterState; file: string; tag: string }
  | { ok: false; state: LootFilterState; error: LootFilterError; confirm?: LootFilterConfirmReason; file?: string }

/** Ссылки, которые main открывает в браузере по точному адресу (renderer не может открыть github.com сам). */
export type LootFilterLink = 'repo' | 'license' | 'release' | 'filterblade'
