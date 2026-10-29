// Наложение дерева этапа билда поверх игрового дерева пассивок (S38): проекция координат tree.json в точки
// окна игры, калибровка, сохранение по разрешению окна. Чистый модуль (main, renderer оверлея, tests/build/**).
//
// Игровое дерево PoE1 плоское и без поворота: точка окна = scale·(x, y) + (ox, oy), где (x, y) — координаты
// ноды в tree.json (nodePosition), scale — точек окна на единицу дерева. Когда дерево отдалено колесом до упора,
// scale = высота клиентской области / 10000: так считает Exile-UI (Lailloken, MIT, `Leveltracker_PobSkilltree`),
// у нас это первая проверка S38 в игре (docs/check-ingame.md). Точки — физические пиксели клиентской области
// игры (как снимок экрана и uiohook); renderer оверлея делит их на devicePixelRatio.
//
// Опора калибровки — стартовый круг класса: он есть у каждого персонажа, крупный и сам по клику не вкладывается.
// Игрок наводит на него курсор и жмёт среднюю кнопку мыши — сдвиг (ox, oy) считается по одной точке при
// известном масштабе; по двум точкам — и масштаб (любой зум).

/** scale при дереве, отдалённом до упора: высота окна / ZOOM_OUT_DIVISOR. */
export const ZOOM_OUT_DIVISOR = 10_000
/** Допустимый масштаб относительно «отдалено до упора» (сохранённое и посчитанное по двум точкам). */
export const SCALE_MIN_FACTOR = 0.5
export const SCALE_MAX_FACTOR = 12
/** Две точки калибровки ближе этого (точки окна) — масштаб по ним не считаем. */
export const MIN_ALIGN_SPAN_PX = 120
/** Сколько разрешений окна помнить. */
export const MAX_SAVED_VIEWS = 16

export interface Point {
  x: number
  y: number
}

export interface ClientSize {
  width: number
  height: number
}

/** Положение дерева на экране: точка окна = scale·мир + (ox, oy). */
export interface TreeView {
  scale: number
  ox: number
  oy: number
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function validClient(c: ClientSize | null | undefined): c is ClientSize {
  return !!c && finite(c.width) && finite(c.height) && c.width >= 100 && c.height >= 100
}

export function zoomedOutScale(height: number): number {
  return height / ZOOM_OUT_DIVISOR
}

export function project(v: TreeView, p: Point): Point {
  return { x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy }
}

export function unproject(v: TreeView, s: Point): Point {
  return { x: (s.x - v.ox) / v.scale, y: (s.y - v.oy) / v.scale }
}

/** Масштаб в допустимых пределах для этого окна. */
export function scaleOk(scale: number, client: ClientSize): boolean {
  const base = zoomedOutScale(client.height)
  return finite(scale) && scale >= base * SCALE_MIN_FACTOR && scale <= base * SCALE_MAX_FACTOR
}

/** Дерево отдалено до упора (масштаб совпадает с опорным в пределах tol). */
export function isZoomedOut(v: TreeView, client: ClientSize, tol = 0.02): boolean {
  const base = zoomedOutScale(client.height)
  return Math.abs(v.scale - base) <= base * tol
}

/** Точка мира anchor — в точке экрана at, масштаб тот же. */
export function alignAt(v: TreeView, anchor: Point, at: Point): TreeView {
  return { scale: v.scale, ox: at.x - anchor.x * v.scale, oy: at.y - anchor.y * v.scale }
}

/**
 * Как дерево открывается после входа персонажем (по наблюдению Exile-UI): стартовый круг класса — в центре окна;
 * масштаб — «отдалено до упора».
 */
export function defaultView(client: ClientSize, anchor: Point): TreeView {
  return alignAt({ scale: zoomedOutScale(client.height), ox: 0, oy: 0 }, anchor, {
    x: client.width / 2,
    y: client.height / 2
  })
}

export interface AlignPoint {
  world: Point
  screen: Point
}

/**
 * Калибровка по двум точкам (любой зум): масштаб — отношение расстояний на экране и на дереве, сдвиг — по первой.
 * null — точки слишком близко или масштаб вне пределов (игрок навёл не на ту ноду).
 */
export function alignTwo(a: AlignPoint, b: AlignPoint, client: ClientSize): TreeView | null {
  const ds = Math.hypot(b.screen.x - a.screen.x, b.screen.y - a.screen.y)
  const dw = Math.hypot(b.world.x - a.world.x, b.world.y - a.world.y)
  if (ds < MIN_ALIGN_SPAN_PX || dw <= 0) return null
  const scale = ds / dw
  if (!scaleOk(scale, client)) return null
  return alignAt({ scale, ox: 0, oy: 0 }, a.world, a.screen)
}

/** Игрок потянул дерево мышью: игра двигает его вслед за курсором 1:1 (проверяется в игре, S38). */
export function panView(v: TreeView, dx: number, dy: number): TreeView {
  return { scale: v.scale, ox: v.ox + dx, oy: v.oy + dy }
}

/** Окно игры сменило размер, а масштаб «до упора» — сохраняем отдаление, сдвиг пересчитываем от центра. */
export function rescaleView(v: TreeView, from: ClientSize, to: ClientSize): TreeView {
  const k = to.height / from.height
  const cFrom = unproject(v, { x: from.width / 2, y: from.height / 2 })
  return alignAt({ scale: v.scale * k, ox: 0, oy: 0 }, cFrom, { x: to.width / 2, y: to.height / 2 })
}

/** В CSS-пиксели оверлея (физические точки / devicePixelRatio). */
export function viewToCss(v: TreeView, dpr: number): TreeView {
  const k = finite(dpr) && dpr > 0 ? dpr : 1
  return { scale: v.scale / k, ox: v.ox / k, oy: v.oy / k }
}

// ---------------------------------------------------------------------------
// Сохранённая калибровка (userData/build-tree.json): положение дерева по разрешению окна
// ---------------------------------------------------------------------------

export interface SavedView extends TreeView {
  /** когда сохранено (мс) — лишние разрешения вытесняются по давности */
  at: number
}

export interface TreeCalibration {
  v: 1
  /** `ширина×высота` клиентской области в физических точках → положение */
  views: Record<string, SavedView>
}

export const emptyCalibration = (): TreeCalibration => ({ v: 1, views: {} })

export function calibrationKey(client: ClientSize): string {
  return `${Math.round(client.width)}x${Math.round(client.height)}`
}

const KEY_RE = /^(\d{3,5})x(\d{3,5})$/

/** Недоверенный JSON с диска → калибровка; всё сомнительное отбрасывается. */
export function normalizeCalibration(raw: unknown): TreeCalibration {
  const out = emptyCalibration()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const views = (raw as { views?: unknown }).views
  if (!views || typeof views !== 'object' || Array.isArray(views)) return out
  const list: [string, SavedView][] = []
  for (const [key, v] of Object.entries(views as Record<string, unknown>)) {
    const m = KEY_RE.exec(key)
    if (!m || !v || typeof v !== 'object') continue
    const { scale, ox, oy, at } = v as Record<string, unknown>
    const client = { width: Number(m[1]), height: Number(m[2]) }
    if (!validClient(client) || !finite(scale) || !finite(ox) || !finite(oy) || !scaleOk(scale, client)) continue
    // сдвиг дальше десяти окон от края — мусор (дерево целиком меньше)
    const lim = 10 * Math.max(client.width, client.height)
    if (Math.abs(ox) > lim || Math.abs(oy) > lim) continue
    list.push([key, { scale, ox, oy, at: finite(at) ? at : 0 }])
  }
  list.sort((a, b) => b[1].at - a[1].at)
  for (const [key, v] of list.slice(0, MAX_SAVED_VIEWS)) out.views[key] = v
  return out
}

export function savedView(cal: TreeCalibration, client: ClientSize): TreeView | null {
  const v = cal.views[calibrationKey(client)]
  return v ? { scale: v.scale, ox: v.ox, oy: v.oy } : null
}

export function withView(cal: TreeCalibration, client: ClientSize, view: TreeView, now: number): TreeCalibration {
  return normalizeCalibration({
    v: 1,
    views: { ...cal.views, [calibrationKey(client)]: { scale: view.scale, ox: view.ox, oy: view.oy, at: now } }
  })
}
