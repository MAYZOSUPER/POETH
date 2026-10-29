import type { BrowserWindow, WebContentsView } from 'electron'
import path from 'path'
import { devEnv } from '../devEnv'

// Multi-page renderer (electron-vite): index.html — компаньон, overlay.html —
// игровой оверлей (S1), trade-sidebar.html — сайдбар трейд-окна (S5).
export type RendererPage = 'index' | 'overlay' | 'trade-sidebar'

/** Загрузить страницу renderer'а: dev-сервер electron-vite или собранные файлы. */
export function loadRendererPage(target: BrowserWindow | WebContentsView, page: RendererPage): void {
  const contents = target.webContents
  const file = `${page}.html`
  const dev = devEnv('ELECTRON_RENDERER_URL')
  if (dev) {
    void contents.loadURL(`${dev}/${file}`)
  } else {
    void contents.loadFile(path.join(__dirname, '../renderer', file))
  }
}
