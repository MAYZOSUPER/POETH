import { BrowserWindow } from 'electron'
import { loadRendererView, serviceWindowOptions } from './rendererView'

// Служебные окна запуска и обновлений (S10a). Оба показываются без перехвата фокуса
// (showInactive): экран загрузки не мешает работе, окно обновления не выдёргивает из игры —
// игрок увидит его, когда свернёт игру.

let splash: BrowserWindow | null = null
let splashShownAt = 0
let update: BrowserWindow | null = null

const SPLASH_MIN_MS = 900

export function openSplash(): void {
  if (splash && !splash.isDestroyed()) return
  splash = new BrowserWindow({ ...serviceWindowOptions(360, 200), title: 'POETH', focusable: false })
  const w = splash
  w.once('ready-to-show', () => {
    if (!w.isDestroyed()) {
      w.showInactive()
      splashShownAt = Date.now()
    }
  })
  w.on('closed', () => {
    if (splash === w) splash = null
  })
  loadRendererView(w, 'splash')
}

/** Закрыть экран загрузки (не раньше, чем через SPLASH_MIN_MS после показа — без мелькания). */
export async function closeSplash(): Promise<void> {
  const w = splash
  if (!w || w.isDestroyed()) return
  const wait = splashShownAt ? SPLASH_MIN_MS - (Date.now() - splashShownAt) : 0
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  if (!w.isDestroyed()) w.close()
}

export function getSplashWindow(): BrowserWindow | null {
  return splash && !splash.isDestroyed() ? splash : null
}

export function openUpdateWindow(): void {
  if (update && !update.isDestroyed()) {
    update.showInactive()
    return
  }
  update = new BrowserWindow({ ...serviceWindowOptions(440, 380), title: 'POETH — обновление' })
  const w = update
  w.once('ready-to-show', () => !w.isDestroyed() && w.showInactive())
  w.on('closed', () => {
    if (update === w) update = null
  })
  loadRendererView(w, 'update')
}

export function closeUpdateWindow(): void {
  if (update && !update.isDestroyed()) update.close()
}

export function getUpdateWindow(): BrowserWindow | null {
  return update && !update.isDestroyed() ? update : null
}
