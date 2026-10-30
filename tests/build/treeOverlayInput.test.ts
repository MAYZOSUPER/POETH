import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ввод, пока наложение дерева на экране (S38): тянешь дерево левой кнопкой — наложение едет на ту же дельту,
// средняя кнопка — калибровка, колесо — «съехало», Esc/P — спрятать; над плашкой этапа и при активном оверлее
// мышь дерево не двигает. uiohook и Electron подменены — здесь только логика.

type Mouse = (p: { x: number; y: number }, button: number) => void
type Wheel = (p: { x: number; y: number }, rotation: number) => void
type Key = (k: { keycode: number; alt: boolean; ctrl: boolean; shift: boolean; meta: boolean }) => void

const hook = vi.hoisted(() => ({
  down: new Set<Mouse>(),
  up: new Set<Mouse>(),
  move: new Set<Mouse>(),
  wheel: new Set<Wheel>(),
  key: new Set<Key>(),
  active: false
}))

const sub =
  <T>(set: Set<T>) =>
  (cb: T) => {
    set.add(cb)
    return () => set.delete(cb)
  }

vi.mock('electron', () => ({ screen: { screenToDipPoint: (p: { x: number; y: number }) => p } }))
vi.mock('../../src/main/focus/gameFocus', () => ({ isOverlayActive: () => hook.active }))
vi.mock('../../src/main/windows/gameOverlay', () => ({
  // окно оверлея — поверх клиентской области игры (DIP = физические: масштаб 100 %)
  getOverlayWindow: () => ({ getContentBounds: () => ({ x: 100, y: 50, width: 1600, height: 900 }) })
}))
vi.mock('../../src/main/input/gameInput', () => ({
  hookKeycode: (name: string) => ({ Escape: 1, P: 25 })[name] ?? null,
  onGlobalMouseDown: sub(hook.down),
  onGlobalMouseUp: sub(hook.up),
  onGlobalMouseMove: sub(hook.move),
  onGlobalWheel: sub(hook.wheel),
  onGlobalKeyDown: sub(hook.key)
}))

const { startTreeInput } = await import('../../src/main/build/treeOverlayInput')

const fire = <T extends (...a: never[]) => void>(set: Set<T>, ...args: Parameters<T>) => {
  for (const cb of [...set]) cb(...args)
}
const key = (keycode: number, mods: Partial<{ alt: boolean; ctrl: boolean; shift: boolean; meta: boolean }> = {}) => ({
  keycode,
  alt: false,
  ctrl: false,
  shift: false,
  meta: false,
  ...mods
})

const CLIENT = { x: 100, y: 50, width: 1600, height: 900 }

function setup() {
  const calls = {
    pan: [] as [number, number][],
    align: [] as { x: number; y: number }[],
    zoom: [] as [{ x: number; y: number }, number][],
    close: 0
  }
  const stop = startTreeInput({
    client: () => CLIENT,
    panel: () => ({ x: 600, y: 20, width: 400, height: 40 }),
    pan: (dx, dy) => calls.pan.push([dx, dy]),
    align: (at) => calls.align.push(at),
    zoom: (at, n) => calls.zoom.push([at, n]),
    close: () => calls.close++
  })
  return { calls, stop }
}

beforeEach(() => {
  vi.useFakeTimers()
  hook.active = false
})
afterEach(() => {
  vi.useRealTimers()
})

describe('startTreeInput', () => {
  it('левая кнопка + движение: дельты склеиваются и уходят в pan; без кнопки движение не слушаем', () => {
    const { calls, stop } = setup()
    expect(hook.move.size).toBe(0)
    fire(hook.down, { x: 500, y: 400 }, 1)
    expect(hook.move.size).toBe(1)
    fire(hook.move, { x: 510, y: 395 }, 0)
    fire(hook.move, { x: 530, y: 390 }, 0)
    vi.advanceTimersByTime(20)
    expect(calls.pan).toEqual([[30, -10]])
    fire(hook.move, { x: 531, y: 391 }, 0)
    fire(hook.up, { x: 531, y: 391 }, 1)
    // отпустили — остаток сразу, движение больше не слушаем
    expect(calls.pan).toEqual([
      [30, -10],
      [1, 1]
    ])
    expect(hook.move.size).toBe(0)
    stop()
    expect(hook.down.size + hook.up.size + hook.wheel.size + hook.key.size).toBe(0)
  })

  it('средняя кнопка — калибровка в точке клиентской области', () => {
    const { calls, stop } = setup()
    fire(hook.down, { x: 1060, y: 590 }, 3)
    expect(calls.align).toEqual([{ x: 960, y: 540 }])
    stop()
  })

  it('мимо окна игры, над плашкой этапа и при активном оверлее — ничего', () => {
    const { calls, stop } = setup()
    fire(hook.down, { x: 50, y: 30 }, 3) // вне окна игры
    fire(hook.down, { x: 100 + 700, y: 50 + 30 }, 3) // над плашкой (600..1000 × 20..60 в окне оверлея)
    fire(hook.wheel, { x: 100 + 700, y: 50 + 30 }, 1)
    hook.active = true
    fire(hook.down, { x: 500, y: 400 }, 1)
    fire(hook.wheel, { x: 500, y: 400 }, 1)
    expect(calls.align).toEqual([])
    expect(calls.zoom).toEqual([])
    expect(hook.move.size).toBe(0)
    stop()
  })

  it('колесо над деревом — зум игры в точке клиентской области; пустые щелчки (0) — мимо', () => {
    const { calls, stop } = setup()
    fire(hook.wheel, { x: 500, y: 400 }, -1)
    fire(hook.wheel, { x: 500, y: 400 }, 0)
    fire(hook.wheel, { x: 600, y: 450 }, 2)
    expect(calls.zoom).toEqual([
      [{ x: 400, y: 350 }, -1],
      [{ x: 500, y: 400 }, 2]
    ])
    stop()
  })

  it('Esc и P без модификаторов — спрятать; Alt+P (наш хоткей) — нет', () => {
    const { calls, stop } = setup()
    fire(hook.key, key(25, { alt: true }))
    expect(calls.close).toBe(0)
    fire(hook.key, key(1))
    fire(hook.key, key(25))
    expect(calls.close).toBe(2)
    stop()
  })
})
