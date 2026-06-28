import { app, Tray, Menu, nativeImage } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { getOverlayWindow } from './overlayWindow'
import { setLocked } from './clickThrough'
import { getSettings, updateSettings } from './services/settingsStore'
import { resourcesDir } from './services/questDataset'
import { reconcileTailer } from './ipcHandlers'

let tray: Tray | null = null

function iconPath(): string {
  const brand = path.join(resourcesDir(), 'brand')
  for (const f of ['app_icon.png', 'tray.png', 'tray-default.png']) {
    const p = path.join(brand, f)
    if (existsSync(p)) return p
  }
  return path.join(brand, 'tray-default.png')
}

async function toggleVisible(): Promise<void> {
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  const next = !win.isVisible()
  if (next) win.show()
  else win.hide()
  await updateSettings({ overlayVisible: next })
  await refresh()
}

async function toggleLock(): Promise<void> {
  const s = await getSettings()
  const next = await updateSettings({ locked: !s.locked })
  setLocked(next.locked)
  await refresh()
}

async function toggleAuto(): Promise<void> {
  const s = await getSettings()
  const next = await updateSettings({ tailerEnabled: !s.tailerEnabled })
  await reconcileTailer(next)
  await refresh()
}

async function buildMenu(): Promise<Menu> {
  const s = await getSettings()
  const win = getOverlayWindow()
  const visible = !!win && !win.isDestroyed() && win.isVisible()
  return Menu.buildFromTemplate([
    { label: 'Act Compass', enabled: false },
    { type: 'separator' },
    { label: visible ? 'Скрыть оверлей' : 'Показать оверлей', click: () => void toggleVisible() },
    {
      label: 'Сквозной режим (клики в игру)',
      type: 'checkbox',
      checked: s.locked,
      click: () => void toggleLock()
    },
    {
      label: 'Автоопределение зоны',
      type: 'checkbox',
      checked: s.tailerEnabled,
      click: () => void toggleAuto()
    },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() }
  ])
}

async function refresh(): Promise<void> {
  if (tray) tray.setContextMenu(await buildMenu())
}

export async function createTray(): Promise<void> {
  const img = nativeImage.createFromPath(iconPath())
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('Act Compass')
  // left-click toggles the overlay; right-click opens the menu (Windows default)
  tray.on('click', () => void toggleVisible())
  await refresh()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
