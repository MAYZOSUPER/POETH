import { BrowserWindow } from 'electron'
import path from 'path'
import { loadRendererPage } from './rendererPage'

// Companion window (бывш. «оверлей» компаса): прозрачное always-on-top окно с
// вкладками (кампания PoE2 / прайс-чек / live / regex / сделки / настройки).
// Не путать с игровым оверлеем S1 (windows/gameOverlay.ts), который цепляется к окну игры.

let win: BrowserWindow | null = null

export function getCompanionWindow(): BrowserWindow | null {
  return win
}

/** Send an event to the companion renderer (no-op when the window is gone). */
export function sendToCompanion(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function createCompanionWindow(): BrowserWindow {
  win = new BrowserWindow({
    title: 'POE Trade Helper',
    width: 820,
    height: 720,
    minWidth: 560,
    minHeight: 460,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    resizable: true,
    movable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Stay above borderless-fullscreen games.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Mouse-ignore state is established by initClickThrough() from the lock setting.

  win.once('ready-to-show', () => win?.show())

  if (process.env.OVERLAY_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  loadRendererPage(win, 'index')

  win.on('closed', () => {
    win = null
  })

  return win
}
