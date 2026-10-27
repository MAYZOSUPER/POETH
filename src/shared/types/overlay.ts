// Игровой оверлей (окно поверх игры, attach к окну PoE) — заполняет этап S1.
// TODO S1: состояние оверлея (активен/пропускает мышь), фокус игры, захват предмета.

/** Window-space rectangle reported by the renderer for selective click-through. */
export interface InteractiveRect {
  x: number
  y: number
  width: number
  height: number
}
