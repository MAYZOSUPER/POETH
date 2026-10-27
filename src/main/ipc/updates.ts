import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { checkForAppUpdates, getUpdateState, installAppUpdate, postponeAppUpdate } from '../services/appUpdater'
import { getStartupState } from '../services/startup'
import type { IpcDomain } from './types'

// Домен «запуск и обновления» (S10a): экран загрузки, окно «Вышло обновление», проверка из
// настроек. Планировщики проверок запускает main/index.ts после старта (startAppUpdates,
// startDataUpdates).

function register(): void {
  ipcMain.handle(IPC.updates.state, () => getUpdateState())
  ipcMain.handle(IPC.updates.check, () => checkForAppUpdates(true))
  ipcMain.on(IPC.updates.install, () => installAppUpdate())
  ipcMain.on(IPC.updates.later, () => postponeAppUpdate())
  ipcMain.handle(IPC.startup.state, () => getStartupState())
}

export const updatesDomain: IpcDomain = { register }
