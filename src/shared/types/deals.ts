// Менеджер входящих/исходящих сделок + подсветка ячейки стэша — заполняет этап S8.
// TODO S8: типы whisper'ов (EN/RU, обычные и bulk), карточки сделок, история, blacklist.

/** Сетка стэша для подсветки: 'auto' — по размеру окна игры, 'normal' 12×12, 'quad' 24×24. */
export type StashGridMode = 'auto' | 'normal' | 'quad'

/**
 * Ручная калибровка сетки стэша (координаты в пикселях окна игры).
 * TODO S8: уточнить поля, когда будет готова подсветка.
 */
export interface StashCalibration {
  left: number
  top: number
  width: number
  height: number
}

export interface DealsSettings {
  enabled: boolean
  stashGrid: StashGridMode
  /** null = калибровка не задана (позиция считается по высоте окна игры) */
  calibration: StashCalibration | null
}
