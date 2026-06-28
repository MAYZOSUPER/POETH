import { BrowserWindow } from 'electron'
import path from 'path'

let win: BrowserWindow | null = null

export function getOverlayWindow(): BrowserWindow | null {
  return win
}

export function createOverlayWindow(): BrowserWindow {
  win = new BrowserWindow({
    title: 'Act Compass',
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    win = null
  })

  return win
}
