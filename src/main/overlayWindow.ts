import { BrowserWindow } from 'electron'
import path from 'path'

let win: BrowserWindow | null = null

export function getOverlayWindow(): BrowserWindow | null {
  return win
}

export function createOverlayWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 380,
    height: 820,
    minWidth: 280,
    minHeight: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
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
  // Start fully click-through; the cursor-poll loop enables interaction over panels.
  win.setIgnoreMouseEvents(true, { forward: true })

  win.once('ready-to-show', () => win?.show())

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
