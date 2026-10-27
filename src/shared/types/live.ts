// Live search (PoE1) — заполняет этап S6.
// TODO S6: состояния подключения, находки (hit), события для оверлея/уведомлений.

export interface LiveSettings {
  /** максимум одновременных live-поисков (по умолчанию 10, допустимо 1..20) */
  maxSearches: number
}
