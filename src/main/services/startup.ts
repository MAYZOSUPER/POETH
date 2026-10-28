import { app, BrowserWindow } from 'electron'
import type { Settings, StartupState, StartupStep } from '@shared/types'
import { IPC } from '@shared/ipc'
import { AUTOSTART_ARG, loginItemSettings } from '@shared/updates'
import { onSettingsChange } from './settingsStore'
import { notifyUser } from './notify'

// Запуск «как APT / Sidekick» (S10a): шаги экрана загрузки, «Запускать вместе с Windows»,
// тост «POETH запущен — наведите на предмет и нажмите Ctrl+D». Решение, что показывать при
// старте, — чистая функция decideStartup (@shared/updates), вызывается из main/index.ts.

let state: StartupState = { step: 'settings', version: '' }

/** Запущен ли portable-exe (S10b): путь к самому POETH-Portable-….exe, не к распакованной копии. */
export function portableExe(): string | undefined {
  return process.env.PORTABLE_EXECUTABLE_FILE || undefined
}

export function wasAutostarted(): boolean {
  return process.argv.includes(AUTOSTART_ARG)
}

export function getStartupState(): StartupState {
  return { ...state, version: state.version || app.getVersion() }
}

export function setStartupStep(step: StartupStep): void {
  state = { step, version: app.getVersion() }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.events.startupState, state)
  }
}

/** Применить «Запускать вместе с Windows» (в dev — ничего: пункт указывал бы на electron.exe). */
export function applyLoginItem(s: Settings): void {
  const opts = loginItemSettings(s.startup.withWindows, app.isPackaged, portableExe())
  if (!opts) return
  try {
    app.setLoginItemSettings(opts)
  } catch (e) {
    console.warn('[startup] setLoginItemSettings failed:', e)
  }
}

/** «POETH запущен — …» с актуальным хоткеем прайс-чека. */
export async function announceStarted(s: Settings): Promise<void> {
  const accel = s.hotkeys.priceCheck?.accel
  if (accel) await notifyUser('started', { key: accel.replace(/Control/g, 'Ctrl') })
  else await notifyUser('startedNoKey')
}

// переключили «Запускать вместе с Windows» в настройках — применить сразу
onSettingsChange((next, patch) => {
  if ('startup' in patch) applyLoginItem(next)
})
