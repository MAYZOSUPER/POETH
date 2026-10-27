import { app, Tray, Menu, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { BOOSTY_URL } from '@shared/links'
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
}

async function toggleLocked(): Promise<void> {
  await toggleLock()
}

async function toggleAuto(): Promise<void> {
  const s = await getSettings()
  const next = await updateSettings({ tailerEnabled: !s.tailerEnabled })
  await reconcileTailer(next)
}

// Tray labels follow the interface language (main has no renderer i18n).
const LABELS = {
  ru: {
    hide: 'Скрыть окно',
    show: 'Показать окно',
    lock: 'Сквозной режим (клики в игру)',
    auto: 'Автоопределение зоны',
    support: '♥ Поддержать проект',
    quit: 'Выход'
  },
  en: {
    hide: 'Hide window',
    show: 'Show window',
    lock: 'Click-through (clicks go to the game)',
    auto: 'Zone auto-detect',
    support: '♥ Support the project',
    quit: 'Quit'
  }
}

async function buildMenu(): Promise<Menu> {
  const s = await getSettings()
  const L = LABELS[s.uiLang] ?? LABELS.ru
  const def = getRunningGameDef()
  const win = getCompanionWindow()
  const visible = !!win && !win.isDestroyed() && win.isVisible()
  return Menu.buildFromTemplate([
    { label: `POE Trade Helper · ${def.label}`, enabled: false },
    { type: 'separator' },
    { label: visible ? L.hide : L.show, click: () => void toggleVisible() },
    { label: L.lock, type: 'checkbox', checked: s.locked, click: () => void toggleLocked() },
    ...(def.features.campaign
      ? [
          {
            label: L.auto,
            type: 'checkbox' as const,
            checked: s.tailerEnabled,
            click: () => void toggleAuto()
          }
        ]
      : []),
    { type: 'separator' },
    // Boosty: voluntary support, never a popup — just a menu item
    { label: L.support, click: () => void shell.openExternal(BOOSTY_URL) },
    { label: L.quit, click: () => app.quit() }
  ])
}

export async function createTray(): Promise<void> {
  const img = nativeImage.createFromPath(iconPath())
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('POE Trade Helper')
  // left-click toggles the companion; right-click opens a menu built on demand, so labels
  // (interface language) and checkboxes always reflect the current settings
  tray.on('click', () => void toggleVisible())
  tray.on('right-click', () => {
    void buildMenu().then((menu) => tray?.popUpContextMenu(menu))
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
