// IPC домена «игровой оверлей» (этап S1): активация/фокус игры, прямоугольники
// кликабельных виджетов, ввод в игру (чат, поиск в стэше) и событие «предмет скопирован».
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  CapturedItem,
  GameInputResult,
  InteractiveRect,
  OverlayFocusState,
  HotkeyConflict,
  ItemEnRequest,
  OverlayNotice,
  OverlayPoint,
  OverlayState,
  OverlayStatus
} from '../types/overlay'

export const overlayChannels = {
  overlay: {
    getState: 'overlay:getState',
    activate: 'overlay:activate',
    focusGame: 'overlay:focusGame',
    updateInteractiveRects: 'overlay:updateInteractiveRects',
    trackAutoHide: 'overlay:trackAutoHide',
    typeInChat: 'overlay:typeInChat',
    stashSearch: 'overlay:stashSearch',
    hotkeyConflicts: 'overlay:hotkeyConflicts',
    openHotkeySettings: 'overlay:openHotkeySettings',
    copyItemEn: 'overlay:copyItemEn'
  }
} as const

export const overlayEvents = {
  overlayFocus: 'event:overlay.focus',
  overlayStatus: 'event:overlay.status',
  overlayItemCaptured: 'event:overlay.itemCaptured',
  overlayAutoHide: 'event:overlay.autoHide',
  overlayDismiss: 'event:overlay.dismiss',
  overlayNotice: 'event:overlay.notice',
  overlayHotkeyConflicts: 'event:overlay.hotkeyConflicts',
  overlayItemEn: 'event:overlay.itemEn'
} as const

export interface OverlayIpcApi {
  overlay: {
    getState(): Promise<OverlayState>
    /** Активировать оверлей (мышь и клавиатура — в оверлей), как Shift+Space. */
    activate(): void
    /** Вернуть фокус игре (Esc, клик по пустому фону, после клика по виджету). */
    focusGame(): void
    /**
     * Прямоугольники интерактивных виджетов (координаты окна оверлея). Пока оверлей не
     * активирован, main опрашивает курсор и над ними временно ловит мышь.
     */
    updateInteractiveRects(rects: InteractiveRect[]): void
    /**
     * Следить, отошёл ли курсор от точки `from` (окно оверлея) дальше `threshold` px или
     * кликнул мимо виджетов — тогда придёт onOverlayAutoHide (так прячется окно Ctrl+D,
     * как в APT). null — перестать.
     */
    trackAutoHide(from: OverlayPoint | null, threshold?: number): void
    /** Вставить текст в чат игры (через буфер обмена); send — сразу отправить Enter. */
    typeInChat(text: string, opts?: { send?: boolean }): Promise<GameInputResult>
    /** Ctrl+F → вставить текст в поле поиска стэша/торговца → Enter. */
    stashSearch(text: string): Promise<GameInputResult>
    /** Хоткеи, которые сейчас не зарегистрированы: сочетание занято другой программой. */
    hotkeyConflicts(): Promise<HotkeyConflict[]>
    /** «Сменить клавишу» из уведомления поверх игры: компаньон на странице настроек. */
    openHotkeySettings(): void
    /** S51: английский текст предмета → в буфер (только окно оверлея; старый буфер не возвращается). */
    copyItemEn(text: string): Promise<boolean>
  }
  onOverlayFocus(cb: (focus: OverlayFocusState) => void): () => void
  onOverlayStatus(cb: (status: OverlayStatus) => void): () => void
  /** Ctrl+D: текст предмета скопирован из игры (буфер уже восстановлен). */
  onItemCaptured(cb: (item: CapturedItem) => void): () => void
  /**
   * Спрятать «исключительный» виджет (окно Ctrl+D): курсор ушёл от точки trackAutoHide
   * или игрок кликнул мимо окна, пока оверлей пассивен.
   */
  onOverlayAutoHide(cb: () => void): () => void
  /** Esc в активном оверлее: закрыть всплывающие окна (фокус уже уходит в игру). */
  onOverlayDismiss(cb: () => void): () => void
  /** Короткое уведомление поверх игры (тост на несколько секунд). */
  onOverlayNotice(cb: (notice: OverlayNotice) => void): () => void
  /** Список занятых хоткеев изменился (настройки показывают плашку). */
  onHotkeyConflicts(cb: (conflicts: HotkeyConflict[]) => void): () => void
  /** S51: хоткей «по-английски» скопировал предмет — собрать EN-текст и отдать в copyItemEn (только оверлей). */
  onItemEn(cb: (req: ItemEnRequest) => void): () => void
}
