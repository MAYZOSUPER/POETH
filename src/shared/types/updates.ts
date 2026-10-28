// Запуск «как APT / Sidekick» и обновления (этап S10a): автообновление приложения
// (electron-updater, GitHub Releases), обновление данных без переустановки, экран загрузки.

/** Состояние автообновления приложения — для окна «Вышло обновление» и настроек. */
export interface UpdateState {
  phase: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'downloaded' | 'error'
  /** версия, которая сейчас установлена */
  current: string
  /** доступная версия (available и дальше) */
  version?: string
  /** «что нового» — простой текст из описания релиза */
  notes?: string
  /** загрузка, 0..100 */
  percent?: number
  /** короткое описание ошибки (только для ошибок, которые видит пользователь) */
  error?: string
  /**
   * portable-версия (S10b): electron-updater её не обновляет — вместо «Обновить сейчас»
   * «Скачать новую версию» открывает страницу релиза
   */
  portable?: boolean
}

/** Шаги экрана загрузки. */
export type StartupStep = 'settings' | 'data' | 'leagues' | 'ready'

export interface StartupState {
  step: StartupStep
  version: string
}

/** Манифест пакета данных (ветка data публичного репо): файлы игры и их sha256. */
export interface DataManifest {
  /** версия пакета данных, например «3.30.0-1» — для тоста «Данные обновлены (…)» */
  version: string
  /** игра: файлы лежат в userData/data/<game>/… (= GameDef.dataDir) */
  game: 'poe1' | 'poe2'
  /** минимальная версия приложения, которая понимает эти данные (иначе пакет пропускаем) */
  minApp?: string
  /** путь относительно папки игры («en/stats.ndjson», «regex/maps.ru.json») → контроль */
  files: Record<string, { sha256: string; size: number }>
}

/** Settings.startup — запуск «как APT / Sidekick». */
export interface StartupSettings {
  /** «Запускать вместе с Windows» (app.setLoginItemSettings) */
  withWindows: boolean
  /** «Запускать свёрнутым» — только трей и тост, окно компаньона не открывается */
  minimized: boolean
  /**
   * Мастер первого запуска пройден или пропущен (ставит мастер S9). Пока false — окно
   * компаньона открывается при каждом запуске (с мастером поверх).
   */
  firstRunDone: boolean
}

/** Settings.updates */
export interface UpdatesSettings {
  /** «Проверять обновления» — приложения (раз в 6 ч) и данных (раз в сутки) */
  check: boolean
}
