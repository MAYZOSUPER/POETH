import { app, Tray, Menu, nativeImage } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { getCompanionWindow } from './windows/companionWindow'
import { getSettings, updateSettings } from './services/settingsStore'
import { resourcesDir } from './services/questDataset'
import { reconcileTailer } from './ipc/campaign'
import { toggleCompanionVisible, toggleLock } from './ipc/app'
import { getRunningGameDef } from './gameContext'

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
  await toggleCompanionVisible()
  await refresh()
}

async function toggleLocked(): Promise<void> {
  await toggleLock()
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
  const def = getRunningGameDef()
  const win = getCompanionWindow()
  const visible = !!win && !win.isDestroyed() && win.isVisible()
  return Menu.buildFromTemplate([
    { label: `POE Trade Helper · ${def.label}`, enabled: false },
    { type: 'separator' },
    { label: visible ? 'Скрыть окно' : 'Показать окно', click: () => void toggleVisible() },
    {
      label: 'Сквозной режим (клики в игру)',
      type: 'checkbox',
      checked: s.locked,
      click: () => void toggleLocked()
    },
    ...(def.features.campaign
      ? [
          {
            label: 'Автоопределение зоны',
            type: 'checkbox' as const,
            checked: s.tailerEnabled,
            click: () => void toggleAuto()
          }
        ]
      : []),
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
  tray.setToolTip('POE Trade Helper')
  // left-click toggles the companion; right-click opens the menu (Windows default)
  tray.on('click', () => void toggleVisible())
  await refresh()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
