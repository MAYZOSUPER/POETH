// Игровой оверлей (прозрачное окно поверх игры, attach к окну PoE) — этап S1.
// Окно: src/main/windows/gameOverlay.ts; фокус: src/main/focus/gameFocus.ts;
// захват предмета: src/main/input/gameInput.ts; renderer: src/renderer/src/overlay/**.

/** Прямоугольник интерактивного виджета в координатах окна оверлея (CSS px = DIP). */
export interface InteractiveRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayPoint {
  x: number
  y: number
}

/** Язык клиента игры, определённый по первой строке текста предмета. */
export type ItemLang = 'en' | 'ru'

/** Текст предмета, скопированный из игры по Ctrl+D (сырой, как в буфере обмена). */
export interface CapturedItem {
  text: string
  lang: ItemLang
  /** курсор в момент нажатия — в координатах окна оверлея (DIP), для позиционирования виджета */
  cursor: OverlayPoint
  /**
   * Монитор под курсором в координатах окна оверлея (DIP). Окно виджета держим внутри
   * пересечения этого монитора и окна игры (игра в окне может свисать за край экрана или
   * стоять на двух мониторах). null — монитор не определён, ограничиваемся окном игры.
   */
  area: InteractiveRect | null
  /** Date.now() момента захвата */
  at: number
}

/** Где открывать окно цены (popup) по Ctrl+D. */
export type PricePopupPosition = 'cursor' | 'left' | 'right'

export const PRICE_POPUP_POSITIONS: readonly PricePopupPosition[] = ['cursor', 'left', 'right']

/** Раздел настроек оверлея (`Settings.overlay`, дефолт `{ pricePosition: 'cursor' }`). */
export interface OverlaySettings {
  /** «Позиция окна цены»: у курсора / у левого края / у правого края */
  pricePosition: PricePopupPosition
}

/** Кто сейчас в фокусе: игра, активированный оверлей (Shift+Space) или что-то третье. */
export interface OverlayFocusState {
  /** окно игры на переднем плане */
  game: boolean
  /** оверлей активирован: принимает мышь и клавиатуру */
  overlay: boolean
  /** переключение сделал хоткей оверлея (Shift+Space), а не клик/Alt+Tab */
  usingHotkey: boolean
}

/** Привязка к окну игры. */
export interface OverlayStatus {
  /** заголовок окна, к которому цепляемся ('Path of Exile' | 'Path of Exile 2') */
  windowTitle: string
  /** нативный модуль загружен и следит за окном игры (иначе — запасной режим «поверх экрана») */
  tracking: boolean
  /** окно игры найдено */
  attached: boolean
  /** false — игра запущена от администратора, а POETH нет: ввод в игру не дойдёт */
  hasAccess: boolean | null
  /** эксклюзивный полноэкранный режим (если известно) — оверлей в нём не виден */
  fullscreen: boolean | null
  /** клиентская область окна игры (физические пиксели экрана) */
  bounds: InteractiveRect | null
}

/** Снимок состояния оверлея — renderer берёт его при загрузке страницы. */
export interface OverlayState {
  status: OverlayStatus
  focus: OverlayFocusState
  /** последний захваченный предмет (если страница перезагрузилась после Ctrl+D) */
  lastItem: CapturedItem | null
}

/** Результат действий ввода в игру (typeInChat / stashSearch). */
export type GameInputResult = 'ok' | 'no-game' | 'no-input' | 'busy'

/**
 * Команда чата по хоткею (как в APT: F5 → /hideout). Нажатие = ровно одна команда в чат
 * через typeInChat (src/main/input/chatCommands.ts). Список — Settings.chatCommands.
 */
export interface ChatCommand {
  /** стабильный id: у пресетов — имя пресета ('hideout'), у своих — 'custom-…' */
  id: string
  /** текст; подстановки: @last — последний, кто вам писал в whisper; <char> — ваш персонаж */
  text: string
  /** акселератор Electron ('F5'); '' — без хоткея */
  hotkey: string
  /** сразу отправить (Enter); false — только вставить в чат */
  send: boolean
  enabled: boolean
}

/** Короткое уведомление поверх игры (например, «нет последнего собеседника»). */
export interface OverlayNotice {
  /** ключ строки i18n (dict/overlay.ts) */
  key: string
  params?: Record<string, string | number>
  kind: 'info' | 'warn'
}
