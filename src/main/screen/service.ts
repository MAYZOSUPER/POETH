import type { GameDef } from '@shared/games'
import { screenEvents } from '@shared/ipc/screen'
import { buildLabels } from '@shared/screen/labels'
import type { ScreenFail, ScreenOverlayState, ScreenRead } from '@shared/types/screen'
import { sendToOverlay } from '../windows/gameOverlay'
import { captureScreen, saveScreenFixture, type ScreenShot } from './capture'
import { loadGamePack } from './catalog'
import { screenPrices } from './prices'
import { readScreenImage } from './reader'

// «Цены поверх окон» (S68): одно нажатие хоткея — один снимок окна игры, распознавание особой вкладки тайника и
// подписи цен у ячеек с итогом вкладки. Повторное нажатие, пока подписи на экране, — спрятать. Постоянного
// захвата нет: подписи не следят за игрой и прячутся сами через SHOW_MS (вкладку могли закрыть). В игру ничего не
// шлём. Результат распознавания (ScreenRead) доступен отдельно от подписей — readStashFromScreen / onScreenRead
// («Богатство PoE 2»: снимок вкладки вместо API тайника, которого у PoE 2 нет).

/** Сколько подписи держатся на экране. */
const SHOW_MS = 45_000

let state: ScreenOverlayState = { status: 'idle' }
let last: ScreenRead | null = null
let busy = false
let hideTimer: NodeJS.Timeout | null = null
const listeners = new Set<(r: ScreenRead) => void>()

function setState(s: ScreenOverlayState): void {
  state = s
  sendToOverlay(screenEvents.screenState, s)
}

export function getScreenState(): ScreenOverlayState {
  return state
}

export function getLastScreenRead(): ScreenRead | null {
  return last
}

/** Подписка на каждый новый результат распознавания (без подписей и цен). */
export function onScreenRead(cb: (r: ScreenRead) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function hideScreenLabels(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  if (state.status !== 'idle') setState({ status: 'idle' })
}

function fail(f: ScreenFail): void {
  setState({ status: 'fail', fail: f })
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(hideScreenLabels, 4_000)
}

/**
 * Снимок уже сделан — распознать. Эталоны игры при первом разе собираются из иконок (прогресс — в оверлей);
 * снимок за это время не устаревает: он в памяти с момента нажатия.
 */
async function recognize(def: GameDef, shot: ScreenShot, progress: boolean): Promise<ScreenRead | ScreenFail> {
  const loaded = await loadGamePack(def, progress ? (p) => setState({ status: 'busy', icons: p }) : undefined)
  if (!loaded) return 'unsupported'
  if (loaded.missing && !loaded.pack.thumbs.length) return 'no-icons'
  const t0 = performance.now()
  const r = await readScreenImage(shot.img, shot.client.height, loaded.pack)
  const read: ScreenRead = {
    game: def.id === 'poe2' ? 'poe2' : 'poe1',
    window: 'stash',
    tab: r.tab,
    scale: r.scale,
    client: shot.client,
    cells: r.cells,
    at: Date.now(),
    ms: { ...r.ms, capture: shot.ms, total: shot.ms + (performance.now() - t0) }
  }
  if (!read.cells.length) return 'not-found'
  last = read
  for (const cb of listeners) cb(read)
  return read
}

/**
 * Для других доменов («Богатство PoE 2»): снимок и распознавание вкладки без подписей. Звать только по действию
 * игрока (хоткей, кнопка в оверлее над игрой) — снимок экрана в фоне запрещён правилами этапа.
 */
export async function readStashFromScreen(def: GameDef): Promise<ScreenRead | ScreenFail> {
  const shot = captureScreen()
  if (!shot) return 'no-game'
  return recognize(def, shot, false).catch(() => 'error' as const)
}

/** Хоткей «цены поверх окон»: подписи на экране — спрятать, иначе снимок → распознавание → подписи. */
export async function onScreenHotkey(def: GameDef): Promise<void> {
  if (busy) return
  if (state.status === 'shown' || state.status === 'fail') {
    hideScreenLabels()
    return
  }
  // снимок — до любых сообщений в оверлей: подписи и тост не должны попасть в кадр
  const shot = captureScreen()
  if (!shot) {
    fail('no-game')
    return
  }
  busy = true
  try {
    void saveScreenFixture(shot).catch(() => undefined)
    setState({ status: 'busy' })
    const read = await recognize(def, shot, true)
    if (typeof read === 'string') {
      fail(read)
      return
    }
    const prices = await screenPrices(def)
    const base = prices?.base ?? (read.game === 'poe2' ? 'exalted' : 'chaos')
    const labels = buildLabels(read, prices?.priceOf ?? (() => null), { base, divine: prices?.divine ?? null })
    setState({ status: 'shown', labels, ms: read.ms })
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(hideScreenLabels, SHOW_MS)
  } catch (e) {
    console.error('[screen] read failed:', e)
    fail('error')
  } finally {
    busy = false
  }
}
