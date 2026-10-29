import { app, BrowserWindow, shell } from 'electron'
import { writeFileSync } from 'fs'
import path from 'path'
import type { UpdateState } from '@shared/types'
import { IPC } from '@shared/ipc'
import { loopbackUrl, releaseNotesText, releasePageUrl, shouldOfferUpdate } from '@shared/updates'
import { getSettings } from './settingsStore'
import { notifyUser } from './notify'
import { portableExe } from './portable'
import { stableReleasesOnly } from './updaterPolicy'
import { closeUpdateWindow, openUpdateWindow } from '../windows/serviceWindows'

// Автообновление приложения (S10a): electron-updater + GitHub Releases (provider github,
// MAYZOSUPER/POETH — electron-builder.yml → app-update.yml в упакованной сборке).
// Проверка при запуске и раз в 6 ч (если включено «Проверять обновления»). Новая версия →
// окно «Вышло обновление vX.Y.Z» с «что нового» → «Обновить сейчас»: загрузка с прогрессом,
// затем перезапуск с установкой (NSIS тихо, в ту же папку) | «Позже»: не предлагать эту
// версию до следующего запуска. Ошибки проверки — тихо в лог.
//
// Проверка без релизов на GitHub: POETH_UPDATE_URL=http://127.0.0.1:<порт>/ — generic-сервер
// (latest.yml + установщик), работает и в dev (forceDevUpdateConfig). Только loopback.
//
// Portable (S10b, POETH-Portable-….exe): electron-updater его не обновляет (поставил бы NSIS-версию
// в систему). Проверка та же, но «Скачать новую версию» открывает страницу релиза в браузере.

type Updater = typeof import('electron-updater').autoUpdater

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let updater: Updater | null = null
let state: UpdateState = { phase: 'idle', current: '', portable: !!portableExe() }
let snoozed: string | null = null
let timer: NodeJS.Timeout | null = null
let manualCheck = false

function short(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.split('\n')[0].slice(0, 200)
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.events.updateState, state)
  }
}

export function getUpdateState(): UpdateState {
  return { ...state }
}

function load(): Updater | null {
  if (updater) return updater
  try {
    updater = (require('electron-updater') as typeof import('electron-updater')).autoUpdater
  } catch (e) {
    console.error('[updater] electron-updater failed to load:', e)
    return null
  }
  const u = updater
  // демо 0.1.0-rc.N должно увидеть v0.1.0: только обычные релизы (updaterPolicy.ts)
  stableReleasesOnly(u)
  u.autoDownload = false
  u.autoInstallOnAppQuit = false
  u.logger = {
    info: (m?: unknown) => console.log('[updater]', m),
    warn: (m?: unknown) => console.warn('[updater]', m),
    error: (m?: unknown) => console.warn('[updater]', short(m)),
    debug: () => undefined
  }
  const dev = loopbackUrl(process.env.POETH_UPDATE_URL)
  if (dev) {
    // загрузчик читает конфиг с диска даже после setFeedURL (имя папки кэша) — в dev его нет
    const cfg = path.join(app.getPath('userData'), 'dev-app-update.yml')
    writeFileSync(cfg, `provider: generic
url: ${dev}
updaterCacheDirName: poeth-updater-test
`)
    u.updateConfigPath = cfg
    u.forceDevUpdateConfig = true
    u.setFeedURL({ provider: 'generic', url: dev })
    console.log(`[updater] test feed ${dev}`)
  }

  u.on('update-available', (info) => {
    // ручная проверка показывает окно и для отложенной версии
    const show = manualCheck || shouldOfferUpdate(state.current, info.version, snoozed)
    // описание релиза двуязычное — в окно раздел языка интерфейса
    void getSettings().then((s) => {
      setState({ phase: 'available', version: info.version, notes: releaseNotesText(info.releaseNotes, s.uiLang), error: undefined })
      if (show) openUpdateWindow()
    })
  })
  u.on('update-not-available', () => {
    setState({ phase: 'none', error: undefined })
    if (manualCheck) void notifyUser('upToDate', { version: state.current })
  })
  u.on('download-progress', (p) => setState({ phase: 'downloading', percent: Math.max(0, Math.min(100, Math.round(p.percent))) }))
  u.on('update-downloaded', () => {
    setState({ phase: 'downloaded', percent: 100 })
    // показать «Готово, перезапускаем…» и поставить: тихо (/S), с запуском после установки
    setTimeout(() => u.quitAndInstall(true, true), 800)
  })
  u.on('error', (e) => {
    if (state.phase === 'downloading') setState({ phase: 'error', error: short(e) })
    else console.warn('[updater] check failed:', short(e))
  })
  return u
}

/** Проверить обновления. manual — из настроек/трея: результат сообщаем даже без новой версии. */
export async function checkForAppUpdates(manual = false): Promise<UpdateState> {
  if (!state.current) state.current = app.getVersion()
  if (!manual && !(await getSettings()).updates.check) return getUpdateState()
  if (state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'downloaded') return getUpdateState()
  const u = load()
  if (!u) return getUpdateState()
  manualCheck = manual
  setState({ phase: 'checking', error: undefined })
  try {
    const r = await u.checkForUpdates()
    // null — апдейтер выключен (dev без тестового сервера)
    if (!r && getUpdateState().phase === 'checking') setState({ phase: 'idle' })
  } catch (e) {
    setState({ phase: manual ? 'error' : 'idle', error: manual ? short(e) : undefined })
    if (manual) void notifyUser('checkFailed', undefined, 'warn')
  } finally {
    manualCheck = false
  }
  return getUpdateState()
}

/** «Обновить сейчас» (portable — «Скачать новую версию»: страница релиза в браузере). */
export function installAppUpdate(): void {
  if (state.portable) {
    if (state.phase !== 'available' || !state.version) return
    void shell.openExternal(releasePageUrl(state.version))
    postponeAppUpdate()
    return
  }
  const u = load()
  if (!u || !(state.phase === 'available' || state.phase === 'error') || !state.version) return
  setState({ phase: 'downloading', percent: 0, error: undefined })
  u.downloadUpdate().catch((e: unknown) => setState({ phase: 'error', error: short(e) }))
}

/** «Позже»: эту версию не предлагать до следующего запуска. */
export function postponeAppUpdate(): void {
  if (state.version) snoozed = state.version
  closeUpdateWindow()
}

/** Запуск: первая проверка через delayMs (не мешать старту), дальше раз в 6 ч. */
export function startAppUpdates(delayMs = 20000): void {
  state.current = app.getVersion()
  if (timer) return
  setTimeout(() => void checkForAppUpdates(), delayMs)
  timer = setInterval(() => void checkForAppUpdates(), CHECK_EVERY_MS)
}
