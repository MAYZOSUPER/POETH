// Картинка в памяти для распознавания стакана (S28): BGRA сверху вниз — как снимок окна игры
// (electron-overlay-window, OverlayController.screenshot) и nativeImage.toBitmap. Чистый модуль: вырезать,
// масштабировать (тесты 0,75×–2×), яркость текста.

export interface Bitmap {
  width: number
  height: number
  /** BGRA, 4 байта на точку, строки подряд */
  data: Uint8Array
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Прямоугольник, обрезанный по картинке (целые точки). */
export function clampRect(r: Rect, w: number, h: number): Rect {
  const x0 = Math.max(0, Math.floor(r.x))
  const y0 = Math.max(0, Math.floor(r.y))
  const x1 = Math.min(w, Math.ceil(r.x + r.width))
  const y1 = Math.min(h, Math.ceil(r.y + r.height))
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

/** Вырезать область (копия): большой снимок окна сразу отбрасываем. */
export function crop(img: Bitmap, r: Rect): Bitmap {
  const c = clampRect(r, img.width, img.height)
  const data = new Uint8Array(c.width * c.height * 4)
  for (let y = 0; y < c.height; y++) {
    const from = ((c.y + y) * img.width + c.x) * 4
    data.set(img.data.subarray(from, from + c.width * 4), y * c.width * 4)
  }
  return { width: c.width, height: c.height, data }
}

/** Билинейное масштабирование (фикстуры под 1440p/4K и 0,75×). */
export function resize(img: Bitmap, k: number): Bitmap {
  const width = Math.max(1, Math.round(img.width * k))
  const height = Math.max(1, Math.round(img.height * k))
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.max(0, (y + 0.5) / k - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(img.height - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, (x + 0.5) / k - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(img.width - 1, x0 + 1)
      const fx = sx - x0
      for (let c = 0; c < 4; c++) {
        const p = (yy: number, xx: number): number => img.data[(yy * img.width + xx) * 4 + c]
        const top = p(y0, x0) * (1 - fx) + p(y0, x1) * fx
        const bot = p(y1, x0) * (1 - fx) + p(y1, x1) * fx
        data[(y * width + x) * 4 + c] = Math.round(top * (1 - fy) + bot * fy)
      }
    }
  }
  return { width, height, data }
}

/**
 * «Насколько это текст таблицы»: светлые и почти серые точки (цифры стакана — белые/бежевые на тёмном).
 * 0…255 на точку. Цветные надписи окна (зелёное «Хочу», оранжевое «Имею») и золото рамок гасятся насыщенностью.
 */
export function inkMap(img: Bitmap): Uint8Array {
  const out = new Uint8Array(img.width * img.height)
  for (let i = 0; i < out.length; i++) {
    const b = img.data[i * 4]
    const g = img.data[i * 4 + 1]
    const r = img.data[i * 4 + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const v = max - (max - min) * 1.2
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : v
  }
  return out
}
