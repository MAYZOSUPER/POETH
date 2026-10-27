import type { BrowserWindow } from 'electron'
import path from 'path'

// Маленькие служебные окна (S10a) — та же страница index.html с параметром ?view=…
// (src/renderer/src/main.tsx выбирает экран): отдельная страница в electron-vite не нужна.
export type RendererView = 'splash' | 'update'

export function loadRendererView(win: BrowserWindow, view: RendererView): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.webContents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html?view=${view}`)
  } else {
    void win.webContents.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { view } })
  }
}

/** Общие флаги служебного окна: без рамки, без панели задач, своё оформление в renderer. */
export function serviceWindowOptions(width: number, height: number): Electron.BrowserWindowConstructorOptions {
  return {
    width,
    height,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    center: true,
    backgroundColor: '#0f0c0a', // = --page дизайн-системы: без белой вспышки до загрузки
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  }
}
