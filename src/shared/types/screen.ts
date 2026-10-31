// Типы домена «цены поверх окон» (S68): результат распознавания окна игры по снимку — отдельно от подписей цен.
// Результат нужен не только подписям: «Богатство PoE 2» берёт из него содержимое вкладки (у PoE 2 нет API тайника).

/** Какое окно читали. */
export type ScreenWindow = 'stash' | 'ritual' | 'expedition'

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** Ячейка окна. Координаты — физические точки клиентской области окна игры (как снимок). */
export interface ScreenCell {
  rect: ScreenRect
  /** английское имя предмета (ключ цен); null — не узнан */
  item: string | null
  /** другие предметы с тем же рисунком (уровни PoE 2 без раскладки) — какой из них, не известно */
  alt?: string[]
  /** в ячейке лежит предмет (у пустой ячейки игра рисует серый силуэт) */
  present: boolean
  /** число в стопке; null — не прочитано */
  count: number | null
  /** число подтверждено (совпало несколько прочтений и разметка) */
  countSure: boolean
  /** сходство с иконкой предмета, 0…1 */
  match: number
  /** номер ячейки в раскладке вкладки */
  slot?: number
}

export interface ScreenTiming {
  /** снимок окна (main) */
  capture?: number
  /** поиск ячеек и привязка раскладки */
  find: number
  /** сравнение с иконками */
  match: number
  /** числа стопок */
  ocr: number
  total: number
}

export interface ScreenRead {
  game: 'poe1' | 'poe2'
  window: ScreenWindow
  /** раскладка особой вкладки ('orbs', 'essence', …); null — ячейки найдены без раскладки */
  tab: string | null
  /** точек снимка на точку эталонной раскладки; null — без раскладки */
  scale: number | null
  /** клиентская область окна игры, физические точки */
  client: { width: number; height: number }
  cells: ScreenCell[]
  /** время снимка, мс эпохи */
  at: number
  ms: ScreenTiming
}

/** Подпись цены у ячейки. */
export interface ScreenLabel {
  rect: ScreenRect
  /** цена за штуку в базовой валюте игры (PoE 1 — chaos, PoE 2 — exalted) */
  unit: number | null
  /** стоимость стопки (unit × count) */
  stack: number | null
  count: number | null
  item: string
  /** цена ненадёжна (мало сделок) или предмет узнан неточно */
  doubt: boolean
}

export interface ScreenLabels {
  game: 'poe1' | 'poe2'
  /** базовая валюта: 'chaos' | 'exalted' */
  base: 'chaos' | 'exalted'
  /** base за divine; null — курса нет */
  divine: number | null
  labels: ScreenLabel[]
  /** итог вкладки в base (только ячейки с ценой и числом) */
  total: number
  /** ячеек с предметом без цены */
  unpriced: number
  /** ячеек с предметом, у которых число не прочитано (в итог не вошли) */
  uncounted: number
  /** в итоге есть числа, прочитанные неуверенно, — итог приблизительный */
  approx: boolean
  /** куда ставить итог: правый верх области ячеек */
  anchor: ScreenRect
  client: { width: number; height: number }
  at: number
}

/** Почему подписей нет. */
export type ScreenFail = 'no-game' | 'not-found' | 'no-icons' | 'error' | 'unsupported'

/** Что показывает оверлей: идёт чтение, подписи, или почему не вышло. */
export interface ScreenOverlayState {
  status: 'idle' | 'busy' | 'shown' | 'fail'
  fail?: ScreenFail
  /** готовятся эталоны иконок (первый раз): сколько из скольких */
  icons?: { done: number; total: number }
  labels?: ScreenLabels | null
  /** время снимка и распознавания, мс */
  ms?: ScreenTiming
}
