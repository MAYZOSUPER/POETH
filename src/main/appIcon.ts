import { app } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { resourcesDir } from './services/questDataset'

// Знак POETH для окон и уведомлений Windows (S10c) — вместо значка Electron в панели задач,
// Alt+Tab, заголовках окон и тостах.
// Окна: build/icon.ico (16…256 px — Windows сам берёт нужный размер, без «мыла» в мелких местах);
// в упакованной сборке он лежит в resources/brand/app_icon.ico (electron-builder.yml → extraResources),
// в dev берётся прямо из build/. Уведомления: PNG-плитка — тост Windows не показывает .ico.

const cache = new Map<string, string | undefined>()

function firstExisting(key: string, candidates: string[]): string | undefined {
  if (!cache.has(key)) cache.set(key, candidates.find((p) => existsSync(p)))
  return cache.get(key)
}

function brand(file: string): string {
  return path.join(resourcesDir(), 'brand', file)
}

/** Иконка окна (`icon` у BrowserWindow/BaseWindow); undefined — файлов нет, остаётся значок exe. */
export function windowIcon(): string | undefined {
  return firstExisting('window', [
    brand('app_icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    brand('app_icon_tile.png'),
    brand('app_icon.png')
  ])
}

/** Картинка в теле уведомления Windows (`icon` у Notification) — та же плитка, что у exe. */
export function notificationIcon(): string | undefined {
  return firstExisting('notification', [brand('app_icon_tile.png'), brand('app_icon.png')])
}
